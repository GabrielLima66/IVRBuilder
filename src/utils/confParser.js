/**
 * confParser.js — converte um arquivo .conf de Asterisk em nós e edges do React Flow.
 *
 * Suporta:
 *  - Blocos [contexto] → ContextNode
 *  - Comandos comuns → nó correspondente (ver MAP abaixo)
 *  - Linhas comentadas "; exten =>" → CommentedNode
 *  - Comandos desconhecidos → RawNode
 *  - Extensões DTMF (1,2,3,i,t) → Route nodes conectados ao menu do contexto
 */

import { uid } from './common';

// ── Layout ────────────────────────────────────────────────────────────────────
const CTX_WIDTH    = 520;
const CTX_GAP      = 100;
const CTX_PAD_TOP  = 80;  // espaço interno (abaixo do header)
const CTX_PAD_H    = 30;
const NODE_H       = 120; // altura estimada por nó
const NODE_GAP     = 16;

// ── Extração de contextos ─────────────────────────────────────────────────────

function extractContexts(lines) {
  const contexts = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(';;')) continue; // comentários de seção

    const ctxMatch = line.match(/^\[([^\]]+)\]$/);
    if (ctxMatch) {
      current = { name: ctxMatch[1], lines: [] };
      contexts.push(current);
      continue;
    }

    // Linha de extensão normal ou comentada
    if (current) {
      const isExten    = /^exten\s*=>/i.test(line);
      const isCommented = /^;+\s*exten\s*=>/i.test(line);
      if (isExten || isCommented) current.lines.push(line);
    }
  }

  return contexts;
}

// ── Parser de uma linha exten => ──────────────────────────────────────────────

function parseExtenLine(line) {
  // Linha comentada: ;exten => ...
  const commentedMatch = line.match(/^;+\s*(exten\s*=>.+)$/i);
  if (commentedMatch) {
    return { _commented: true, originalLine: commentedMatch[1] };
  }

  // exten => ext,pri[label],Application(params)
  const m = line.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
  if (!m) return null;

  const extension = m[1].trim();
  const priority  = m[2].trim();
  const cmdFull   = m[3].trim();

  // Extensões DTMF
  if (/^[0-9]$/.test(extension) || extension === 'i' || extension === 't') {
    return { _dtmf: true, extension, cmdFull };
  }

  return { extension, priority, cmdFull };
}

// ── Mapeamento de comando → dados de nó ───────────────────────────────────────

function cmdToNodeData(cmdFull) {
  // Extrai Application e params
  const m = cmdFull.match(/^(\w+)\(([\s\S]*)\)$/);
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
      // GotoIfTime(times,weekdays,mdays,months?context,s,1)
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
          routeMode:    'contexto',
          context:      parts[0] || '',
          extension:    parts[1] || 's',
          priority:     parts[2] || '1',
          queue:        '7000',
          queueOptions: '',
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
        data: { context: parts[0] || '', extension: parts[1] || 's', priority: (parts[2] || '1').replace(/\(.*\)/, ''), params: [] },
      };
    }

    case 'return':
      return { type: 'return', data: { value: params || '' } };

    case 'gotoif': {
      // GotoIf($[expr]?true:false)
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: cmdFull } };
      const exprRaw  = params.substring(0, qi);
      const expr     = exprRaw.replace(/^\$\[/, '').replace(/\]$/, '');
      const dests    = params.substring(qi + 1).split(':');
      return { type: 'gotoif', data: { expression: expr, trueDestination: dests[0] || '', falseDestination: dests[1] || '' } };
    }

    case 'dial': {
      const parts = params.split(',');
      return { type: 'dial', data: { destination: parts[0] || '', timeout: parts[1] || '', options: parts[2] || '' } };
    }

    case 'set': {
      // Detecta padrões de ConfigNode
      if (/^__IVR=/i.test(params))                return { _configField: 'ivr',         _configVal: params.split('=').slice(1).join('=') };
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
      const qi = params.indexOf('?');
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
      // Comando não reconhecido → RawNode
      return { type: 'raw', data: { rawLine: cmdFull } };
  }
}

// ── Converte um contexto em nós + edges ───────────────────────────────────────

function processContext(ctx, xOffset, stats) {
  const ctxId   = `ctx-${uid()}`;
  const nodes   = [];
  const edges   = [];
  const dtmf    = [];     // linhas DTMF para pós-processamento
  let   yChild  = CTX_PAD_TOP;

  // Acumula campos de ConfigNode
  const configFields = {};
  let   hasConfig    = false;
  let   configNodeId = null;
  let   lastNodeId   = null;

  const sequential = []; // ids na ordem de execução para edges sequenciais

  for (const rawLine of ctx.lines) {
    const parsed = parseExtenLine(rawLine);
    if (!parsed) continue;

    // Linha comentada → CommentedNode
    if (parsed._commented) {
      const cid  = `n_${uid()}`;
      nodes.push({
        id:       cid,
        type:     'commented',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { originalLine: parsed.originalLine, text: rawLine },
        parentNode: ctxId,
        extent:   'parent',
      });
      sequential.push(cid);
      yChild += NODE_H + NODE_GAP;
      stats.commented.push(parsed.originalLine);
      (stats.nodesByType['commented'] = (stats.nodesByType['commented'] || 0) + 1);
      continue;
    }

    // Linhas DTMF → agrupar para pós-processamento
    if (parsed._dtmf) {
      dtmf.push(parsed);
      continue;
    }

    // Linha normal de extensão
    const nodeData = cmdToNodeData(parsed.cmdFull);
    if (!nodeData) continue;

    // Campo de ConfigNode
    if (nodeData._configField) {
      configFields[nodeData._configField] = nodeData._configVal;
      hasConfig = true;
      // Não cria nó aqui — será criado como ConfigNode ao final do loop
      continue;
    }

    // Macro(logIvr,...) → logIvr flag no ConfigNode
    if (parsed.cmdFull.match(/^Macro\(logIvr/i)) {
      configFields.logIvr = true;
      hasConfig = true;
      continue;
    }

    // Noop com ## ... ## → comment do ConfigNode
    if (nodeData.type === 'noop' && hasConfig && !configFields._commentDone && /^##/.test(nodeData.data.text)) {
      configFields.comment = nodeData.data.text.replace(/##/g, '').trim();
      configFields._commentDone = true;
      continue;
    }

    const nid = `n_${uid()}`;
    nodes.push({
      id:       nid,
      type:     nodeData.type,
      position: { x: CTX_PAD_H, y: yChild },
      data:     nodeData.data || {},
      parentNode: ctxId,
      extent:   'parent',
    });
    sequential.push(nid);
    yChild += NODE_H + NODE_GAP;

    // Stats
    const t = nodeData.type;
    stats.nodesByType[t] = (stats.nodesByType[t] || 0) + 1;
    if (t === 'raw') stats.raw.push(nodeData.data?.rawLine || parsed.cmdFull);
  }

  // Cria ConfigNode se campos foram acumulados
  if (hasConfig) {
    configNodeId = `n_${uid()}`;
    const cfgData = {
      ivr:          configFields.ivr || '0000',
      soundPath:    configFields.soundPath || '/etc/asterisk/customers/example/sounds',
      agiPath:      configFields.agiPath   || '/etc/asterisk/customers/example/agi',
      language:     configFields.language  || 'pt_BR',
      comment:      configFields.comment   || '',
      numberDialed: !!configFields.numberDialed,
      logIvr:       !!configFields.logIvr,
      customerAgi:  false,
    };
    nodes.unshift({
      id:       configNodeId,
      type:     'config',
      position: { x: CTX_PAD_H, y: CTX_PAD_TOP },
      data:     cfgData,
      parentNode: ctxId,
      extent:   'parent',
    });
    sequential.unshift(configNodeId);
    yChild += NODE_H + NODE_GAP;
    stats.nodesByType['config'] = (stats.nodesByType['config'] || 0) + 1;

    // Reposiciona os demais nós para baixo do ConfigNode
    const offsetExtra = NODE_H + NODE_GAP;
    nodes.slice(1).forEach((n) => { if (n.parentNode === ctxId) n.position.y += offsetExtra; });
  }

  // Cria edges sequenciais entre os nós do contexto
  for (let i = 0; i < sequential.length - 1; i++) {
    edges.push({
      id:           `e-${sequential[i]}-${sequential[i + 1]}`,
      source:       sequential[i],
      sourceHandle: 'out',
      target:       sequential[i + 1],
      targetHandle: 'in',
      type:         'floating',
      data:         { waypoints: [] },
      style:        { stroke: '#00ff41', strokeWidth: 1.5 },
      markerEnd:    { type: 'arrowclosed', color: '#00ff41' },
    });
  }

  // Cria Route nodes para extensões DTMF
  for (const d of dtmf) {
    const m = d.cmdFull.match(/^Goto\(([^,]+)/i);
    if (!m) continue;
    const nid = `n_${uid()}`;
    nodes.push({
      id:       nid,
      type:     'route',
      position: { x: CTX_PAD_H + CTX_WIDTH - 180, y: yChild },
      data: {
        routeMode: 'contexto',
        context:   m[1],
        extension: 's', priority: '1',
        queue: '7000', queueOptions: '',
        _dtmfDigit: d.extension,
      },
      parentNode: ctxId,
      extent:   'parent',
    });
    yChild += NODE_H + NODE_GAP;
    stats.nodesByType['route'] = (stats.nodesByType['route'] || 0) + 1;
  }

  // Altura do ContextNode baseada no conteúdo
  const ctxHeight = Math.max(yChild + CTX_PAD_H, 220);

  const ctxNode = {
    id:       ctxId,
    type:     'context',
    position: { x: xOffset, y: 50 },
    data:     { contextName: ctx.name },
    style:    { width: CTX_WIDTH, height: ctxHeight },
    zIndex:   -1,
  };

  return { ctxNode, nodes, edges };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseConfFile(text) {
  const lines    = text.split('\n');
  const contexts = extractContexts(lines);

  const allNodes = [];
  const allEdges = [];
  const stats    = { contexts: contexts.length, nodesByType: {}, commented: [], raw: [] };

  let xOffset = 50;

  for (const ctx of contexts) {
    const { ctxNode, nodes, edges } = processContext(ctx, xOffset, stats);
    allNodes.push(ctxNode, ...nodes);
    allEdges.push(...edges);
    xOffset += CTX_WIDTH + CTX_GAP;
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    stats,
    // Nome sugerido para o projeto (primeiro contexto)
    suggestedName: contexts[0]?.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'projeto-importado',
  };
}
