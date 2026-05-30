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
    .filter((n) => n.type === 'context' && !n.data?.isDraft)
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
  const ctxNodes = getOrderedContexts(nodes);

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
      if (m === 'macro') return 'orpen-ivr-transfer,s,1';
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
        // TimeConditionNode → GotoIfTime(spec?dest,s,1)
        // Se condição verdadeira: Goto para dest. Se falsa: cai na próxima linha (handle 'closed').

        // Passo 1: campo trueContext no data do nó (set pelo auto-wire ou digitação)
        let dest = (n.data.trueContext || '').trim();

        // Passo 2: varredura direta em todas as edges saindo deste nó — sem filtro de handle
        // Cobre qualquer edge que aponte para um ContextNode, independente de como foi criada
        if (!dest) {
          for (let i = 0; i < edges.length; i++) {
            const ed = edges[i];
            if (ed.source !== n.id) continue;
            const tgt = nodes.find((x) => x.id === ed.target); // findNode direto no array
            if (tgt && tgt.type === 'context' && tgt.data && tgt.data.contextName) {
              dest = tgt.data.contextName.trim();
              if (dest) break;
            }
          }
        }

        if (!dest) return [];

        const spec = buildTimeExport(n.data);
        return [`GotoIfTime(${spec}?${dest},s,1)`];
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
            `Goto(orpen-ivr-transfer,s,1)`,
          ];
        }
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

  // ── Bloco do GlobalConfigNode ────────────────────────────────────────────────
  //
  // O GlobalConfigNode SEMPRE gera seu próprio bloco [orpen-ivr-{IVR}], separado
  // de qualquer ContextNode.
  //
  // CASO A — config conectado diretamente a um ContextNode:
  //   Gera [orpen-ivr-{IVR}] com as linhas de configuração (Set/Macro/Noop)
  //   + Goto automático para o primeiro ContextNode conectado
  //   + Hangup + include => hangup-ivr
  //   O ContextNode NÃO recebe as linhas do GlobalConfig (blocos separados).
  //
  // CASO B — config standalone (sem conexão direta a ContextNode):
  //   Caminha sequencialmente por nós standalone (TimeNode, MenuNode etc.)
  //   e gera [orpen-ivr-{IVR}] com a cadeia completa, igual ao comportamento
  //   anterior para canvas sem ContextNodes.
  {
    const standaloneConfig = nodes.find((n) => n.type === 'config' && !n.parentNode);

    if (standaloneConfig) {
      // Encontra o primeiro ContextNode conectado diretamente ao GlobalConfig
      // (ctxNodes já está ordenado por `order`, então `find` retorna o mais prioritário)
      const cfgConnectedCtxNode = ctxNodes.find((ctx) =>
        edges.some((e) => e.source === standaloneConfig.id && e.target === ctx.id)
      );

      const IVR       = standaloneConfig.data.ivr || '0000';
      const ENTRY_CTX = `orpen-ivr-${IVR}`;

      if (cfgConnectedCtxNode) {
        // ── CASO A: GlobalConfigNode → ContextNode ───────────────────────────
        // Gera bloco próprio com config + Goto automático + Hangup + include.

        emit(`[${ENTRY_CTX}]`);

        const cfgLines = linesForChild(standaloneConfig).filter(Boolean);
        let cfgLineIdx = 0;

        for (const l of cfgLines) {
          const pri = cfgLineIdx === 0 ? '1' : 'n';
          emit(`exten => s,${pri},${l}`);
          cfgLineIdx++;
        }

        // Goto automático para o primeiro ContextNode conectado
        const firstCtxName = cfgConnectedCtxNode.data.contextName || 'orpen-ivr-home';
        const gotoPri = cfgLineIdx === 0 ? '1' : 'n';
        emit(`exten => s,${gotoPri},Goto(${firstCtxName},s,1)`);
        emit(`exten => s,n,Hangup()`);
        emit(`include => hangup-ivr`);
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
              const tgt = nodes.find((x) => x.id === ed.target);
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
            const menuLabel = (c.data.label || '').trim() || 'menu';
            scSeq.push({ line: `Background(${c.data.greeting || '1-bem-vindo'})`, label: menuLabel });
            scSeq.push({ line: `WaitExten(${c.data.waitExten || 4})` });
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
            if (e) emitDigSC(dig.id, findNode(e.target));
          }

          const ei = getDigEdge('i');
          if (ei) {
            emitDigSC('i', findNode(ei.target));
          } else if (m.data.rawILines && m.data.rawILines.length) {
            for (const l of m.data.rawILines) emit(`exten => i,${l.priority},${l.application}(${l.args})`);
          } else {
            const inv = (m.data.invalidMacro || 'macro-menu-invalid-orpen-home').replace(/^macro-/, '');
            emit(`exten => i,1,Macro(${inv})`);
            emit(`exten => i,n,Goto(${ENTRY_CTX},s,${scMenus.length ? 'menu' : '1'})`);
          }
          const et = getDigEdge('t');
          if (et) {
            emitDigSC('t', findNode(et.target));
          } else if (m.data.rawTLines && m.data.rawTLines.length) {
            for (const l of m.data.rawTLines) emit(`exten => t,${l.priority},${l.application}(${l.args})`);
          } else {
            const tmo = (m.data.timeoutMacro || 'macro-menu-timeout-orpen-home').replace(/^macro-/, '');
            emit(`exten => t,1,Macro(${tmo})`);
            emit(`exten => t,n,Goto(${ENTRY_CTX},s,${scMenus.length ? 'menu' : '1'})`);
          }
        }

          sep();
        } // fecha if (scChain.length > 0)
      } // fecha else (Caso B)
    } // fecha if (standaloneConfig)
  } // fecha bloco GlobalConfigNode

  // ── Itera contextos ──────────────────────────────────────────────────────
  for (const ctx of ctxNodes) {
    const ctxName  = ctx.data.contextName || 'orpen-ivr-contexto';
    const children = nodes.filter((n) => n.parentNode === ctx.id);
    const chain    = getExecChain(ctx, children);

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

    // NOTA: o GlobalConfigNode gera seu próprio bloco [orpen-ivr-{IVR}] separado
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

      if (c.type === 'menu') {
        // MenuNode → Background + WaitExten + marcador atômico (DTMF emitido inline)
        const menuLabel = (c.data.label || '').trim() || 'menu';
        sSeq.push({
          line: `Background(${c.data.greeting || '1-bem-vindo'})`,
          label: menuLabel,
        });
        sSeq.push({ line: `WaitExten(${c.data.waitExten || 4})` });
        sSeq.push({ menuFlush: c }); // ← flush DTMF aqui, antes do próximo nó
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
        const ctxNode = nodes.find((n) => n.type === 'context' && n.data.contextName === destCtxName.trim());
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
    // Verifica se há alguma linha real além dos marcadores menuFlush
    const hasRealLines = sSeq.some((item) => !item.menuFlush);

    if (!hasRealLines) {
      emit(`exten => s,1,Noop(## ${ctxName} ##)`);
    } else {
      let seqIdx = 0;

      // Emite TODAS as extensões DTMF de um menu imediatamente (bloco atômico).
      // Chamado pelo marcador { menuFlush } no meio do sSeq.
      const emitMenuDtmf = (m) => {
        const menuLabel = (m.data.label || '').trim() || 'menu';
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

        for (const dig of digits) {
          const e = handleEdge(dig.id);
          if (!e) continue;
          emitDigit(dig.id, findNode(e.target));
        }

        const ei = handleEdge('i');
        if (ei) {
          emitDigit('i', findNode(ei.target));
        } else if (m.data.rawILines && m.data.rawILines.length) {
          for (const l of m.data.rawILines) {
            emit(`exten => i,${l.priority},${l.application}(${l.args})`);
          }
        } else {
          const inv = (m.data.invalidMacro || 'macro-menu-invalid-orpen-home').replace(/^macro-/, '');
          emit(`exten => i,1,Macro(${inv})`);
          emit(`exten => i,n,Goto(${ctxName},s,${menuLabel})`);
        }
        const et = handleEdge('t');
        if (et) {
          emitDigit('t', findNode(et.target));
        } else if (m.data.rawTLines && m.data.rawTLines.length) {
          for (const l of m.data.rawTLines) {
            emit(`exten => t,${l.priority},${l.application}(${l.args})`);
          }
        } else {
          const tmo = (m.data.timeoutMacro || 'macro-menu-timeout-orpen-home').replace(/^macro-/, '');
          emit(`exten => t,1,Macro(${tmo})`);
          emit(`exten => t,n,Goto(${ctxName},s,${menuLabel})`);
        }
      };

      for (const item of sSeq) {
        if (item.menuFlush) {
          // Bloco atômico: emite DTMF do menu imediatamente após o WaitExten
          emitMenuDtmf(item.menuFlush);
        } else if (item.isRaw) {
          // Linhas raw (include =>, comentários, etc.) sem prefixo exten =>
          emit(item.line);
        } else {
          const pri = seqIdx === 0 ? '1' : 'n';
          const lbl = item.label ? `(${item.label})` : '';
          emit(`exten => s,${pri}${lbl},${item.line}`);
          seqIdx++;
        }
      }
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
  const ENTRY_CTX = `orpen-ivr-${IVR}`;
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
          const tgt = nodes.find((x) => x.id === ed.target);
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
    emitS(`Goto(${rootMenu.data.contextName || 'orpen-ivr-home'},s,1)`);
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
        `Goto(orpen-ivr-transfer,s,1)`,
      ];
    }
    return [`Goto(${n.data.context || ''},${n.data.extension || 's'},${n.data.priority || '1'})`];
  };

  while (menuQueue.length) {
    const m   = menuQueue.shift();
    const CTX = m.data.contextName || `orpen-ivr-${IVR}-menu`;
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
        emit(`exten => ${d.id},n,Goto(${tgt.data.contextName || 'orpen-ivr-sub'},s,1)`);
        if (!seenMenu.has(tgt.id)) { seenMenu.add(tgt.id); menuQueue.push(tgt); }
      } else if (tgt.type === 'route') {
        const lns = routeLines(tgt);
        emit(`exten => ${d.id},n,${lns[0]}`);
        for (let i = 1; i < lns.length; i++) emit(`exten => ${d.id},n,${lns[i]}`);
      } else if (tgt.type === 'time') {
        const subCtx = `orpen-ivr-${IVR}-${d.id}`;
        emit(`exten => ${d.id},n,Goto(${subCtx},s,1)`);
        tgt.__subCtx = subCtx;
      } else if (ACTION_META[tgt.type]) {
        const subCtx = `orpen-ivr-${IVR}-${d.id}`;
        emit(`exten => ${d.id},n,Goto(${subCtx},s,1)`);
        actionChainCtxs.push({ ctx: subCtx, start: tgt, parentCtx: CTX });
      }
      sep();
    }

    emit(`exten => i,1,Macro(${(m.data.invalidMacro || 'macro-menu-invalid-orpen-home').replace(/^macro-/, '')})`);
    emit(`exten => i,n,Goto(${CTX},s,1)`);
    sep();
    emit(`exten => t,1,Macro(${(m.data.timeoutMacro || 'macro-menu-timeout-orpen-home').replace(/^macro-/, '')})`);
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
            emitS(`Goto(${nxt.data.contextName || 'orpen-ivr-home'},s,1)`);
            if (!seenMenu.has(nxt.id)) { seenMenu.add(nxt.id); menuQueue.push(nxt); }
            terminated = true; break;
          }
          if (nxt.type === 'route') {
            for (const ln of routeLines(nxt)) emitS(ln);
            terminated = true; break;
          }
          if (nxt.type === 'time') {
            const passCtx = `orpen-ivr-${IVR}-cond-${nxt.id.slice(-4)}`;
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
    const inv = m.data.invalidMacro || 'macro-menu-invalid-orpen-home';
    const tmo = m.data.timeoutMacro || 'macro-menu-timeout-orpen-home';
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
  const findNode = (id) => nodes.find((n) => n.id === id);
  const outEdges = (id, handle) =>
    edges.filter((e) => e.source === id && (handle ? e.sourceHandle === handle : true));

  if (nodes.some((n) => n.type === 'context')) {
    return generateDialplanFromContexts(nodes, edges, findNode, outEdges, options);
  }
  return generateDialplanLegacy(nodes, edges, findNode, outEdges, options);
}
