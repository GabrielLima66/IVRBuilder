import { ACTION_META, actionLine } from './actionMeta';
import { buildTimeExport } from './timeUtils';

// Handles de saída sequencial (não incluir branching: d-1, d-i, d-t, open, true).
// 'closed' do TimeNode NÃO fica aqui globalmente — é tratado inline onde necessário.
const SEQ_HANDLES = new Set(['out', 'out-right', 'out-bottom', 'out-left', '']);

// Retorna true se a edge é sequential a partir do nó atual.
// Para TimeNode: 'closed' é fall-through (condição falsa) — tratado como sequencial.
function isSeqEdge(e, curNode) {
  if (SEQ_HANDLES.has(e.sourceHandle || '')) return true;
  if (curNode.type === 'time' && e.sourceHandle === 'closed') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELEÇÃO E ORDENAÇÃO DE CONTEXTOS
//
// A exportação não usa mais traversal de grafo (BFS anti-órfão).
// Todos os ContextNodes são incluídos exceto os marcados com isDraft: true.
// A ordem de exportação é definida pelo campo exportOrder (crescente).
// Empates: ordem de aparição no array nodes (criação).
// ─────────────────────────────────────────────────────────────────────────────
function getOrderedContexts(nodes) {
  return nodes
    // Exclui virtual contexts (expandedFrom): suas linhas são injetadas inline pelo compilador
    .filter((n) => n.type === 'context' && !n.data?.isDraft && !n.data?.expandedFrom)
    .sort((a, b) => {
      // exportOrder explícito tem prioridade; fallback para Infinity (vai ao final)
      const ao = (a.data?.exportOrder != null && a.data.exportOrder !== '')
        ? Number(a.data.exportOrder) : Infinity;
      const bo = (b.data?.exportOrder != null && b.data.exportOrder !== '')
        ? Number(b.data.exportOrder) : Infinity;
      return ao - bo;
      // Empate: mantém a ordem relativa do array (JS sort é estável em motores modernos)
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO HIERÁRQUICO
// ─────────────────────────────────────────────────────────────────────────────
function generateDialplanFromContexts(nodes, edges, findNode, outEdges, options = {}) {
  const includeSectionComments = options.includeSectionComments !== false;
  // highFidelityMode (padrão: true) — usa originalLine para nós não editados,
  // garantindo fidelidade literal ao .conf importado.
  // false = sempre reconstrói a partir dos campos estruturados (normaliza formatação).
  const highFidelityMode = options.highFidelityMode !== false;
  const ctxNodes = getOrderedContexts(nodes);
  // O(1) context lookup by name — used in label-reference validation (inside loops)
  const contextByName = new Map(ctxNodes.map((n) => [n.data.contextName, n]));

  const lines = [];
  const emit    = (l) => lines.push(l);
  const sep     = () => lines.push('');
  const emitSep = (l) => { if (includeSectionComments) lines.push(l); };
  const validationWarnings = []; // Coletados para sumário final

  emitSep(';;' + '='.repeat(75));
  emitSep(`;; URA Orpen :: GERADO POR orpen-ura-builder :: ${new Date().toISOString()}`);
  emitSep(`;; MODO HIERÁRQUICO :: ${ctxNodes.length} contexto(s) ativos`);
  emitSep(';;' + '='.repeat(75));
  sep();

  // Destino Asterisk de um nó (para Goto inlining)
  const jumpLabel = (t) => {
    if (!t) return null;
    if (t.type === 'context') return `${t.data.contextName},s,1`;
    if (t.type === 'menu' && t.data.contextName) return `${t.data.contextName},s,1`;
    if (t.type === 'route') {
      const m = t.data.routeMode || 'macro';
      if (m === 'fila') return null;
      if (m === 'macro') return 'rcx-ivr-transfer,s,1';
      return `${t.data.context || ''},${t.data.extension || 's'},${t.data.priority || '1'}`;
    }
    return null;
  };

  // Linhas de dialplan para um nó filho de contexto
  function linesForChild(n) {
    if (!n) return [];
    if (n.data?._commented) return n.data._origLine ? [n.data._origLine] : [];
    if (ACTION_META[n.type]) {
      const line = actionLine(n);
      if (!line) return [];
      return [n.data?.inlineComment ? `${line}  ${n.data.inlineComment}` : line];
    }

    switch (n.type) {
      case 'config': {
        const out = [];
        if (n.data.ivr)          out.push(`Set(__IVR=${n.data.ivr})`);
        if (n.data.numberDialed) out.push(`Set(__NUMBER_DIALED=\${CALLERID(num)})`);
        if (n.data.soundPath)    out.push(`Set(SOUND_PATH=${n.data.soundPath})`);
        if (n.data.agiPath)      out.push(`Set(AGI_PATH=${n.data.agiPath})`);
        if (n.data.logIvr)       out.push(`Macro(logIvr,ENTER_IVR)`);
        if (n.data.language)     out.push(`Set(CHANNEL(language)=${n.data.language})`);
        if (n.data.comment)      out.push(`Noop(## ${n.data.comment} ##)`);
        return out;
      }
      case 'time': {
        // TimeConditionNode → GotoIfTime(spec?dest,ext,pri)
        // Se condição verdadeira: Goto para dest. Se falsa: cai na próxima linha (handle 'closed').

        // Passo 1: campo trueContext no data do nó (set pelo auto-wire ou digitação)
        let dest = (n.data.trueContext || '').trim();

        // Passo 2: varredura direta em todas as edges saindo deste nó — sem filtro de handle
        // Cobre qualquer edge que aponte para um ContextNode, independente de como foi criada
        if (!dest) {
          for (let i = 0; i < edges.length; i++) {
            const ed = edges[i];
            if (ed.source !== n.id) continue;
            const tgt = findNode(ed.target);
            if (tgt && tgt.type === 'context' && tgt.data && tgt.data.contextName) {
              dest = tgt.data.contextName.trim();
              if (dest) break;
            }
          }
        }

        if (!dest) return [];

        const spec    = buildTimeExport(n.data);
        const destExt = (n.data.trueExtension || '').trim() || 's';
        const destPri = (n.data.truePriority  || '').trim() || '1';
        return [`GotoIfTime(${spec}?${dest},${destExt},${destPri})`];
      }
      case 'route': {
        const m = n.data.routeMode || 'macro';
        if (m === 'fila') {
          const opts = n.data.queueOptions ? `,${n.data.queueOptions}` : '';
          return [`Queue(${n.data.queue || ''}${opts})`];
        }
        if (m === 'macro') {
          return [
            `Set(DESTINY_TRANFER=${n.data.queue || ''})`,
            `Set(TYPE_TRANSFER=QUEUE)`,
            `Goto(rcx-ivr-transfer,s,1)`,
          ];
        }
        // _fmt preserva aridade e capitalização originais (nó importado e não editado)
        if (!n.data.isDirty && n.data._fmt?.gotoArgs?.length) {
          const app = n.data._fmt.appCasing || 'Goto';
          return [`${app}(${n.data._fmt.gotoArgs.join(',')})`];
        }
        // _argCount preserva a aridade original do Goto (1, 2 ou 3 partes)
        const ac = n.data._argCount;
        if (ac === 1) return [`Goto(${n.data.context || ''})`];
        if (ac === 2) return [`Goto(${n.data.context || ''},${n.data.extension || 's'})`];
        return [`Goto(${n.data.context || ''},${n.data.extension || 's'},${n.data.priority || '1'})`];
      }
      case 'integration': {
        const out = [];
        const vars = Array.isArray(n.data?.variables) ? n.data.variables : [];
        for (const v of vars) {
          if (v.key) out.push(`Set(${v.key}=${v.value ?? ''})`);
        }
        const script = (n.data?.agiScript || '').trim();
        if (script) {
          const params = (n.data?.agiParams || []).filter(Boolean);
          const argStr = params.length ? ',' + params.join(',') : '';
          out.push(`AGI(\${AGI_PATH}/${script}${argStr})`);
        }
        const dest = n.data?.destination || {};
        if (dest.type === 'goto' && dest.context) {
          out.push(`Goto(${dest.context},${dest.extension || 's'},${dest.priority || '1'})`);
        } else if (dest.type === 'queue' && dest.queue) {
          const opts = dest.queueOptions ? `,${dest.queueOptions}` : '';
          out.push(`Queue(${dest.queue}${opts})`);
        }
        return out;
      }
      case 'blankline':
        // Emite N linhas em branco (preserva espaçamento original)
        return Array(n.data?.count || 1).fill('');
      case 'sectioncomment':
        // Emite o comentário de seção original intacto
        return n.data?.text ? [n.data.text] : [];
      case 'commented':
        return []; // linhas comentadas não geram output no .conf
      case 'raw':
        // RawNode exporta a linha original intacta
        return n.data?.rawLine ? [n.data.rawLine] : [];
      case 'menu':
      case 'context':
      default:
        return [];
    }
  }

  // Segue cadeia de ações a partir de um nó
  function walkChainLines(startNode) {
    const out = [];
    let cur = startNode;
    let safety = 0;
    while (cur && safety++ < 80) {
      const lns = linesForChild(cur);
      for (const l of lns) out.push(l);

      if (cur.type === 'route') break;
      if (ACTION_META[cur.type] && ACTION_META[cur.type].terminal) break;

      const oe = edges.find((e) => e.source === cur.id && isSeqEdge(e, cur));
      if (!oe) break;
      const nxt = findNode(oe.target);
      if (!nxt) break;
      if (nxt.type === 'context') {
        out.push(`Goto(${nxt.data.contextName},s,1)`);
        break;
      }
      cur = nxt;
    }
    return out;
  }

  // Determina ordem de execução dentro de um contexto.
  // Fonte de verdade: data.childOrder (array de ids na ordem de execução).
  // Fallback legado: posição Y/X dos filhos (projetos sem childOrder).
  function getExecChain(ctx, children) {
    const childOrder = ctx.data?.childOrder;

    // ── Modo childOrder (novo) ───────────────────────────────────────────────
    if (childOrder && childOrder.length > 0) {
      const childById = {};
      for (const c of children) childById[c.id] = c;
      return childOrder
        .map((cid) => childById[cid])
        .filter((c) => c && c.type !== 'context');
    }

    // ── Fallback legado: edge ctx-start ou posição Y/X ───────────────────────
    const entryEdge = edges.find(
      (e) => e.source === ctx.id && e.sourceHandle === 'ctx-start'
    );
    const childSet = new Set(children.map((c) => c.id));

    if (!entryEdge) {
      return children
        .filter((c) => c.type !== 'context')
        .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    }

    const chain = [];
    let cur = findNode(entryEdge.target);
    const visited = new Set();

    while (cur && !visited.has(cur.id) && childSet.has(cur.id)) {
      visited.add(cur.id);
      if (cur.type !== 'context') chain.push(cur);
      const next = edges.find((e) => {
        if (e.source !== cur.id) return false;
        if (!isSeqEdge(e, cur)) return false;
        const t = findNode(e.target);
        return t && childSet.has(t.id);
      });
      if (!next) break;
      cur = findNode(next.target);
    }

    return chain;
  }

  // Set de contextos que serão inline no bloco GlobalConfig (BUG 8: não exportados separadamente)
  const absorbedCtxIds = new Set();

  // ── Bloco do GlobalConfigNode ────────────────────────────────────────────────
  //
  // O GlobalConfigNode SEMPRE gera seu próprio bloco [rcx-ivr-{IVR}], separado
  // de qualquer ContextNode.
  //
  // CASO A — config conectado diretamente a um ContextNode:
  //   Gera [rcx-ivr-{IVR}] com as linhas de configuração (Set/Macro/Noop)
  //   + Goto automático para o primeiro ContextNode conectado
  //   + Hangup + include => hangup-ivr
  //   O ContextNode NÃO recebe as linhas do GlobalConfig (blocos separados).
  //
  // CASO B — config standalone (sem conexão direta a ContextNode):
  //   Caminha sequencialmente por nós standalone (TimeNode, MenuNode etc.)
  //   e gera [rcx-ivr-{IVR}] com a cadeia completa, igual ao comportamento
  //   anterior para canvas sem ContextNodes.
  {
    const standaloneConfig = nodes.find((n) => n.type === 'config' && !n.parentNode);

    // _isRealGlobalConfig === false significa que o arquivo não tem bloco de config separado —
    // o primeiro contexto Asterisk É o entry point. Não emitir [rcx-ivr-XXXX] redundante.
    if (standaloneConfig && standaloneConfig.data._isRealGlobalConfig !== false) {
      // Encontra o primeiro ContextNode conectado diretamente ao GlobalConfig
      // (ctxNodes já está ordenado por `order`, então `find` retorna o mais prioritário)
      const cfgConnectedCtxNode = ctxNodes.find((ctx) =>
        edges.some((e) => e.source === standaloneConfig.id && e.target === ctx.id)
      );

      const IVR       = standaloneConfig.data.ivr || '0000';
      const ENTRY_CTX = `rcx-ivr-${IVR}`;

      if (cfgConnectedCtxNode) {
        // ── CASO A: GlobalConfigNode → ContextNode ───────────────────────────
        const firstCtxName = cfgConnectedCtxNode.data.contextName || 'rcx-ivr-home';

        emit(`[${ENTRY_CTX}]`);

        const cfgLines = linesForChild(standaloneConfig).filter(Boolean);
        let cfgLineIdx = 0;

        for (const l of cfgLines) {
          const pri = cfgLineIdx === 0 ? '1' : 'n';
          emit(`exten => s,${pri},${l}`);
          cfgLineIdx++;
        }

        if (ENTRY_CTX !== firstCtxName) {
          // Caso normal: GlobalConfig aponta para um ContextNode diferente
          const gotoPri = cfgLineIdx === 0 ? '1' : 'n';
          emit(`exten => s,${gotoPri},Goto(${firstCtxName},s,1)`);
          emit(`exten => s,n,Hangup()`);
          emit(`include => hangup-ivr`);
        } else {
          // BUG 8: o ContextNode conectado TEM O MESMO NOME do bloco de entrada
          // (acontece quando o .conf original usa [rcx-ivr-XXXX] como contexto de IVR real)
          // Inlineia os filhos desse ContextNode aqui e suprime o bloco duplicado.
          absorbedCtxIds.add(cfgConnectedCtxNode.id);
          const entryChildren  = nodes.filter((n) => n.parentNode === cfgConnectedCtxNode.id);
          const entryChain     = getExecChain(cfgConnectedCtxNode, entryChildren);
          const entryIncludes  = [];
          const entryChainClean = entryChain.filter((c) => {
            if (c.type === 'include') {
              const ln = actionLine(c);
              if (ln) entryIncludes.push(ln);
              return false;
            }
            return true;
          });
          for (const c of entryChainClean) {
            const lns = linesForChild(c);
            const nodeLbl = ACTION_META[c.type]?.supportsLabel ? (c.data.label || '').trim() : '';
            lns.forEach((l, i) => {
              if (!l) return;
              if (/^include\s*=>/i.test(l) || l.startsWith(';')) {
                emit(l);
              } else {
                const pri = cfgLineIdx === 0 ? '1' : 'n';
                const lbl = i === 0 && nodeLbl ? `(${nodeLbl})` : '';
                emit(`exten => s,${pri}${lbl},${l}`);
                cfgLineIdx++;
              }
            });
          }
          for (const incl of entryIncludes) {
            emit(incl);
          }
        }
        sep();

      } else {
        // ── CASO B: GlobalConfigNode standalone ──────────────────────────────
        // Caminha do config seguindo edges sequenciais por nós standalone.

        // Caminha do config seguindo edges sequenciais por nós standalone
        const scChain  = [];
        let   scCur    = standaloneConfig;
        const scVisited = new Set();

        while (scCur && !scVisited.has(scCur.id)) {
          scVisited.add(scCur.id);
          if (scCur.type !== 'context') scChain.push(scCur);

          const scNextEdge = edges.find((e) => {
            if (e.source !== scCur.id) return false;
            if (!isSeqEdge(e, scCur)) return false;
            const t = findNode(e.target);
            // Só segue para nós sem parentNode (standalone) e não-contextos
            return t && !t.parentNode && t.type !== 'context' && !scVisited.has(t.id);
          });
          if (!scNextEdge) break;
          scCur = findNode(scNextEdge.target);
        }

        if (scChain.length > 0) {
        emit(`[${ENTRY_CTX}]`);

        // Avisos para TimeNodes sem destino
        for (const c of scChain) {
          if (c.type !== 'time') continue;
          let hasDest = (c.data.trueContext || '').trim();
          if (!hasDest) {
            for (const ed of edges) {
              if (ed.source !== c.id) continue;
              const tgt = findNode(ed.target);
              if (tgt && tgt.type === 'context') { hasDest = tgt.data.contextName || ''; break; }
            }
          }
          if (!hasDest) emit(`;; AVISO: TimeCondition sem destino configurado — nó ignorado [id=${c.id}]`);
        }

        const scSeq   = [];
        const scMenus = [];

        for (const c of scChain) {
          if (c.type === 'menu') {
            scMenus.push(c);
            const menuLabel = (c.data.label != null ? c.data.label : 'menu').trim();
            const scAudioFiles = Array.isArray(c.data.audioFiles) && c.data.audioFiles.length > 0
              ? c.data.audioFiles
              : [c.data.greeting || '1-bem-vindo'];
            const scBgLine = `Background(${scAudioFiles.map((f) => `\${SOUND_PATH}/${f}`).join('&')})`;
            scSeq.push({ line: scBgLine, label: menuLabel });
            scSeq.push({ line: `WaitExten(${c.data.waitExten || c.data.waitSeconds || 4})` });
          } else {
            const lns = linesForChild(c);
            const nodeLbl = ACTION_META[c.type]?.supportsLabel ? (c.data.label || '').trim() : '';
            lns.forEach((l, i) => {
              if (l) scSeq.push({ line: l, label: i === 0 ? nodeLbl : '' });
            });
          }
        }

        if (scSeq.length === 0) {
          emit(`exten => s,1,Noop(## ${ENTRY_CTX} ##)`);
        } else {
          for (let i = 0; i < scSeq.length; i++) {
            const item = scSeq[i];
            const pri  = i === 0 ? '1' : 'n';
            const lbl  = item.label ? `(${item.label})` : '';
            emit(`exten => s,${pri}${lbl},${item.line}`);
          }
        }

        // DTMF para menus standalone
        for (const m of scMenus) {
          const digits     = m.data.digits || [];
          const scMenuLabel = (m.data.greetingLabel || m.data.label || '').trim() || 'menu';
          const getDigEdge = (digitId) =>
            edges.find((x) => x.source === m.id && x.sourceHandle === `d-${digitId}`);

          const emitDigSC = (digitId, tgt) => {
            if (!tgt) return;
            if (tgt.type === 'context') {
              emit(`exten => ${digitId},1,Goto(${tgt.data.contextName},s,1)`);
            } else if (tgt.type === 'route') {
              const lns = linesForChild(tgt);
              if (lns.length) {
                emit(`exten => ${digitId},1,${lns[0]}`);
                for (let i = 1; i < lns.length; i++) emit(`exten => ${digitId},n,${lns[i]}`);
              }
            } else if (ACTION_META[tgt.type]) {
              const ch = walkChainLines(tgt);
              if (ch.length) {
                emit(`exten => ${digitId},1,${ch[0]}`);
                for (let i = 1; i < ch.length; i++) emit(`exten => ${digitId},n,${ch[i]}`);
              }
            }
          };

          for (const dig of digits) {
            const e = getDigEdge(dig.id);
            if (!m.data.isDirty && m.data.rawDigitLines?.[dig.id]?.length) {
              for (const rl of m.data.rawDigitLines[dig.id]) {
                const ic = rl.inlineComment ? `  ${rl.inlineComment}` : '';
                emit(`exten => ${dig.id},${rl.priority},${rl.cmdFull}${ic}`);
              }
            } else if (e) {
              emitDigSC(dig.id, findNode(e.target));
            }
          }

          const ei = getDigEdge('i');
          if (!m.data.isDirty && m.data.rawDigitLines?.['i']?.length) {
            for (const rl of m.data.rawDigitLines['i']) {
              const ic = rl.inlineComment ? `  ${rl.inlineComment}` : '';
              emit(`exten => i,${rl.priority},${rl.cmdFull}${ic}`);
            }
          } else if (ei) {
            emitDigSC('i', findNode(ei.target));
          } else if (m.data.rawILines && m.data.rawILines.length) {
            for (const l of m.data.rawILines) emit(`exten => i,${l.priority},${l.application}(${l.args})`);
          } else {
            const inv = (m.data.invalidMacro || 'macro-menu-invalid-rcx-home').replace(/^macro-/, '');
            emit(`exten => i,1,Macro(${inv})`);
            emit(`exten => i,n,Goto(${ENTRY_CTX},s,${scMenuLabel})`);
          }
          const et = getDigEdge('t');
          if (!m.data.isDirty && m.data.rawDigitLines?.['t']?.length) {
            for (const rl of m.data.rawDigitLines['t']) {
              const ic = rl.inlineComment ? `  ${rl.inlineComment}` : '';
              emit(`exten => t,${rl.priority},${rl.cmdFull}${ic}`);
            }
          } else if (et) {
            emitDigSC('t', findNode(et.target));
          } else if (m.data.rawTLines && m.data.rawTLines.length) {
            for (const l of m.data.rawTLines) emit(`exten => t,${l.priority},${l.application}(${l.args})`);
          } else {
            const tmo = (m.data.timeoutMacro || 'macro-menu-timeout-rcx-home').replace(/^macro-/, '');
            emit(`exten => t,1,Macro(${tmo})`);
            emit(`exten => t,n,Goto(${ENTRY_CTX},s,${scMenuLabel})`);
          }
        }

          sep();
        } // fecha if (scChain.length > 0)
      } // fecha else (Caso B)
    } // fecha if (standaloneConfig)
  } // fecha bloco GlobalConfigNode

  // ── Itera contextos ──────────────────────────────────────────────────────
  for (const ctx of ctxNodes) {
    // BUG 8: pula contextos já emitidos inline no bloco GlobalConfig
    if (absorbedCtxIds.has(ctx.id)) continue;

    const ctxName  = ctx.data.contextName || 'rcx-ivr-contexto';
    const children = nodes.filter((n) => n.parentNode === ctx.id);
    const chainRaw = getExecChain(ctx, children);

    // Nós include => sempre emitidos ao FINAL do bloco (após todas as linhas exten =>)
    const pendingIncludes = [];
    const chain = chainRaw.filter((c) => {
      if (c.type === 'include') {
        const ln = actionLine(c);
        if (ln) pendingIncludes.push(ln);
        return false;
      }
      return true;
    });

    emit(`[${ctxName}]`);

    // Avisos standalone para TimeNodes sem destino resolvido (antes do sSeq)
    for (const c of chain) {
      if (c.type !== 'time') continue;
      const hasEdge = edges.some(
        (e) => e.source === c.id && (e.sourceHandle === 'true' || e.sourceHandle === 'open')
      );
      const hasDest = (c.data.trueContext || '').trim() || hasEdge;
      if (!hasDest) {
        emit(`;; AVISO: TimeCondition sem destino configurado — nó ignorado [id=${c.id}]`);
      }
    }

    // sSeq: sequência de itens a emitir para este contexto.
    // Cada item é { line, label?, isRaw? } OU { menuFlush: menuNode }.
    //
    // O marcador { menuFlush } é inserido logo após o WaitExten de cada MenuNode.
    // Durante a emissão, ao encontrar esse marcador, o compilador emite TODAS as
    // extensões DTMF (1-9, i, t) daquele menu IMEDIATAMENTE — garantindo que o
    // bloco do MenuNode seja atômico e nunca seja interrompido por linhas de outros nós.
    const sSeq = [];

    // NOTA: o GlobalConfigNode gera seu próprio bloco [rcx-ivr-{IVR}] separado
    // (ver bloco "GlobalConfigNode" acima). As linhas de configuração (Set, Macro,
    // Noop) NÃO são mais injetadas aqui — este bloco é exclusivo do ContextNode.

    for (const c of chain) {
      // Validação de nós de ação antes de emitir (pula nós comentados)
      if (!c.data?._commented && ACTION_META[c.type]?.validate) {
        const errs = ACTION_META[c.type].validate(c.data || {});
        if (errs.length > 0) {
          emit(`;; AVISO: ${c.type} [id=${c.id}] — ${errs[0]}`);
          validationWarnings.push({ type: c.type, id: c.id, error: errs[0] });
          continue; // Omite a linha inválida
        }
      }

      if (c.type === 'blankline') {
        // Linhas em branco: emitem como raw vazio, sem prefixo exten =>
        const count = c.data?.count || 1;
        for (let bi = 0; bi < count; bi++) sSeq.push({ line: '', isRaw: true });
      } else if (c.type === 'sectioncomment') {
        // Comentários de seção: emitem verbatim, sem prefixo exten =>
        if (c.data?.text) sSeq.push({ line: c.data.text, isRaw: true });
      } else if (c.type === 'menu') {
        // MenuNode → Background (múltiplos arquivos via &) + WaitExten + marcador atômico
        const menuLabel = (c.data.label != null ? c.data.label : 'menu').trim();
        const audioFiles = Array.isArray(c.data.audioFiles) && c.data.audioFiles.length > 0
          ? c.data.audioFiles
          : [c.data.greeting || '1-bem-vindo'];
        const bgLine = `Background(${audioFiles.map((f) => `\${SOUND_PATH}/${f}`).join('&')})`;
        sSeq.push({ line: bgLine, label: menuLabel });
        sSeq.push({ line: `WaitExten(${c.data.waitExten || c.data.waitSeconds || 4})` });
        sSeq.push({ menuFlush: c }); // ← flush DTMF aqui, antes do próximo nó
      } else if (
        highFidelityMode &&
        !c.data?.isDirty &&
        c.data?.originalLine &&
        !c.data?._commented
      ) {
        // Fidelidade máxima: emite a linha original exatamente como estava no .conf.
        // Cobre qualquer formatação não capturada pelos metadados (_fmt, rawArgs etc.).
        sSeq.push({ originalLine: c.data.originalLine });
      } else {
        const lns = linesForChild(c);
        const nodeLbl = ACTION_META[c.type]?.supportsLabel ? (c.data.label || '').trim() : '';
        lns.forEach((l, i) => {
          if (l) {
            // Linhas raw: nós comentados, include =>, ou linhas que já começam com ;
            const isRaw = !!(c.data?._commented || /^include\s*=>/i.test(l) || l.startsWith(';'));
            sSeq.push({ line: l, label: i === 0 ? nodeLbl : '', isRaw });
          }
        });
      }
    }

    // Verifica referências a labels em nós GotoIf dentro desta chain
    for (const c of chain) {
      if (c.type !== 'gotoif' || c.data?._commented) continue;
      const checkDest = (destStr) => {
        const parts = (destStr || '').trim().split(',');
        if (parts.length < 3) return;
        const [destCtxName, , labelOrPri] = parts;
        const trimmed = (labelOrPri || '').trim();
        if (!trimmed || /^\d+$/.test(trimmed)) return; // é prioridade numérica
        const ctxNode = contextByName.get(destCtxName.trim());
        if (!ctxNode) return; // contexto não mapeado no canvas
        const hasLabel = nodes.some(
          (n) => n.parentNode === ctxNode.id && ACTION_META[n.type]?.supportsLabel && (n.data.label || '').trim() === trimmed
        );
        if (!hasLabel) {
          emit(`;; AVISO: Goto referencia label '${trimmed}' que não foi encontrado no canvas — verifique manualmente`);
        }
      };
      checkDest(c.data.trueDestination);
      checkDest(c.data.falseDestination);
    }

    // ── Emissão ──────────────────────────────────────────────────────────────
    // Verifica se há alguma linha real além de marcadores e blank-lines puras
    const hasRealLines = sSeq.some(
      (item) => !item.menuFlush && (item.originalLine != null || item.line || item.isRaw === false)
    );

    if (!hasRealLines) {
      emit(`exten => s,1,Noop(## ${ctxName} ##)`);
    } else {
      // extenLineCount — conta TODAS as linhas exten emitidas (original + reconstruídas).
      // Garante que linhas reconstruídas após originalLines recebam prioridade 'n' corretamente.
      let extenLineCount = 0;

      // Emite TODAS as extensões DTMF de um menu imediatamente (bloco atômico).
      // Chamado pelo marcador { menuFlush } no meio do sSeq.
      const emitMenuDtmf = (m) => {
        const menuLabel    = (m.data.label != null ? m.data.label : 'menu').trim();
        // Quando label está vazio, o Goto de retorno usa prioridade 1 (sem label)
        const menuGotoPri  = menuLabel || '1';
        const digits    = m.data.digits || [];

        const handleEdge = (digitId) =>
          edges.find((x) => x.source === m.id && x.sourceHandle === `d-${digitId}`);

        const emitDigit = (digitId, target) => {
          if (!target) return false;
          if (target.type === 'context') {
            emit(`exten => ${digitId},1,Goto(${target.data.contextName},s,1)`);
            return true;
          }
          if (target.type === 'route') {
            const lns = linesForChild(target);
            if (!lns.length) return false;
            emit(`exten => ${digitId},1,${lns[0]}`);
            for (let i = 1; i < lns.length; i++) emit(`exten => ${digitId},n,${lns[i]}`);
            return true;
          }
          if (target.type === 'menu' && target.data.contextName) {
            emit(`exten => ${digitId},1,Goto(${target.data.contextName},s,1)`);
            return true;
          }
          if (ACTION_META[target.type]) {
            const dtmfChain = walkChainLines(target);
            if (!dtmfChain.length) return false;
            emit(`exten => ${digitId},1,${dtmfChain[0]}`);
            for (let i = 1; i < dtmfChain.length; i++) emit(`exten => ${digitId},n,${dtmfChain[i]}`);
            return true;
          }
          return false;
        };

        // ── Helper: injeta virtual context inline (sem bloco [nome] próprio) ────
        const emitVirtualCtxInline = (virtualCtx, extId, logIvrLabel) => {
          const childIds  = virtualCtx.data.childOrder || [];
          const children  = childIds.map((cid) => findNode(cid)).filter(Boolean);
          if (!children.length) return;
          let pri1 = true;
          const emitLn = (line) => {
            if (!line) return;
            emit(`exten => ${extId},${pri1 ? '1' : 'n'},${line}`);
            pri1 = false;
          };
          emitLn(`Macro(sayDigit,\${EXTEN})`);
          const logLbl = logIvrLabel || `${ctxName}-op-${extId}`;
          emitLn(`Macro(logIvr,ENTER_CONTEXT,${logLbl})`);
          for (const child of children) {
            for (const ln of linesForChild(child)) emitLn(ln);
          }
        };


        for (const dig of digits) {
          // ── Modo rico: usa actions[] e finalDestination stored no dig (importação) ──
          const hasStoredData = Array.isArray(dig.actions)
            ? (dig.actions.length > 0 || dig.finalDestination != null)
            : false;

          if (hasStoredData) {
            if (dig.comment) emit(`;${dig.comment}`);
            emit(`exten => ${dig.id},1,Macro(sayDigit,\${EXTEN})`);
            // BUG 2: usa logIvrLabel original preservado no import; gera um padrão se ausente
            const logIvrLbl = dig.logIvrLabel || `${ctxName}-op-${dig.id}`;
            emit(`exten => ${dig.id},n,Macro(logIvr,ENTER_CONTEXT,${logIvrLbl})`);
            for (const action of (dig.actions || [])) {
              let ln = null;
              if (action.type === 'time') {
                // GotoIfTime — não está em actionLine, emite diretamente
                const dest = (action.data.trueContext || '').trim();
                if (dest) {
                  const spec    = buildTimeExport(action.data);
                  const dstExt  = (action.data.trueExtension || '').trim() || 's';
                  const dstPri  = (action.data.truePriority  || '').trim() || '1';
                  ln = `GotoIfTime(${spec}?${dest},${dstExt},${dstPri})`;
                }
              } else if (action.type === 'raw') {
                // Raw — linha literal do Asterisk, emitida sem transformação
                ln = (action.data?.rawLine || '').trim() || null;
              } else {
                ln = actionLine({ type: action.type, data: action.data });
              }
              if (ln) emit(`exten => ${dig.id},n,${ln}`);
            }
            const fd = dig.finalDestination;
            if (fd?.type === 'context') {
              // BUG 4: preserva aridade original do Goto
              const argCount = fd.argCount || 3;
              if (argCount === 1) {
                emit(`exten => ${dig.id},n,Goto(${fd.contextName})`);
              } else if (argCount === 2) {
                emit(`exten => ${dig.id},n,Goto(${fd.contextName},${fd.ext})`);
              } else {
                emit(`exten => ${dig.id},n,Goto(${fd.contextName},${fd.ext || 's'},${fd.pri || '1'})`);
              }
            } else if (fd?.type === 'queue') {
              emit(`exten => ${dig.id},n,Goto(${fd.ctx},${fd.ext},${fd.pri})`);
            } else if (fd?.type === 'queue_direct') {
              // Chamada direta Queue() — configurado via mini-editor
              const opts = fd.queueOptions ? `,${fd.queueOptions}` : '';
              emit(`exten => ${dig.id},n,Queue(${fd.queue || ''}${opts})`);
            } else if (fd?.type === 'playback_final') {
              // Playback como destino final (sem Goto após)
              emit(`exten => ${dig.id},n,Playback(\${SOUND_PATH}/${fd.filename || ''})`);
            } else if (fd?.type === 'dial') {
              const tmo = fd.timeout ? `,${fd.timeout}` : '';
              emit(`exten => ${dig.id},n,Dial(${fd.target}${tmo})`);
            } else if (fd?.type === 'hangup') {
              emit(`exten => ${dig.id},n,Hangup(${fd.causeCode || ''})`);
            } else {
              // Sem finalDest stored: tenta edge como fallback
              const e = handleEdge(dig.id);
              if (e) emitDigit(dig.id, findNode(e.target));
            }
            continue;
          }

          // ── Modo legado: segue edges do canvas ──────────────────────────────
          const e = handleEdge(dig.id);
          if (!e) continue;
          const eTgt = findNode(e.target);
          if (eTgt?.type === 'context' && eTgt.data?.expandedFrom === m.id) {
            emitVirtualCtxInline(eTgt, dig.id, dig.logIvrLabel);
          } else {
            emitDigit(dig.id, eTgt);
          }
        }

        // ── Helper: emite actions de uma opção i/t ────────────────────────────
        const emitOptActions = (opt, extId) => {
          let pri1 = true;
          for (const action of (opt.actions || [])) {
            let ln = null;
            if (action.type === 'time') {
              const dest = (action.data.trueContext || '').trim();
              if (dest) {
                const spec   = buildTimeExport(action.data);
                const dstExt = (action.data.trueExtension || '').trim() || 's';
                const dstPri = (action.data.truePriority  || '').trim() || '1';
                ln = `GotoIfTime(${spec}?${dest},${dstExt},${dstPri})`;
              }
            } else {
              ln = actionLine({ type: action.type, data: action.data });
            }
            if (ln) { emit(`exten => ${extId},${pri1 ? '1' : 'n'},${ln}`); pri1 = false; }
          }
          return !pri1;
        };

        const emitGotoAridade = (fd, extId) => {
          if (!fd) return false;
          if (fd.type === 'context') {
            const argCount = fd.argCount || 3;
            if (argCount === 1)      emit(`exten => ${extId},n,Goto(${fd.contextName})`);
            else if (argCount === 2) emit(`exten => ${extId},n,Goto(${fd.contextName},${fd.ext})`);
            else                     emit(`exten => ${extId},n,Goto(${fd.contextName},${fd.ext || 's'},${fd.pri || '1'})`);
            return true;
          }
          if (fd.type === 'queue') { emit(`exten => ${extId},n,Goto(${fd.ctx},${fd.ext},${fd.pri})`); return true; }
          if (fd.type === 'dial')  { emit(`exten => ${extId},n,Dial(${fd.target}${fd.timeout ? ',' + fd.timeout : ''})`); return true; }
          if (fd.type === 'hangup'){ emit(`exten => ${extId},n,Hangup(${fd.causeCode || ''})`); return true; }
          return false;
        };

        // ── Opção i (inválido) ────────────────────────────────────────────────
        const iOpt = m.data.invalidOption;
        const ei   = handleEdge('i');
        const hasStoredI = iOpt && (iOpt.actions?.length > 0 || iOpt.finalDestination != null);
        if (hasStoredI) {
          if (iOpt.comment) emit(`;${iOpt.comment}`);
          emitOptActions(iOpt, 'i');
          const ifd = iOpt.finalDestination;
          if (!emitGotoAridade(ifd, 'i')) emit(`exten => i,n,Goto(${ctxName},s,${menuGotoPri})`);
        } else if (ei) {
          const eiTgt = findNode(ei.target);
          if (eiTgt?.type === 'context' && eiTgt.data?.expandedFrom === m.id) {
            emitVirtualCtxInline(eiTgt, 'i', iOpt?.logIvrLabel);
          } else {
            emitDigit('i', eiTgt);
          }
        } else {
          const inv = m.data.invalidMacroName || (m.data.invalidMacro || 'macro-menu-invalid-rcx-home').replace(/^macro-/, '');
          emit(`exten => i,1,Macro(${inv})`);
          emit(`exten => i,n,Goto(${ctxName},s,${menuGotoPri})`);
        }

        // ── Opção t (timeout) ────────────────────────────────────────────────
        const tOpt = m.data.timeoutOption;
        const et   = handleEdge('t');
        const hasStoredT = tOpt && (tOpt.actions?.length > 0 || tOpt.finalDestination != null);
        if (hasStoredT) {
          if (tOpt.comment) emit(`;${tOpt.comment}`);
          emitOptActions(tOpt, 't');
          const tfd = tOpt.finalDestination;
          if (!emitGotoAridade(tfd, 't')) emit(`exten => t,n,Goto(${ctxName},s,${menuGotoPri})`);
        } else if (et) {
          const etTgt = findNode(et.target);
          if (etTgt?.type === 'context' && etTgt.data?.expandedFrom === m.id) {
            emitVirtualCtxInline(etTgt, 't', tOpt?.logIvrLabel);
          } else {
            emitDigit('t', etTgt);
          }
        } else {
          // BUG 4: usa timeoutMacroName (nome exato sem replace) se disponível
          const tmo = m.data.timeoutMacroName || (m.data.timeoutMacro || 'macro-menu-timeout-rcx-home').replace(/^macro-/, '');
          emit(`exten => t,1,Macro(${tmo})`);
          emit(`exten => t,n,Goto(${ctxName},s,${menuGotoPri})`);
        }
      };

      for (const item of sSeq) {
        if (item.menuFlush) {
          // Bloco atômico: emite DTMF do menu imediatamente após o WaitExten
          emitMenuDtmf(item.menuFlush);
        } else if (item.originalLine != null) {
          // Fidelidade máxima: emite a linha original verbatim (prioridade já embutida)
          emit(item.originalLine);
          extenLineCount++; // conta para que linhas reconstruídas seguintes usem 'n'
        } else if (item.isRaw) {
          // Linhas raw (include =>, blank lines, section comments, etc.) sem prefixo exten =>
          emit(item.line);
        } else {
          // Linha reconstruída: deriva prioridade pela contagem de exten já emitidas
          const pri = extenLineCount === 0 ? '1' : 'n';
          const lbl = item.label ? `(${item.label})` : '';
          emit(`exten => s,${pri}${lbl},${item.line}`);
          extenLineCount++;
        }
      }
    }

    // Diretivas include => sempre ao final do bloco (convenção Asterisk)
    for (const incl of pendingIncludes) {
      emit(incl);
    }

    sep();
  }

  // Sumário de validação ao final do .conf
  if (validationWarnings.length > 0) {
    sep();
    emit(';; === SUMÁRIO DE VALIDAÇÃO ===');
    emit(`;; ${validationWarnings.length} nó(s) com erro omitidos do dialplan`);
    emit(';; Ver avisos inline acima para detalhes');
  }

  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO LEGADO — fluxo linear (sem Context Nodes)
// ─────────────────────────────────────────────────────────────────────────────
function generateDialplanLegacy(nodes, edges, findNode, outEdges) {
  const config = nodes.find((n) => n.type === 'config');
  if (!config) return '; ERRO: nenhum nó de configuração encontrado.\n';

  const IVR = config.data.ivr || '0000';
  const ENTRY_CTX = `rcx-ivr-${IVR}`;
  const lines = [];
  const generatedContexts = new Set();
  const actionChainCtxs  = [];

  const emit  = (l) => lines.push(l);
  const emitS = (s) => emit(`exten => s,n,${s}`);
  const sep   = () => emit('');
  const hr    = (t) => {
    emit(';;' + '#'.repeat(75));
    emit(';;' + ' '.repeat(Math.max(0, 36 - t.length / 2)) + t);
    emit(';;' + '#'.repeat(75));
  };

  emit(';;' + '='.repeat(75));
  emit(`;; URA Orpen :: GERADO POR orpen-ura-builder :: ${new Date().toISOString()}`);
  emit(`;; __IVR=${IVR}  ::  contexto de entrada: [${ENTRY_CTX}]`);
  emit(';;' + '='.repeat(75));
  sep();

  emit(`[${ENTRY_CTX}]`);
  emit(`exten => s,1,Set(__IVR=${IVR})`);
  if (config.data.numberDialed) emitS(`Set(__NUMBER_DIALED=\${CALLERID(num)})`);
  emitS(`Set(SOUND_PATH=${config.data.soundPath})`);
  emitS(`Set(AGI_PATH=${config.data.agiPath})`);
  if (config.data.logIvr) emitS(`Macro(logIvr,ENTER_IVR)`);
  emitS(`Set(CHANNEL(language)=${config.data.language || 'pt_BR'})`);
  if (config.data.comment) emitS(`Noop(## ${config.data.comment} ##)`);
  sep();

  // Caminha do config → time* → menu
  const chain = [];
  let cursor = config;
  let safety = 0;
  while (cursor && safety++ < 40) {
    const next = outEdges(cursor.id)[0];
    if (!next) break;
    const tgt = findNode(next.target);
    if (!tgt) break;
    if (tgt.type === 'time') {
      chain.push({ node: tgt });
      const passEdge = outEdges(tgt.id, 'closed')[0];
      if (!passEdge) { cursor = tgt; break; }
      cursor = findNode(passEdge.target) || tgt;
      if (cursor && cursor.type === 'menu') break;
    } else {
      break;
    }
  }

  const times = chain.filter((c) => c.node.type === 'time').map((c) => c.node);
  if (times.length) {
    hr('CONDICOES DE HORARIO');
    for (const t of times) {
      let dest = (t.data.trueContext || '').trim();
      if (!dest) {
        for (let i = 0; i < edges.length; i++) {
          const ed = edges[i];
          if (ed.source !== t.id) continue;
          const tgt = findNode(ed.target);
          if (tgt && tgt.type === 'context' && tgt.data && tgt.data.contextName) {
            dest = tgt.data.contextName.trim();
            if (dest) break;
          }
        }
      }
      if (!dest) {
        emit(`;; AVISO: TimeCondition sem destino configurado — nó ignorado [id=${t.id}]`);
        continue;
      }
      emit(`exten => s,n,GotoIfTime(${buildTimeExport(t.data)}?${dest},s,1) ;; ${t.data.label || ''}`);
    }
    sep();
  }

  const rootMenu = cursor && cursor.type === 'menu' ? cursor : nodes.find((n) => n.type === 'menu');
  if (rootMenu) {
    emitS(`Goto(${rootMenu.data.contextName || 'rcx-ivr-home'},s,1)`);
    sep();
    emitS(`Hangup()`);
    emit(`include => hangup-ivr`);
    sep();
  } else {
    emitS(`Hangup()`);
    emit(`include => hangup-ivr`);
    sep();
  }

  const menuQueue = [];
  const seenMenu  = new Set();
  if (rootMenu) { menuQueue.push(rootMenu); seenMenu.add(rootMenu.id); }

  const routeLines = (n) => {
    const m = n.data.routeMode || 'macro';
    if (m === 'fila') {
      const opts = n.data.queueOptions ? `,${n.data.queueOptions}` : '';
      return [`Queue(${n.data.queue || ''}${opts})`];
    }
    if (m === 'macro') {
      return [
        `Set(DESTINY_TRANFER=${n.data.queue || ''})`,
        `Set(TYPE_TRANSFER=QUEUE)`,
        `Goto(rcx-ivr-transfer,s,1)`,
      ];
    }
    return [`Goto(${n.data.context || ''},${n.data.extension || 's'},${n.data.priority || '1'})`];
  };

  while (menuQueue.length) {
    const m   = menuQueue.shift();
    const CTX = m.data.contextName || `rcx-ivr-${IVR}-menu`;
    if (generatedContexts.has(CTX)) continue;
    generatedContexts.add(CTX);

    emit(`[${CTX}]`);
    emit(`exten => s,1,Set(__IVR=${IVR})`);
    emitS(`Macro(logIvr,ENTER_IVR)`);
    emitS(`Set(CHANNEL(language)=pt_BR)`);
    emitS(`Noop(## URA ${IVR} :: ${CTX} ##)`);
    emit(`exten => s,n(menu),Background(${m.data.greeting || '1-bem-vindo'})`);
    emitS(`WaitExten(${m.data.waitExten || 4})`);
    sep();

    for (const d of (m.data.digits || [])) {
      const e = edges.find((x) => x.source === m.id && x.sourceHandle === `d-${d.id}`);
      emit(`exten => ${d.id},1,Noop(# OP \${EXTEN} - ${d.label || ''} #)`);
      emit(`exten => ${d.id},n,Macro(logIvr,ENTER_CONTEXT,${CTX}-op-${d.id})`);
      if (!e) {
        emit(`exten => ${d.id},n,Playback(\${SOUND_PATH}/${m.data.invalidSound || 'opcao-invalida'})`);
        emit(`exten => ${d.id},n,Goto(${CTX},s,1)`);
        sep();
        continue;
      }
      const tgt = findNode(e.target);
      if (!tgt) { sep(); continue; }

      if (tgt.type === 'menu') {
        emit(`exten => ${d.id},n,Goto(${tgt.data.contextName || 'rcx-ivr-sub'},s,1)`);
        if (!seenMenu.has(tgt.id)) { seenMenu.add(tgt.id); menuQueue.push(tgt); }
      } else if (tgt.type === 'route') {
        const lns = routeLines(tgt);
        emit(`exten => ${d.id},n,${lns[0]}`);
        for (let i = 1; i < lns.length; i++) emit(`exten => ${d.id},n,${lns[i]}`);
      } else if (tgt.type === 'time') {
        const subCtx = `rcx-ivr-${IVR}-${d.id}`;
        emit(`exten => ${d.id},n,Goto(${subCtx},s,1)`);
        tgt.__subCtx = subCtx;
      } else if (ACTION_META[tgt.type]) {
        const subCtx = `rcx-ivr-${IVR}-${d.id}`;
        emit(`exten => ${d.id},n,Goto(${subCtx},s,1)`);
        actionChainCtxs.push({ ctx: subCtx, start: tgt, parentCtx: CTX });
      }
      sep();
    }

    emit(`exten => i,1,Macro(${(m.data.invalidMacro || 'macro-menu-invalid-rcx-home').replace(/^macro-/, '')})`);
    emit(`exten => i,n,Goto(${CTX},s,1)`);
    sep();
    emit(`exten => t,1,Macro(${(m.data.timeoutMacro || 'macro-menu-timeout-rcx-home').replace(/^macro-/, '')})`);
    emit(`exten => t,n,Goto(${CTX},s,1)`);
    sep();
    emitS(`Hangup()`);
    emit(`include => hangup-ivr`);
    sep();
  }

  if (actionChainCtxs.length) {
    hr('CADEIAS DE ACOES (sub-contextos)');
    for (const ac of actionChainCtxs) {
      if (generatedContexts.has(ac.ctx)) continue;
      generatedContexts.add(ac.ctx);

      emit(`[${ac.ctx}]`);
      emit(`exten => s,1,Macro(logIvr,ENTER_CONTEXT,${ac.ctx})`);

      let cur = ac.start;
      let sf  = 0;
      let terminated = false;

      while (cur && sf++ < 50) {
        if (ACTION_META[cur.type]) {
          const ln = actionLine(cur);
          if (ln) emitS(ln);
          if (ACTION_META[cur.type].terminal) { terminated = true; break; }

          const oe = edges.find((e) => e.source === cur.id && isSeqEdge(e, cur));
          if (!oe) break;
          const nxt = findNode(oe.target);
          if (!nxt) break;

          if (nxt.type === 'menu') {
            emitS(`Goto(${nxt.data.contextName || 'rcx-ivr-home'},s,1)`);
            if (!seenMenu.has(nxt.id)) { seenMenu.add(nxt.id); menuQueue.push(nxt); }
            terminated = true; break;
          }
          if (nxt.type === 'route') {
            for (const ln of routeLines(nxt)) emitS(ln);
            terminated = true; break;
          }
          if (nxt.type === 'time') {
            const passCtx = `rcx-ivr-${IVR}-cond-${nxt.id.slice(-4)}`;
            emitS(`Goto(${passCtx},s,1)`);
            nxt.__subCtx = passCtx;
            terminated = true; break;
          }
          cur = nxt;
        } else {
          break;
        }
      }

      if (!terminated) emitS(`Hangup()`);
      emit(`include => hangup-ivr`);
      sep();
    }
  }

  const menus = nodes.filter((n) => n.type === 'menu');
  const macros = new Map();
  for (const m of menus) {
    const inv = m.data.invalidMacro || 'macro-menu-invalid-rcx-home';
    const tmo = m.data.timeoutMacro || 'macro-menu-timeout-rcx-home';
    macros.set(inv, { kind: 'invalid', sound: m.data.invalidSound || 'opcao-invalida', retry: m.data.maxRetry || 2, goto: m.data.retryGoto || 'ivr-encerramento,s,1' });
    macros.set(tmo, { kind: 'timeout', retry: m.data.maxRetry || 2, goto: m.data.retryGoto || 'ivr-encerramento,s,1' });
  }

  if (macros.size) {
    emit(';*'.repeat(36));
    for (const [name, info] of macros) {
      emit(`[${name}]`);
      if (info.kind === 'timeout') {
        emit(`exten => s,1,Set(TRY_TIMEOUT_MENU=\${MATH(\${TRY_TIMEOUT_MENU} + 1,int)})`);
        emit(`exten => s,n,GotoIf($["\${TRY_TIMEOUT_MENU}" >= "${info.retry}"]?${info.goto})`);
      } else {
        emit(`exten => s,1,Set(TRY_INV_MENU=\${MATH(\${TRY_INV_MENU} + 1,int)})`);
        emit(`exten => s,n,GotoIf($["\${TRY_INV_MENU}" >= "${info.retry}"]?${info.goto})`);
        emit(`exten => s,n,Background(\${SOUND_PATH}/${info.sound})`);
      }
      emit(`include => hangup-ivr`);
      sep();
      emit(';*'.repeat(36));
    }
  }

  nodes.forEach((n) => { delete n.__subCtx; delete n.__origin; });

  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {Object[]} nodes
 * @param {Object[]} edges
 * @param {{ includeSectionComments?: boolean }} [options]
 */
export function generateDialplan(nodes, edges, options = {}) {
  // O(1) node lookup — replaces O(n) nodes.find() across all inner loops
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findNode = (id) => nodeById.get(id);

  // O(k) edge lookup per source — replaces O(m) edges.filter() per call
  const edgesBySource = new Map();
  for (const e of edges) {
    const list = edgesBySource.get(e.source);
    if (list) list.push(e); else edgesBySource.set(e.source, [e]);
  }
  const outEdges = (id, handle) => {
    const list = edgesBySource.get(id) || [];
    return handle ? list.filter((e) => e.sourceHandle === handle) : list;
  };

  if (nodes.some((n) => n.type === 'context')) {
    return generateDialplanFromContexts(nodes, edges, findNode, outEdges, options);
  }
  return generateDialplanLegacy(nodes, edges, findNode, outEdges, options);
}
