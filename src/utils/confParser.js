/**
 * confParser.js — converte um arquivo .conf de Asterisk em nós e edges do React Flow.
 *
 * Regras de parsing:
 *  - GlobalConfigNode: UM por importação, fora de qualquer ContextNode
 *  - Fonte de verdade: PRIMEIRO contexto do arquivo
 *  - Linhas Set(__IVR/SOUND_PATH/AGI_PATH/CHANNEL(language)/__NUMBER_DIALED)
 *    são ignoradas nos contextos secundários se o valor bater com o global
 *  - Macro(logIvr,...): cria nó Macro normal em cada contexto onde aparecer
 *  - include => hangup-ivr e similares → RawNode
 *  - Contextos [macro-*]: ContextNode normal com data.isMacro = true
 */

import { uid } from './common';

// ── Constantes de layout ──────────────────────────────────────────────────────
const CTX_MIN_WIDTH  = 520;  // largura mínima de um ContextNode (deve ser ≥ CTX_MIN_W do ContextNode)
const CTX_PAD_TOP    = 34;   // padding topo = altura do header (sem barra START)
const CTX_PAD_BOTTOM = 20;   // padding inferior do ContextNode
const CTX_PAD_H      = 20;   // padding horizontal dos nós filhos (igual ao CTX_PAD_H do ContextNode)
const NODE_H         = 60;   // altura estimada de um nó filho (sem gap)
const NODE_GAP       = 0;    // sem espaçamento entre filhos — colados verticalmente
const CTX_COL_GAP    = 120;  // gap horizontal entre ContextNodes
const CTX_ROW_Y      = 220;  // Y fixo de todos os ContextNodes (abaixo do GlobalConfig)
// Aliases de compatibilidade
const CTX_WIDTH = CTX_MIN_WIDTH;
const CTX_GAP   = CTX_COL_GAP;

// ── 1. Extração de contextos ──────────────────────────────────────────────────

function extractContexts(lines) {
  const contexts = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(';;')) continue;

    const ctxMatch = line.match(/^\[([^\]]+)\]$/);
    if (ctxMatch) {
      current = { name: ctxMatch[1], lines: [] };
      contexts.push(current);
      continue;
    }

    if (current) {
      const isExten     = /^exten\s*=>/i.test(line);
      const isCommented = /^;+\s*exten\s*=>/i.test(line);
      const isInclude   = /^include\s*=>/i.test(line);
      if (isExten || isCommented || isInclude) current.lines.push(line);
    }
  }

  return contexts;
}

// ── 2. Extração de configuração global (primeiro contexto) ────────────────────

function extractGlobalConfig(firstCtx) {
  const cfg = {
    ivr:          '',
    soundPath:    '',
    agiPath:      '',
    language:     '',
    comment:      '',
    numberDialed: false,
  };
  if (!firstCtx) return cfg;

  for (const rawLine of firstCtx.lines) {
    const line = rawLine.trim();
    if (/^include\s*=>/i.test(line)) continue;

    const parsed = parseExtenLine(rawLine);
    if (!parsed || parsed._commented || parsed._dtmf) continue;

    const nd = cmdToNodeData(parsed.cmdFull);
    if (!nd) continue;

    if      (nd._configField === 'ivr')          cfg.ivr          = nd._configVal;
    else if (nd._configField === 'soundPath')     cfg.soundPath    = nd._configVal;
    else if (nd._configField === 'agiPath')       cfg.agiPath      = nd._configVal;
    else if (nd._configField === 'language')      cfg.language     = nd._configVal;
    else if (nd._configField === 'numberDialed')  cfg.numberDialed = true;
    else if (!cfg.comment && nd.type === 'noop' && /^##/.test(nd.data.text)) {
      cfg.comment = nd.data.text.replace(/##/g, '').trim();
    }
  }
  return cfg;
}

// ── 3. Verifica se uma linha é uma config global com valor correspondente ─────

function isGlobalLine(nodeData, globalConfig) {
  if (!nodeData?._configField) return false;
  switch (nodeData._configField) {
    case 'ivr':          return nodeData._configVal === globalConfig.ivr;
    case 'numberDialed': return true; // sempre global
    case 'soundPath':    return nodeData._configVal === globalConfig.soundPath;
    case 'agiPath':      return nodeData._configVal === globalConfig.agiPath;
    case 'language':     return nodeData._configVal === globalConfig.language;
    default:             return false;
  }
}

// ── 4. Parser de uma linha exten => ───────────────────────────────────────────

function parseExtenLine(line) {
  const commentedMatch = line.match(/^;+\s*(exten\s*=>.+)$/i);
  if (commentedMatch) {
    return { _commented: true, originalLine: commentedMatch[1] };
  }

  const m = line.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
  if (!m) return null;

  const extension = m[1].trim();
  const priority  = m[2].trim();

  // Strip inline ;; comments do cmdFull (ex: "Set(X=Y) ;;comentário")
  let cmdFull = m[3].trim();
  const commentIdx = cmdFull.indexOf(';;');
  if (commentIdx >= 0) cmdFull = cmdFull.substring(0, commentIdx).trim();

  if (/^[0-9]$/.test(extension) || extension === 'i' || extension === 't') {
    return { _dtmf: true, extension, cmdFull };
  }

  return { extension, priority, cmdFull };
}

// ── 5. Mapeamento de comando → dados de nó ────────────────────────────────────

function cmdToNodeData(cmdFull) {
  const m      = cmdFull.match(/^(\w+)\(([\s\S]*)\)$/);
  const cmd    = m ? m[1] : cmdFull.split('(')[0];
  const params = m ? m[2] : '';

  switch (cmd.toLowerCase()) {
    case 'answer':
      return { type: 'answer', data: {} };

    case 'hangup':
      return { type: 'hangup', data: { causeCode: params || '' } };

    case 'wait': {
      const s = parseFloat(params) || 1;
      return { type: 'wait', data: { seconds: s } };
    }

    case 'waitexten': {
      const s = parseFloat(params) || 4;
      return { type: 'waitexten', data: { seconds: s, label: '' } };
    }

    case 'noop':
      return { type: 'noop', data: { text: params, label: '' } };

    case 'playback': {
      const fname = params.split('/').pop();
      return { type: 'playback', data: { filename: fname, label: '' } };
    }

    case 'background': {
      const fname = params.split('/').pop();
      return { type: 'background', data: { filename: fname, label: '' } };
    }

    case 'gotoiftime': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: cmdFull } };
      const spec  = params.substring(0, qi).split(',');
      const dest  = params.substring(qi + 1).split(',')[0];
      const [ts, weekdays, mdays, months] = spec;
      const [tStart, tEnd] = (ts || '*').split('-');
      return {
        type: 'time',
        data: {
          timeStart:   tStart !== '*' ? tStart : '',
          timeEnd:     tEnd   !== '*' ? tEnd   : '',
          weekdays:    weekdays && weekdays !== '*' ? weekdays.split('&') : [],
          months:      months   && months   !== '*' ? months.split('&')   : [],
          mday:        mdays    && mdays    !== '*' ? mdays               : '',
          trueContext: dest || '',
          label:       '',
        },
      };
    }

    case 'goto': {
      const parts = params.split(',');
      return {
        type: 'route',
        data: {
          routeMode: 'contexto',
          context:   parts[0] || '',
          extension: parts[1] || 's',
          priority:  parts[2] || '1',
          queue: '7000', queueOptions: '',
        },
      };
    }

    case 'queue': {
      const parts = params.split(',');
      return {
        type: 'route',
        data: {
          routeMode:    'fila',
          queue:        parts[0] || '',
          queueOptions: parts[1] || '',
          context: '', extension: 's', priority: '1',
        },
      };
    }

    case 'agi': {
      const parts  = params.split(',');
      const script = (parts[0] || '').split('/').pop();
      return { type: 'agi', data: { script, params: parts.slice(1).filter(Boolean), label: '' } };
    }

    case 'macro': {
      const parts = params.split(',');
      return { type: 'macro', data: { name: parts[0] || '', params: parts.slice(1).filter(Boolean), label: '' } };
    }

    case 'gosub': {
      const parts = params.split(',');
      return {
        type: 'gosub',
        data: {
          context:   parts[0] || '',
          extension: parts[1] || 's',
          priority:  (parts[2] || '1').replace(/\(.*\)/, ''),
          params:    [],
        },
      };
    }

    case 'return':
      return { type: 'return', data: { value: params || '' } };

    case 'gotoif': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: cmdFull } };
      const expr  = params.substring(0, qi).replace(/^\$\[/, '').replace(/\]$/, '');
      const dests = params.substring(qi + 1).split(':');
      return { type: 'gotoif', data: { expression: expr, trueDestination: dests[0] || '', falseDestination: dests[1] || '' } };
    }

    case 'dial': {
      const parts = params.split(',');
      return { type: 'dial', data: { destination: parts[0] || '', timeout: parts[1] || '', options: parts[2] || '' } };
    }

    case 'set': {
      if (/^__IVR=/i.test(params))               return { _configField: 'ivr',          _configVal: params.split('=').slice(1).join('=') };
      if (/^SOUND_PATH=/i.test(params))           return { _configField: 'soundPath',    _configVal: params.split('=').slice(1).join('=') };
      if (/^AGI_PATH=/i.test(params))             return { _configField: 'agiPath',      _configVal: params.split('=').slice(1).join('=') };
      if (/^CHANNEL\(language\)=/i.test(params))  return { _configField: 'language',     _configVal: params.split('=').slice(1).join('=') };
      if (/^__NUMBER_DIALED=/i.test(params))      return { _configField: 'numberDialed', _configVal: true };
      return { type: 'set', data: { assignment: params, label: '' } };
    }

    case 'verbose': {
      const parts = params.split(',');
      return { type: 'verbose', data: { level: parseInt(parts[0]) || 3, message: parts.slice(1).join(',') } };
    }

    case 'execif': {
      const qi     = params.indexOf('?');
      const expr   = qi >= 0 ? params.substring(0, qi).replace(/^\$\[/, '').replace(/\]$/, '') : params;
      const action = qi >= 0 ? params.substring(qi + 1) : '';
      return { type: 'execif', data: { expression: expr, action } };
    }

    case 'chanspy': {
      const parts = params.split(',');
      return { type: 'chanspy', data: { target: parts[0]?.replace(/^SIP\//, '') || '', options: parts[1] || '' } };
    }

    case 'mixmonitor': {
      const base = params.split('/').pop();
      const dot  = base.lastIndexOf('.');
      return { type: 'mixmonitor', data: { filename: dot >= 0 ? base.slice(0, dot) : base, extension: dot >= 0 ? base.slice(dot + 1) : 'wav' } };
    }

    case 'stopmonitor':
      return { type: 'stopmonitor', data: {} };

    case 'saydigits':
      return { type: 'saydigits', data: { value: params } };

    case 'saynumber':
      return { type: 'saynumber', data: { value: params.split(',')[0], gender: params.split(',')[1] || 'm' } };

    default:
      return { type: 'raw', data: { rawLine: cmdFull } };
  }
}

// ── 6. Processa um contexto → nós + edges ────────────────────────────────────

function processContext(ctx, xOffset, stats, globalConfig, isFirstContext) {
  const ctxId      = `ctx-${uid()}`;
  const nodes      = [];
  const edges      = [];
  const dtmfGroups = new Map(); // extension → [cmdFull, ...]
  let   yChild     = CTX_PAD_TOP;
  const sequential = [];
  const isMacro    = /^macro-/i.test(ctx.name);

  for (const rawLine of ctx.lines) {
    const line = rawLine.trim();

    // include => → RawNode (não é uma exten, handle antes do parseExtenLine)
    if (/^include\s*=>/i.test(line)) {
      const nid = `n_${uid()}`;
      nodes.push({
        id:       nid,
        type:     'raw',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { rawLine: line },
        parentNode: ctxId,
        extent:   'parent',
        draggable: false,
      });
      sequential.push(nid);
      yChild += NODE_H + NODE_GAP;
      stats.raw.push(line);
      stats.nodesByType['raw'] = (stats.nodesByType['raw'] || 0) + 1;
      continue;
    }

    const parsed = parseExtenLine(rawLine);
    if (!parsed) continue;

    // Linha comentada → nó do tipo real com _commented: true
    if (parsed._commented) {
      let realType = 'raw';
      let realData = { rawLine: parsed.originalLine };

      const innerParsed = parseExtenLine(parsed.originalLine);
      if (innerParsed && !innerParsed._commented && !innerParsed._dtmf && innerParsed.cmdFull) {
        const nd = cmdToNodeData(innerParsed.cmdFull);
        if (nd && nd.type && !nd._configField) {
          realType = nd.type;
          realData = nd.data || {};
        }
      }

      const cid = `n_${uid()}`;
      nodes.push({
        id:         cid,
        type:       realType,
        position:   { x: CTX_PAD_H, y: yChild },
        data:       { ...realData, _commented: true, _origLine: rawLine },
        parentNode: ctxId,
        extent:     'parent',
        draggable:  false,
      });
      sequential.push(cid);
      yChild += NODE_H + NODE_GAP;
      stats.commented.push(parsed.originalLine);
      stats.nodesByType[realType] = (stats.nodesByType[realType] || 0) + 1;
      continue;
    }

    // Linha DTMF → agrupada por extensão para construção do MenuNode
    if (parsed._dtmf) {
      if (!dtmfGroups.has(parsed.extension)) dtmfGroups.set(parsed.extension, []);
      dtmfGroups.get(parsed.extension).push(parsed.cmdFull);
      continue;
    }

    const nodeData = cmdToNodeData(parsed.cmdFull);
    if (!nodeData) continue;

    // Linha de configuração global: pula se valor bate com o global,
    // cria Set normal se valor for diferente (sobrescrita intencional)
    if (nodeData._configField) {
      if (isGlobalLine(nodeData, globalConfig)) continue;
      // Valor diferente → Set explícito
      const assignment = parsed.cmdFull.replace(/^Set\(/i, '').replace(/\)$/, '');
      const nid = `n_${uid()}`;
      nodes.push({
        id:       nid,
        type:     'set',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { assignment, label: '' },
        parentNode: ctxId,
        extent:   'parent',
        draggable: false,
      });
      sequential.push(nid);
      yChild += NODE_H + NODE_GAP;
      stats.nodesByType['set'] = (stats.nodesByType['set'] || 0) + 1;
      continue;
    }

    // No primeiro contexto: ignora o Noop que foi capturado como comentário global
    if (
      isFirstContext &&
      globalConfig.comment &&
      nodeData.type === 'noop' &&
      nodeData.data.text.replace(/##/g, '').trim() === globalConfig.comment
    ) {
      continue;
    }

    // Nó regular
    const nid = `n_${uid()}`;
    nodes.push({
      id:       nid,
      type:     nodeData.type,
      position: { x: CTX_PAD_H, y: yChild },
      data:     nodeData.data || {},
      parentNode: ctxId,
      extent:   'parent',
      draggable: false,
    });
    sequential.push(nid);
    yChild += NODE_H + NODE_GAP;

    const t = nodeData.type;
    stats.nodesByType[t] = (stats.nodesByType[t] || 0) + 1;
    if (t === 'raw') stats.raw.push(nodeData.data?.rawLine || parsed.cmdFull);
  }

  // Edges sequenciais entre os nós do contexto
  for (let i = 0; i < sequential.length - 1; i++) {
    edges.push({
      id:           `e-${sequential[i]}-${sequential[i + 1]}`,
      source:       sequential[i],
      sourceHandle: 'out',
      target:       sequential[i + 1],
      targetHandle: 'in',
      type:         'floating',
      data:         { offsetX: 0, offsetY: 0 },
      style:        { stroke: '#00ff41', strokeWidth: 1.5 },
      markerEnd:    { type: 'arrowclosed', color: '#00ff41' },
    });
  }

  // ── MenuNode: converte bloco DTMF completo em um único MenuNode ─────────────
  if (dtmfGroups.size > 0) {
    // 1. Absorve WaitExten e Background imediatamente antes do bloco DTMF.
    //    Esses conceitos são embutidos no MenuNode — não existem como nós separados.
    const localById = {};
    for (const n of nodes) localById[n.id] = n;

    let menuWaitExten = 4;
    let greeting      = '';
    let seqPtr        = sequential.length - 1;

    if (seqPtr >= 0 && localById[sequential[seqPtr]]?.type === 'waitexten') {
      menuWaitExten = localById[sequential[seqPtr]].data?.seconds ?? 4;
      nodes.splice(nodes.findIndex((n) => n.id === sequential[seqPtr]), 1);
      sequential.splice(seqPtr, 1);
      yChild -= NODE_H + NODE_GAP;
      seqPtr--;
    }
    if (seqPtr >= 0 && localById[sequential[seqPtr]]?.type === 'background') {
      greeting = localById[sequential[seqPtr]].data?.filename || '';
      nodes.splice(nodes.findIndex((n) => n.id === sequential[seqPtr]), 1);
      sequential.splice(seqPtr, 1);
      yChild -= NODE_H + NODE_GAP;
      seqPtr--;
    }

    // 2. Extrai dígitos numéricos (1-9, 0) e respectivos destinos Goto
    const DIGIT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const menuDigits  = [];
    const dtmfGotos   = {}; // extensão → nome do contexto de destino (para resolveReferences)

    for (const dig of DIGIT_ORDER) {
      if (!dtmfGroups.has(dig)) continue;
      const gotoCmd = dtmfGroups.get(dig).find((c) => /^Goto\(/i.test(c));
      if (gotoCmd) {
        const m = gotoCmd.match(/^Goto\(([^,)]+)/i);
        if (m) dtmfGotos[dig] = m[1];
      }
      menuDigits.push({ id: dig, label: `Opcao ${dig}` });
    }

    // 3. Processa 'i' (invalid) e 't' (timeout):
    //    Macro() → cria NóMacro filho + edge d-i/d-t; define invalidMacro/timeoutMacro
    //    Goto()  → registra em dtmfGotos para resolveReferences criar a edge de contexto
    let invalidMacro  = '';
    let timeoutMacro  = '';
    const menuId      = `n_${uid()}`;
    const macroNodes  = [];
    const macroEdges  = [];
    let   macroStackY = yChild + 160 + NODE_GAP;

    for (const ext of ['i', 't']) {
      if (!dtmfGroups.has(ext)) continue;
      const cmds     = dtmfGroups.get(ext);
      const macroCmd = cmds.find((c) => /^Macro\(/i.test(c));
      const gotoCmd  = cmds.find((c) => /^Goto\(/i.test(c));

      if (macroCmd) {
        const raw   = macroCmd.replace(/^Macro\(/i, '').replace(/\)$/, '');
        const parts = raw.split(',');
        const name  = parts[0] || '';
        if (ext === 'i') invalidMacro = name;
        else             timeoutMacro = name;

        const mnId = `n_${uid()}`;
        macroNodes.push({
          id:         mnId,
          type:       'macro',
          position:   { x: CTX_PAD_H, y: macroStackY },
          data:       { name, params: parts.slice(1).filter(Boolean), label: '' },
          parentNode: ctxId,
          extent:     'parent',
          draggable:  false,
        });
        macroEdges.push({
          id:           `e-ref-${uid()}`,
          source:       menuId,
          sourceHandle: `d-${ext}`,
          target:       mnId,
          targetHandle: 'in',
          type:         'floating',
          data:         { offsetX: 0, offsetY: 0 },
          style:        { stroke: '#ff8c00', strokeWidth: 1.5 },
          markerEnd:    { type: 'arrowclosed', color: '#ff8c00' },
        });
        macroStackY += NODE_H + NODE_GAP;
        stats.nodesByType['macro'] = (stats.nodesByType['macro'] || 0) + 1;
      } else if (gotoCmd) {
        const m = gotoCmd.match(/^Goto\(([^,)]+)/i);
        if (m) dtmfGotos[ext] = m[1];
      }
    }

    // 4. Cria o MenuNode no lugar do bloco DTMF na sequência vertical
    nodes.push({
      id:         menuId,
      type:       'menu',
      position:   { x: CTX_PAD_H, y: yChild },
      data: {
        contextName:  ctx.name,
        greeting,
        waitExten:    menuWaitExten,
        digits:       menuDigits,
        invalidMacro,
        timeoutMacro,
        maxRetry:     2,
        retryGoto:    '',
        invalidSound: '',
        _dtmfGotos:   dtmfGotos, // consumido por resolveReferences, ignorado pelo exporter
      },
      parentNode: ctxId,
      extent:     'parent',
      draggable:  false,
    });
    sequential.push(menuId);
    stats.nodesByType['menu'] = (stats.nodesByType['menu'] || 0) + 1;

    yChild = macroStackY; // posição após o MenuNode + todos os MacroNodes de i/t
    for (const mn of macroNodes) nodes.push(mn);
    for (const me of macroEdges) edges.push(me);
  }

  const ctxHeight = Math.max(yChild + CTX_PAD_BOTTOM, 220);

  // childOrder: ids dos filhos na ordem em que aparecem no .conf
  // O MenuNode é incluído; macroNodes de i/t ficam fora do fluxo sequencial principal
  const childOrder = [...sequential];

  const ctxNode = {
    id:       ctxId,
    type:     'context',
    // Posição calculada em parseConfFile a partir do CTX_ROW_Y e xOffset
    position: { x: xOffset, y: CTX_ROW_Y },
    data:     {
      contextName: ctx.name,
      childOrder,
      ...(isMacro ? { isMacro: true } : {}),
    },
    style:    { width: CTX_MIN_WIDTH, height: ctxHeight },
    zIndex:   -1,
  };

  return { ctxNode, nodes, edges, ctxId };
}

// ── 7. Resolução de referências a contextos ───────────────────────────────────
//
// Após criar todos os nós e ContextNodes, varre os nós em busca de campos que
// referenciam nomes de contexto por string e cria edges visuais para os
// ContextNodes correspondentes no canvas.
//
// Nós resolvidos:
//   route (routeMode=contexto) → data.context           → handle 'out'
//   gosub                      → data.context           → handle 'out'
//   time                       → data.trueContext       → handle 'true' (amarelo)
//   gotoif                     → data.trueDestination   → handle 'out'
//                                data.falseDestination  → handle 'out-right'
//
// Referências não resolvidas (contexto não existe no canvas) são retornadas
// em stats.unresolvedRefs para exibição no modal de importação.

function resolveReferences(allNodes, allEdges) {
  // Índice: contextName → nodeId
  const ctxIndex = {};
  for (const n of allNodes) {
    if (n.type === 'context' && n.data?.contextName) {
      ctxIndex[n.data.contextName] = n.id;
    }
  }

  // Rastreia chaves source|handle|target já usadas (previne duplicatas)
  const edgeKeys = new Set(
    allEdges.map((e) => `${e.source}|${e.sourceHandle}|${e.target}`)
  );
  const unresolved = new Set();
  const newEdges   = [];

  // Cada appearance inclui type de edge (floating ou smoothstep)
  const green   = { type: 'floating',   data: { offsetX: 0, offsetY: 0 }, style: { stroke: '#00ff41', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#00ff41' } };
  const yellow  = { type: 'floating',   data: { offsetX: 0, offsetY: 0 }, style: { stroke: '#ffcc00', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#ffcc00' } };
  // Handles d-* (DTMF): floating (EdgeWithWaypoints usa rfSourceX/Y do React Flow
  // para posição real de cada handle) com roteamento floating-style no target.
  const dtmfApp = { type: 'floating',   data: { offsetX: 0, offsetY: 0 }, style: { stroke: '#00ff41', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#00ff41' } };

  function tryLink(sourceId, sourceHandle, rawCtxName, appearance) {
    // Ignora strings que são claramente prioridades ou extensões inline ("1", "s", "n")
    const ctxName = (rawCtxName || '').trim();
    if (!ctxName || ctxName.length <= 1 || /^\d+$/.test(ctxName)) return;

    const targetId = ctxIndex[ctxName];
    if (targetId) {
      const key = `${sourceId}|${sourceHandle}|${targetId}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        newEdges.push({
          id:           `e-ref-${uid()}`,
          source:       sourceId,
          sourceHandle,
          target:       targetId,
          targetHandle: 'ctx-in',
          type:         appearance.type,
          data:         { offsetX: 0, offsetY: 0 },
          animated:     false,
          style:        appearance.style,
          markerEnd:    appearance.markerEnd,
        });
      }
    } else {
      unresolved.add(ctxName);
    }
  }

  for (const n of allNodes) {
    switch (n.type) {
      case 'route':
        if (n.data?.routeMode === 'contexto' && n.data?.context) {
          tryLink(n.id, 'out', n.data.context, green);
        }
        break;

      case 'gosub':
        if (n.data?.context) {
          tryLink(n.id, 'out', n.data.context, green);
        }
        break;

      case 'time':
        if (n.data?.trueContext) {
          tryLink(n.id, 'true', n.data.trueContext, yellow);
        }
        break;

      case 'gotoif': {
        // Destinos podem ser "ctx,ext,pri" — extrai apenas o nome do contexto
        const trueCtx  = (n.data?.trueDestination  || '').split(',')[0];
        const falseCtx = (n.data?.falseDestination || '').split(',')[0];
        if (trueCtx)  tryLink(n.id, 'out',       trueCtx,  green);
        if (falseCtx) tryLink(n.id, 'out-right', falseCtx, green);
        break;
      }

      case 'menu': {
        // Cada saída DTMF (d-digit, d-i, d-t) usa floating (EdgeWithWaypoints handle-aware)
        const dtmfGotos = n.data?._dtmfGotos || {};
        for (const [ext, ctxName] of Object.entries(dtmfGotos)) {
          tryLink(n.id, `d-${ext}`, ctxName, dtmfApp);
        }
        break;
      }

      default:
        break;
    }
  }

  return { newEdges, unresolved: [...unresolved].sort() };
}

// ── 8. Entry point ────────────────────────────────────────────────────────────

export function parseConfFile(text) {
  const lines    = text.split('\n');
  const contexts = extractContexts(lines);

  if (!contexts.length) {
    return {
      nodes: [],
      edges: [],
      stats: { contexts: 0, nodesByType: {}, commented: [], raw: [], unresolvedRefs: [] },
      suggestedName: 'projeto-importado',
    };
  }

  // Extrai config global do primeiro contexto
  const globalConfig = extractGlobalConfig(contexts[0]);

  const stats    = { contexts: contexts.length, nodesByType: {}, commented: [], raw: [] };
  const allNodes = [];
  const allEdges = [];

  // ── GlobalConfigNode único (fora de qualquer ContextNode) ─────────────────
  const configId   = `n_${uid()}`;
  const configNode = {
    id:   configId,
    type: 'config',
    // Posição definitiva calculada pelo layout hierárquico — valor provisório aqui
    position: { x: 50, y: 50 },
    data: {
      ivr:          globalConfig.ivr          || '0000',
      soundPath:    globalConfig.soundPath     || '',
      agiPath:      globalConfig.agiPath       || '',
      language:     globalConfig.language      || 'pt_BR',
      comment:      globalConfig.comment       || '',
      numberDialed: globalConfig.numberDialed,
      logIvr:       false,
      customerAgi:  false,
    },
  };
  allNodes.push(configNode);
  stats.nodesByType['config'] = 1;

  // ── Processa cada contexto em grade simples — esquerda para direita ─────
  let xOffset    = 50;
  let firstCtxId = null;
  for (let i = 0; i < contexts.length; i++) {
    const { ctxNode, nodes, edges, ctxId } = processContext(
      contexts[i], xOffset, stats, globalConfig, i === 0
    );
    if (i === 0) firstCtxId = ctxId;
    allNodes.push(ctxNode, ...nodes);
    allEdges.push(...edges);
    xOffset += CTX_MIN_WIDTH + CTX_COL_GAP;
  }

  // GlobalConfigNode: centralizado horizontalmente acima de todos os contextos
  const totalWidth   = contexts.length * CTX_MIN_WIDTH + Math.max(0, contexts.length - 1) * CTX_COL_GAP;
  const configWidth  = 220;
  configNode.position = {
    x: Math.max(50, 50 + (totalWidth - configWidth) / 2),
    y: 20,
  };

  // ── Edge GlobalConfig → primeiro ContextNode ──────────────────────────────
  if (firstCtxId) {
    allEdges.push({
      id:           `e-cfg-${firstCtxId}`,
      source:       configId,
      sourceHandle: 'out',
      target:       firstCtxId,
      targetHandle: 'ctx-in',
      type:         'floating',
      data:         { offsetX: 0, offsetY: 0 },
      style:        { stroke: '#00ff41', strokeWidth: 1.5 },
      markerEnd:    { type: 'arrowclosed', color: '#00ff41' },
    });
  }

  // ── Resolução de referências a contextos ──────────────────────────────────
  const { newEdges, unresolved } = resolveReferences(allNodes, allEdges);
  allEdges.push(...newEdges);
  stats.unresolvedRefs = unresolved;

  return {
    nodes: allNodes,
    edges: allEdges,
    stats,
    suggestedName:
      contexts[0]?.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() ||
      'projeto-importado',
  };
}
