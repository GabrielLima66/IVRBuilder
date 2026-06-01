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
 *
 * Metadados de formatação:
 *  Cada nó importado recebe data._fmt com:
 *    appCasing     — capitalização exata da aplicação ("Agi", "AGI", "Hangup" etc.)
 *    hasParens     — true = tinha parênteses, false = forma bare (ex: "Hangup")
 *    rawArgs       — string bruta dos argumentos exatamente como no .conf original
 *    gotoArgs      — para Goto: array dos args exatos ["ctx","s","1"] ou ["s","menu"]
 *    lineLabel     — label entre parênteses na prioridade: n(bv) → "bv"
 *    inlineComment — comentário inline após ";;": ";;TRANFERE PARA FILA"
 *    linePriority  — prioridade exata da linha original: "1" ou "n"
 *  O compilador usa esses campos quando data.isDirty === false para reproduzir
 *  a linha exatamente como estava.
 *
 *  rawDigitLines no MenuNode.data:
 *    Mapa ext → [{ priority, cmdFull, inlineComment }] com TODAS as linhas
 *    de cada extensão DTMF (1-9, i, t). Usado pelo compilador quando o dígito
 *    não tem edge explícita no canvas.
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

// Tipos de nó que aceitam campo label (usado para propagar lineLabel → data.label)
const LABEL_NODE_TYPES = new Set([
  'background', 'waitexten', 'noop', 'playback', 'set', 'agi', 'macro', 'gosub', 'read',
]);

// ── 1. Extração de contextos ──────────────────────────────────────────────────
//
// ctx.lines agora é um array de objetos { lineType, raw, count? }:
//   { lineType: 'exten',            raw: 'exten => s,n,Answer()' }
//   { lineType: 'include',          raw: 'include => hangup-ivr' }
//   { lineType: 'commented_exten',  raw: ';exten => s,n,Answer()' }
//   { lineType: 'sectioncomment',   raw: ';;------ TITULO ------' }
//   { lineType: 'blankline',        raw: '', count: N }   ← linhas em branco consecutivas
//
// Linhas em branco consecutivas são fundidas em um único objeto { blankline, count: N }.
// Comentários decorativos (;; ou ;, mas não ;exten =>) viram sectioncomment.

function extractContexts(lines) {
  const contexts = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();

    // Linha em branco — dentro de um contexto vira marcador blankline
    if (!line) {
      if (current) {
        const last = current.lines[current.lines.length - 1];
        if (last && last.lineType === 'blankline') {
          last.count = (last.count || 1) + 1; // funde linhas em branco consecutivas
        } else {
          current.lines.push({ lineType: 'blankline', raw: '', count: 1 });
        }
      }
      continue;
    }

    // Cabeçalho de contexto [nome]
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

      if (isCommented) {
        current.lines.push({ lineType: 'commented_exten', raw: line });
      } else if (isExten) {
        current.lines.push({ lineType: 'exten', raw: line });
      } else if (isInclude) {
        current.lines.push({ lineType: 'include', raw: line });
      } else if (line.startsWith(';')) {
        // Comentário decorativo de seção (;; TITULO, ;;----, ; Opcao X, etc.)
        current.lines.push({ lineType: 'sectioncomment', raw: line });
      }
      // Outros (ex: linhas de configuração fora de exten) → descartados
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

  // ctx.lines agora é array de { lineType, raw } — iterar apenas linhas exten
  for (const item of firstCtx.lines) {
    if (item.lineType !== 'exten' && item.lineType !== 'commented_exten') continue;
    const rawLine = item.raw;
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
//
// Retorna:
//   { _commented, originalLine }          — linha comentada (;exten => ...)
//   { _dtmf, extension, cmdFull,
//     priority, lineLabel, inlineComment } — extensão DTMF (1-9, i, t)
//   { extension, priority, cmdFull,
//     lineLabel, inlineComment }           — linha sequencial normal
//   null                                  — não é exten =>

function parseExtenLine(line) {
  const commentedMatch = line.match(/^;+\s*(exten\s*=>.+)$/i);
  if (commentedMatch) {
    return { _commented: true, originalLine: commentedMatch[1] };
  }

  const m = line.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
  if (!m) return null;

  const extension   = m[1].trim();
  const rawPriority = m[2].trim();

  // Extrai label da prioridade: "n(bv)" → priority='n', lineLabel='bv'
  const priLabelMatch = rawPriority.match(/^([^(]+)\(([^)]+)\)$/);
  const priority  = priLabelMatch ? priLabelMatch[1].trim() : rawPriority;
  const lineLabel = priLabelMatch ? priLabelMatch[2].trim() : '';

  // Captura comentário inline após ";;", preserva o restante como cmdFull
  let cmdFull = m[3].trim();
  let inlineComment = '';
  const commentIdx = cmdFull.indexOf(';;');
  if (commentIdx >= 0) {
    inlineComment = cmdFull.substring(commentIdx).trim();
    cmdFull = cmdFull.substring(0, commentIdx).trim();
  }

  if (/^[0-9]$/.test(extension) || extension === 'i' || extension === 't') {
    return { _dtmf: true, extension, cmdFull, priority, lineLabel, inlineComment };
  }

  return { extension, priority, cmdFull, lineLabel, inlineComment };
}

// ── 5. Mapeamento de comando → dados de nó ────────────────────────────────────
//
// Retorna { type, data, fmt } ou { _configField, _configVal, fmt }.
// fmt = { appCasing, hasParens, rawArgs, gotoArgs? } — metadados de formatação.

function cmdToNodeData(cmdFull) {
  const m       = cmdFull.match(/^(\w+)\(([\s\S]*)\)$/);
  const appName = m ? m[1] : (cmdFull.split(/[(,\s]/)[0] || cmdFull);
  const params  = m ? m[2] : '';

  // Metadados de formatação base — propagados para data._fmt pelo chamador
  const fmt = {
    appCasing: appName,
    hasParens: cmdFull.includes('('),
    rawArgs:   params,
  };

  switch (appName.toLowerCase()) {
    case 'answer':
      return { type: 'answer', data: {}, fmt };

    case 'hangup':
      return { type: 'hangup', data: { causeCode: params || '' }, fmt };

    case 'wait': {
      const s = parseFloat(params) || 1;
      return { type: 'wait', data: { seconds: s }, fmt };
    }

    case 'waitexten': {
      const s = parseFloat(params) || 4;
      return { type: 'waitexten', data: { seconds: s, label: '' }, fmt };
    }

    case 'noop':
      return { type: 'noop', data: { text: params, label: '' }, fmt };

    case 'playback': {
      const fname = params.split('/').pop();
      return { type: 'playback', data: { filename: fname, label: '' }, fmt };
    }

    case 'background': {
      const fname = params.split('/').pop();
      return { type: 'background', data: { filename: fname, label: '' }, fmt };
    }

    case 'gotoiftime': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: cmdFull }, fmt };
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
        fmt,
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
        // gotoArgs preserva os argumentos exatos (pode ser 2 ou 3)
        fmt: { ...fmt, gotoArgs: parts.map((p) => p.trim()) },
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
        fmt,
      };
    }

    case 'agi': {
      const parts  = params.split(',');
      // Strip path prefix — script may be ${AGI_PATH}/name or /full/path/name
      const script = (parts[0] || '').split('/').pop();
      return { type: 'agi', data: { script, params: parts.slice(1).filter(Boolean), label: '' }, fmt };
    }

    case 'macro': {
      const parts = params.split(',');
      return { type: 'macro', data: { name: parts[0] || '', params: parts.slice(1).filter(Boolean), label: '' }, fmt };
    }

    case 'gosub': {
      const parts = params.split(',');
      // Priority may include args: "1(arg1,arg2)" — extract both
      const priRaw   = parts[2] || '1';
      const priMatch = priRaw.match(/^([^(]+)\(([^)]*)\)$/);
      const priority = priMatch ? priMatch[1].trim() : priRaw.replace(/\(.*\)/, '').trim();
      const gosubArgs = priMatch
        ? priMatch[2].split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        type: 'gosub',
        data: {
          context:   parts[0] || '',
          extension: parts[1] || 's',
          priority,
          params:    gosubArgs,
        },
        fmt,
      };
    }

    case 'return':
      return { type: 'return', data: { value: params || '' }, fmt };

    case 'gotoif': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: cmdFull }, fmt };
      const expr  = params.substring(0, qi).replace(/^\$\[/, '').replace(/\]$/, '');
      const dests = params.substring(qi + 1).split(':');
      return { type: 'gotoif', data: { expression: expr, trueDestination: dests[0] || '', falseDestination: dests[1] || '' }, fmt };
    }

    case 'dial': {
      const parts = params.split(',');
      return { type: 'dial', data: { destination: parts[0] || '', timeout: parts[1] || '', options: parts[2] || '' }, fmt };
    }

    case 'set': {
      if (/^__IVR=/i.test(params))               return { _configField: 'ivr',          _configVal: params.split('=').slice(1).join('='), fmt };
      if (/^SOUND_PATH=/i.test(params))           return { _configField: 'soundPath',    _configVal: params.split('=').slice(1).join('='), fmt };
      if (/^AGI_PATH=/i.test(params))             return { _configField: 'agiPath',      _configVal: params.split('=').slice(1).join('='), fmt };
      if (/^CHANNEL\(language\)=/i.test(params))  return { _configField: 'language',     _configVal: params.split('=').slice(1).join('='), fmt };
      if (/^__NUMBER_DIALED=/i.test(params))      return { _configField: 'numberDialed', _configVal: true, fmt };
      return { type: 'set', data: { assignment: params, label: '' }, fmt };
    }

    case 'verbose': {
      // Verbose([level,]message) — level is optional integer; detect by trying to parse first token
      const parts     = params.split(',');
      const firstNum  = parseInt(parts[0], 10);
      const hasLevel  = !isNaN(firstNum) && String(firstNum) === parts[0].trim();
      const level     = hasLevel ? firstNum : 3;
      const message   = hasLevel ? parts.slice(1).join(',') : params;
      return { type: 'verbose', data: { level, message }, fmt };
    }

    case 'execif': {
      const qi     = params.indexOf('?');
      const expr   = qi >= 0 ? params.substring(0, qi).replace(/^\$\[/, '').replace(/\]$/, '') : params;
      const action = qi >= 0 ? params.substring(qi + 1) : '';
      return { type: 'execif', data: { expression: expr, action }, fmt };
    }

    case 'chanspy': {
      const parts = params.split(',');
      return { type: 'chanspy', data: { target: parts[0]?.replace(/^SIP\//, '') || '', options: parts[1] || '' }, fmt };
    }

    case 'mixmonitor': {
      const base = params.split('/').pop();
      const dot  = base.lastIndexOf('.');
      return { type: 'mixmonitor', data: { filename: dot >= 0 ? base.slice(0, dot) : base, extension: dot >= 0 ? base.slice(dot + 1) : 'wav' }, fmt };
    }

    case 'stopmonitor':
      return { type: 'stopmonitor', data: {}, fmt };

    case 'saydigits':
      return { type: 'saydigits', data: { value: params }, fmt };

    case 'saynumber':
      return { type: 'saynumber', data: { value: params.split(',')[0], gender: params.split(',')[1] || 'm' }, fmt };

    default:
      return { type: 'raw', data: { rawLine: cmdFull }, fmt };
  }
}

// Tipos de nó de formatação — não têm handles, não influenciam lógica de fluxo
const FORMATTING_TYPES = new Set(['blankline', 'sectioncomment']);

// Alturas estimadas dos elementos de formatação (quando visíveis)
const BLANKLINE_H_PER   = 8;   // px por linha em branco
const SECTION_COMMENT_H = 24;  // px para um comentário de seção

// ── 6. Processa um contexto → nós + edges ────────────────────────────────────

function processContext(ctx, xOffset, stats, globalConfig, isFirstContext) {
  const ctxId      = `ctx-${uid()}`;
  const nodes      = [];
  const edges      = [];
  // dtmfGroups: extension → [{ cmdFull, priority, inlineComment }]
  const dtmfGroups = new Map();
  let   yChild     = CTX_PAD_TOP;
  const sequential = [];
  const isMacro    = /^macro-/i.test(ctx.name);

  // ctx.lines agora é array de { lineType, raw, count? }
  for (const item of ctx.lines) {
    const { lineType, raw: rawLine } = item;
    const line = rawLine ? rawLine.trim() : '';

    // ── Linha em branco → NóLinhaEmBranco ─────────────────────────────────────
    if (lineType === 'blankline') {
      const count = item.count || 1;
      const nid = `n_${uid()}`;
      nodes.push({
        id:       nid,
        type:     'blankline',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { count, isDirty: false },
        parentNode: ctxId,
        extent:   'parent',
        draggable: false,
      });
      sequential.push(nid);
      yChild += BLANKLINE_H_PER * count;
      stats.nodesByType['blankline'] = (stats.nodesByType['blankline'] || 0) + 1;
      continue;
    }

    // ── Comentário de seção → NóComentárioSeção ───────────────────────────────
    if (lineType === 'sectioncomment') {
      const style = rawLine.startsWith(';;') ? 'double' : 'single';
      const nid = `n_${uid()}`;
      nodes.push({
        id:       nid,
        type:     'sectioncomment',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { text: rawLine, style, isDirty: false },
        parentNode: ctxId,
        extent:   'parent',
        draggable: false,
      });
      sequential.push(nid);
      yChild += SECTION_COMMENT_H;
      stats.nodesByType['sectioncomment'] = (stats.nodesByType['sectioncomment'] || 0) + 1;
      continue;
    }

    // include => → RawNode (não é uma exten, handle antes do parseExtenLine)
    if (lineType === 'include' || /^include\s*=>/i.test(line)) {
      const nid = `n_${uid()}`;
      nodes.push({
        id:       nid,
        type:     'raw',
        position: { x: CTX_PAD_H, y: yChild },
        data:     { rawLine: line, isDirty: false },
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
        data:       { ...realData, _commented: true, _origLine: rawLine, isDirty: false },
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

    // Linha DTMF → agrupada por extensão
    // Cada item armazena { cmdFull, priority, inlineComment } para reconstrução fiel
    if (parsed._dtmf) {
      if (!dtmfGroups.has(parsed.extension)) dtmfGroups.set(parsed.extension, []);
      dtmfGroups.get(parsed.extension).push({
        cmdFull:       parsed.cmdFull,
        priority:      parsed.priority     || 'n',
        inlineComment: parsed.inlineComment || '',
      });
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
        data:     {
          assignment,
          label: '',
          isDirty: false,
          _fmt: {
            appCasing:    nodeData.fmt?.appCasing    || 'Set',
            hasParens:    nodeData.fmt?.hasParens    ?? true,
            rawArgs:      nodeData.fmt?.rawArgs      || assignment,
            lineLabel:    parsed.lineLabel    || '',
            inlineComment: parsed.inlineComment || '',
            linePriority: parsed.priority     || 'n',
          },
          ...(parsed.inlineComment ? { inlineComment: parsed.inlineComment } : {}),
        },
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

    // Monta _fmt combinando metadados do token com metadados da linha
    const nodeFmt = {
      ...(nodeData.fmt || {}),
      lineLabel:    parsed.lineLabel    || '',
      inlineComment: parsed.inlineComment || '',
      linePriority: parsed.priority     || 'n',
    };

    // Dados finais do nó
    const finalData = {
      ...nodeData.data || {},
      _fmt:     nodeFmt,
      isDirty:  false,
    };

    // Propaga lineLabel → data.label para tipos que suportam label
    // (evita perder o (bv) / (menu) da linha original)
    if (parsed.lineLabel && LABEL_NODE_TYPES.has(nodeData.type)) {
      finalData.label = parsed.lineLabel;
    }

    // Propaga inlineComment para data.inlineComment (lido pelo compilador)
    if (parsed.inlineComment) {
      finalData.inlineComment = parsed.inlineComment;
    }

    const nid = `n_${uid()}`;
    nodes.push({
      id:       nid,
      type:     nodeData.type,
      position: { x: CTX_PAD_H, y: yChild },
      data:     finalData,
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
    //    Elementos de formatação (blankline, sectioncomment) entre Background/WaitExten
    //    e o bloco DTMF são ignorados na busca mas permanecem no sequential.
    const localById = {};
    for (const n of nodes) localById[n.id] = n;

    let menuWaitExten  = 4;
    let greeting       = '';
    let greetingLabel  = 'menu';

    // Função auxiliar: avança ptr para trás, pulando elementos de formatação
    const skipFormatting = (ptr) => {
      while (ptr >= 0 && FORMATTING_TYPES.has(localById[sequential[ptr]]?.type)) ptr--;
      return ptr;
    };

    // Busca WaitExten (pulando formatação)
    let ptr = skipFormatting(sequential.length - 1);

    if (ptr >= 0 && localById[sequential[ptr]]?.type === 'waitexten') {
      menuWaitExten = localById[sequential[ptr]].data?.seconds ?? 4;
      nodes.splice(nodes.findIndex((n) => n.id === sequential[ptr]), 1);
      sequential.splice(ptr, 1);
      yChild -= NODE_H + NODE_GAP;
      ptr = skipFormatting(sequential.length - 1);
    }

    // Busca Background (pulando formatação)
    if (ptr >= 0 && localById[sequential[ptr]]?.type === 'background') {
      const bgNode = localById[sequential[ptr]];
      greeting = bgNode.data?._fmt?.rawArgs !== undefined
        ? bgNode.data._fmt.rawArgs
        : (bgNode.data?.filename || '');
      greetingLabel = bgNode.data?._fmt?.lineLabel || bgNode.data?.label || 'menu';
      nodes.splice(nodes.findIndex((n) => n.id === sequential[ptr]), 1);
      sequential.splice(ptr, 1);
      yChild -= NODE_H + NODE_GAP;
    }
    const seqPtr = sequential.length - 1; // referência final após absorções

    // 2. Extrai dígitos numéricos (1-9, 0) e respectivos destinos Goto
    const DIGIT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const menuDigits  = [];
    const dtmfGotos   = {}; // extensão → nome do contexto de destino (para resolveReferences)

    for (const dig of DIGIT_ORDER) {
      if (!dtmfGroups.has(dig)) continue;
      const gotoCmd = dtmfGroups.get(dig).find((c) => /^Goto\(/i.test(c.cmdFull));
      if (gotoCmd) {
        const m = gotoCmd.cmdFull.match(/^Goto\(([^,)]+)/i);
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
      const macroCmd = cmds.find((c) => /^Macro\(/i.test(c.cmdFull));
      const gotoCmd  = cmds.find((c) => /^Goto\(/i.test(c.cmdFull));

      if (macroCmd) {
        const raw   = macroCmd.cmdFull.replace(/^Macro\(/i, '').replace(/\)$/, '');
        const parts = raw.split(',');
        const name  = parts[0] || '';
        if (ext === 'i') invalidMacro = name;
        else             timeoutMacro = name;

        const mnId = `n_${uid()}`;
        macroNodes.push({
          id:         mnId,
          type:       'macro',
          position:   { x: CTX_PAD_H, y: macroStackY },
          data:       { name, params: parts.slice(1).filter(Boolean), label: '', isDirty: false },
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
        const m = gotoCmd.cmdFull.match(/^Goto\(([^,)]+)/i);
        if (m) dtmfGotos[ext] = m[1];
      }
    }

    // 4. Constrói rawDigitLines: todas as linhas brutas de cada extensão DTMF
    //    O compilador usa esses dados quando o dígito não tem edge no canvas.
    const rawDigitLines = {};
    for (const [ext, cmds] of dtmfGroups.entries()) {
      rawDigitLines[ext] = cmds.map(({ cmdFull, priority, inlineComment }) => ({
        priority,
        cmdFull,
        inlineComment,
      }));
    }

    // 5. Cria o MenuNode no lugar do bloco DTMF na sequência vertical
    nodes.push({
      id:         menuId,
      type:       'menu',
      position:   { x: CTX_PAD_H, y: yChild },
      data: {
        contextName:   ctx.name,
        greeting,
        greetingLabel, // label da linha Background: 'menu', 'inicio', etc.
        waitExten:     menuWaitExten,
        digits:        menuDigits,
        invalidMacro,
        timeoutMacro,
        maxRetry:      2,
        retryGoto:     '',
        invalidSound:  '',
        rawDigitLines, // todas as linhas brutas por extensão DTMF
        _dtmfGotos:    dtmfGotos, // consumido por resolveReferences, ignorado pelo exporter
        isDirty:       false,
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
      isDirty:      false,
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
