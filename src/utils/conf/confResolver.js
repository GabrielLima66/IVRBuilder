/**
 * confResolver.js — fase 3 do pipeline de importação .conf.
 * Aplica inteligência semântica sobre RawContext[] para produzir ResolvedGraph.
 *
 * Responsabilidades:
 *  - Detectar e extrair o GlobalConfigNode (primeiro contexto com Set(__IVR=...))
 *  - Mapear aplicações Asterisk → tipos de nó do canvas
 *  - Detectar MenuNode (Background + WaitExten + dtmfBlocks)
 *  - Construir ResolvedEdges (sequenciais + referências cross-context)
 *  - Marcar contextos macro-* com isMacro: true
 *
 * @typedef {Object} GlobalConfig
 * @property {string} ivr
 * @property {string} soundPath
 * @property {string} agiPath
 * @property {string} language
 * @property {string} comment
 * @property {boolean} numberDialed
 * @property {boolean} logIvr
 *
 * @typedef {Object} ResolvedNodeData  Dados de um nó filho já traduzidos para o formato canvas
 * @property {string} type             tipo React Flow (answer, hangup, menu, route, etc.)
 * @property {Object} data             data object do nó
 * @property {boolean} [commented]     se veio de linha ;exten =>
 * @property {string} [origLine]       linha original com comentário
 *
 * @typedef {Object} ResolvedContext
 * @property {string} id               ID do ContextNode (ctx-xxx)
 * @property {string} name             nome do contexto Asterisk
 * @property {boolean} isMacro
 * @property {ResolvedNodeData[]} childNodes  nós filhos na ordem de execução
 * @property {string[]} directives     include => values
 *
 * @typedef {Object} ResolvedEdgeSpec
 * @property {string} sourceCtxName    contexto origem da referência
 * @property {string} sourceNodeIdx    índice do nó dentro do contexto (string para chave)
 * @property {string} sourceHandle
 * @property {string} targetCtxName    contexto destino
 * @property {'green'|'yellow'|'dtmf'} color
 *
 * @typedef {Object} ResolvedGraph
 * @property {GlobalConfig} globalConfig
 * @property {string} suggestedName
 * @property {ResolvedContext[]} contexts
 * @property {ResolvedEdgeSpec[]} crossRefs  referências cross-contexto para resolução posterior
 */

import { uid } from '../common.js';

// ── Helpers de mapeamento de aplicações ──────────────────────────────────────

/**
 * Monta um cmdFull a partir de application + args (inverso do lexer).
 * @param {string} application
 * @param {string} args
 * @returns {string}
 */
function toCmdFull(application, args) {
  return `${application}(${args})`;
}

/**
 * Mapeia um cmdFull para { type, data } de nó canvas.
 * Porta direta de cmdToNodeData() do confParser.js legado.
 * Retorna null para linhas que devem ser ignoradas (config global) ou
 * { _configField, _configVal } para linhas de config.
 *
 * @param {string} application
 * @param {string} args
 * @returns {Object|null}
 */
function appToNodeData(application, args) {
  const cmd    = application.toLowerCase();
  const params = args;

  switch (cmd) {
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
      if (qi < 0) return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
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
      const parts    = params.split(',');
      const priRaw   = parts[2] || '1';
      const priMatch = priRaw.match(/^([^(]+)\(([^)]*)\)$/);
      const priority = priMatch ? priMatch[1].trim() : priRaw.replace(/\(.*\)/, '').trim();
      const gosubArgs = priMatch
        ? priMatch[2].split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        type: 'gosub',
        data: { context: parts[0] || '', extension: parts[1] || 's', priority, params: gosubArgs },
      };
    }

    case 'return':
      return { type: 'return', data: { value: params || '' } };

    case 'gotoif': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
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
      const parts    = params.split(',');
      const firstNum = parseInt(parts[0], 10);
      const hasLevel = !isNaN(firstNum) && String(firstNum) === parts[0].trim();
      const level    = hasLevel ? firstNum : 3;
      const message  = hasLevel ? parts.slice(1).join(',') : params;
      return { type: 'verbose', data: { level, message } };
    }

    case 'execif': {
      const qi     = params.indexOf('?');
      const expr   = qi >= 0 ? params.substring(0, qi).replace(/^\$\[/, '').replace(/\]$/, '') : params;
      const action = qi >= 0 ? params.substring(qi + 1) : '';
      return { type: 'execif', data: { expression: expr, action } };
    }

    case 'chanspy': {
      const parts = params.split(',');
      return { type: 'chanspy', data: { target: (parts[0] || '').replace(/^SIP\//, ''), options: parts[1] || '' } };
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
      return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
  }
}

// ── Extração de GlobalConfig ─────────────────────────────────────────────────

/**
 * Scans the first context's extensions for config fields.
 * @param {import('./confMapper.js').RawContext} ctx
 * @returns {GlobalConfig}
 */
function extractGlobalConfig(ctx) {
  /** @type {GlobalConfig} */
  const cfg = { ivr: '', soundPath: '', agiPath: '', language: '', comment: '', numberDialed: false, logIvr: false };
  if (!ctx) return cfg;

  for (const ext of ctx.extensions) {
    const nd = appToNodeData(ext.application, ext.args);
    if (!nd) continue;

    if      (nd._configField === 'ivr')          cfg.ivr          = nd._configVal;
    else if (nd._configField === 'soundPath')     cfg.soundPath    = nd._configVal;
    else if (nd._configField === 'agiPath')       cfg.agiPath      = nd._configVal;
    else if (nd._configField === 'language')      cfg.language     = nd._configVal;
    else if (nd._configField === 'numberDialed')  cfg.numberDialed = true;
    else if (nd.type === 'macro' && nd.data.name === 'logIvr') cfg.logIvr = true;
    else if (!cfg.comment && nd.type === 'noop' && /^##/.test(nd.data.text)) {
      cfg.comment = nd.data.text.replace(/##/g, '').trim();
    }
  }
  return cfg;
}

/**
 * Returns true if this node data corresponds to a known global config line
 * that matches the extracted GlobalConfig values.
 * @param {Object} nd
 * @param {GlobalConfig} globalConfig
 * @returns {boolean}
 */
function isGlobalLine(nd, globalConfig) {
  if (!nd?._configField) return false;
  switch (nd._configField) {
    case 'ivr':          return nd._configVal === globalConfig.ivr;
    case 'numberDialed': return true;
    case 'soundPath':    return nd._configVal === globalConfig.soundPath;
    case 'agiPath':      return nd._configVal === globalConfig.agiPath;
    case 'language':     return nd._configVal === globalConfig.language;
    default:             return false;
  }
}

// ── Résolution d'une ligne commentée ─────────────────────────────────────────

/**
 * Tries to resolve a commented extension raw string into a typed node.
 * Falls back to raw type if parsing fails.
 * @param {string} rawLine  the original extension line without the leading semicolons
 * @returns {{ type: string, data: Object }}
 */
function resolveCommentedLine(rawLine) {
  // Try to re-parse as a normal exten line
  const m = rawLine.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
  if (!m) return { type: 'raw', data: { rawLine } };

  const extension = m[1].trim();
  let cmdFull = m[3].trim();
  const ci = cmdFull.indexOf(';;');
  if (ci >= 0) cmdFull = cmdFull.slice(0, ci).trim();

  // Must be an 's' extension to be useful as a resolved node
  if (extension.toLowerCase() !== 's') return { type: 'raw', data: { rawLine } };

  // Extract application from cmdFull
  const parenIdx = cmdFull.indexOf('(');
  const application = parenIdx >= 0 ? cmdFull.slice(0, parenIdx).trim() : cmdFull;
  const inner = parenIdx >= 0 ? cmdFull.slice(parenIdx + 1) : '';
  const args  = inner.endsWith(')') ? inner.slice(0, inner.length - 1) : inner;

  const nd = appToNodeData(application, args);
  if (!nd || nd._configField) return { type: 'raw', data: { rawLine } };
  return { type: nd.type, data: nd.data || {} };
}

// ── Résolution d'un contexte ─────────────────────────────────────────────────

/**
 * Resolves a single RawContext into child node specs and cross-context references.
 * Returns childNodes (in execution order) and dtmfGotos (for edge building).
 *
 * @param {import('./confMapper.js').RawContext} rawCtx
 * @param {GlobalConfig} globalConfig
 * @param {boolean} isFirstContext
 * @returns {{ childNodes: ResolvedNodeData[], dtmfGotos: Object.<string,string>, directives: string[] }}
 */
function resolveContext(rawCtx, globalConfig, isFirstContext) {
  /** @type {ResolvedNodeData[]} */
  const childNodes = [];
  /** @type {Object.<string,string>} digit → context name */
  const dtmfGotos = {};

  // ── 1. Process include directives as RawNodes ────────────────────────────
  for (const dir of rawCtx.directives) {
    childNodes.push({
      type: 'raw',
      data: { rawLine: `include => ${dir}` },
    });
  }

  // ── 2. Process sequential 's' extensions ────────────────────────────────
  for (const ext of rawCtx.extensions) {
    const nd = appToNodeData(ext.application, ext.args);
    if (!nd) continue;

    // Skip global config lines that match the extracted GlobalConfig
    if (nd._configField) {
      if (isGlobalLine(nd, globalConfig)) continue;
      // Different value → emit as explicit Set node
      const assignment = `${ext.application.replace(/^Set$/i, '')}(${ext.args})`.replace(/^Set\(/i, '').replace(/\)$/, '');
      childNodes.push({ type: 'set', data: { assignment: ext.args, label: '' } });
      continue;
    }

    // Skip the noop comment that was captured as GlobalConfig.comment in first context
    if (
      isFirstContext &&
      globalConfig.comment &&
      nd.type === 'noop' &&
      nd.data.text.replace(/##/g, '').trim() === globalConfig.comment
    ) {
      continue;
    }

    // Skip the logIvr macro (captured in GlobalConfig.logIvr)
    if (isFirstContext && nd.type === 'macro' && nd.data.name === 'logIvr') {
      continue;
    }

    childNodes.push({ type: nd.type, data: nd.data || {} });
  }

  // ── 3. Process commented extensions ────────────────────────────────────
  for (const rawLine of rawCtx.commentedLines) {
    const resolved = resolveCommentedLine(rawLine);
    // Reconstruct the original commented line for _origLine
    const origLine = `;exten => ${rawLine}`;
    childNodes.push({
      type: resolved.type,
      data: resolved.data,
      commented: true,
      origLine,
    });
  }

  // ── 4. Process DTMF blocks → MenuNode ───────────────────────────────────
  if (rawCtx.dtmfBlocks.length > 0) {
    const dtmfMap = new Map();
    for (const block of rawCtx.dtmfBlocks) {
      dtmfMap.set(block.digit, block.lines);
    }

    // Absorb WaitExten and Background from the END of childNodes (before dtmf)
    // These are embedded into the MenuNode
    let menuWaitExten = 4;
    let greeting = '';

    // Remove trailing waitexten node if present
    if (childNodes.length > 0 && childNodes[childNodes.length - 1].type === 'waitexten') {
      const removed = childNodes.pop();
      menuWaitExten = removed.data?.seconds ?? 4;
    }
    // Remove trailing background node if present
    if (childNodes.length > 0 && childNodes[childNodes.length - 1].type === 'background') {
      const removed = childNodes.pop();
      greeting = removed.data?.filename || '';
    }

    // Build digits list (1-9, 0)
    const DIGIT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const menuDigits = [];

    for (const dig of DIGIT_ORDER) {
      if (!dtmfMap.has(dig)) continue;
      const lines = dtmfMap.get(dig);
      const gotoLine = lines.find((l) => /^Goto$/i.test(l.application));
      if (gotoLine) {
        const ctxTarget = gotoLine.args.split(',')[0];
        if (ctxTarget) dtmfGotos[dig] = ctxTarget;
      }
      menuDigits.push({ id: dig, label: `Opcao ${dig}` });
    }

    // Process 'i' and 't' extensions
    let invalidMacro = '';
    let timeoutMacro = '';
    /** @type {ResolvedNodeData[]} macro nodes to append after MenuNode */
    const macroChildNodes = [];
    /** @type {Array<{digit: string, targetIdx: number}>} edges from menu d-x to macro node */
    const macroEdgeSpecs = [];

    for (const ext of ['i', 't']) {
      if (!dtmfMap.has(ext)) continue;
      const lines = dtmfMap.get(ext);
      const macroLine = lines.find((l) => /^Macro$/i.test(l.application));
      const gotoLine  = lines.find((l) => /^Goto$/i.test(l.application));

      if (macroLine) {
        const parts = macroLine.args.split(',');
        const name  = parts[0] || '';
        if (ext === 'i') invalidMacro = name;
        else             timeoutMacro = name;

        const macroNodeIdx = childNodes.length + 1 + macroChildNodes.length; // tentative
        macroChildNodes.push({
          type: 'macro',
          data: { name, params: parts.slice(1).filter(Boolean), label: '' },
          _dtmfMacroFor: ext,
        });
      } else if (gotoLine) {
        const ctxTarget = gotoLine.args.split(',')[0];
        if (ctxTarget) dtmfGotos[ext] = ctxTarget;
      }
    }

    // Add MenuNode
    childNodes.push({
      type: 'menu',
      data: {
        contextName:  rawCtx.name,
        greeting,
        waitExten:    menuWaitExten,
        digits:       menuDigits,
        invalidMacro,
        timeoutMacro,
        maxRetry:     2,
        retryGoto:    '',
        invalidSound: '',
        _dtmfGotos:   dtmfGotos,
      },
      _menuNodeMarker: true,
    });

    // Add macro child nodes for i/t after the MenuNode
    for (const mn of macroChildNodes) {
      childNodes.push(mn);
    }
  }

  return { childNodes, dtmfGotos, directives: rawCtx.directives };
}

// ── Résolution des références cross-contexte ─────────────────────────────────

/**
 * Scans all resolved child nodes for context name references and produces
 * cross-reference specs to be turned into edges by confBuilder.
 *
 * @param {ResolvedContext[]} resolvedContexts
 * @returns {ResolvedEdgeSpec[]}
 */
function buildCrossRefs(resolvedContexts) {
  const ctxNames = new Set(resolvedContexts.map((c) => c.name));

  /** @type {ResolvedEdgeSpec[]} */
  const refs = [];

  for (const ctx of resolvedContexts) {
    for (let i = 0; i < ctx.childNodes.length; i++) {
      const node = ctx.childNodes[i];
      if (node.commented) continue;

      switch (node.type) {
        case 'route':
          if (node.data?.routeMode === 'contexto' && node.data?.context) {
            refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: 'out', targetCtxName: node.data.context, color: 'green' });
          }
          break;

        case 'gosub':
          if (node.data?.context) {
            refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: 'out', targetCtxName: node.data.context, color: 'green' });
          }
          break;

        case 'time':
          if (node.data?.trueContext) {
            refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: 'true', targetCtxName: node.data.trueContext, color: 'yellow' });
          }
          break;

        case 'gotoif': {
          const trueCtx  = (node.data?.trueDestination  || '').split(',')[0];
          const falseCtx = (node.data?.falseDestination || '').split(',')[0];
          if (trueCtx)  refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: 'out',       targetCtxName: trueCtx,  color: 'green' });
          if (falseCtx) refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: 'out-right', targetCtxName: falseCtx, color: 'green' });
          break;
        }

        case 'menu': {
          const dtmfGotos = node.data?._dtmfGotos || {};
          for (const [digit, ctxName] of Object.entries(dtmfGotos)) {
            refs.push({ sourceCtxName: ctx.name, sourceNodeIdx: String(i), sourceHandle: `d-${digit}`, targetCtxName: ctxName, color: 'dtmf' });
          }
          break;
        }

        default:
          break;
      }
    }
  }

  // Filter out refs to contexts not in the imported file (will become unresolvedRefs)
  return refs;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Resolves RawContext[] into a ResolvedGraph ready for layout + building.
 *
 * @param {import('./confMapper.js').RawContext[]} rawContexts
 * @returns {ResolvedGraph & { unresolvedRefs: string[], stats: Object }}
 */
export function resolve(rawContexts) {
  if (!rawContexts.length) {
    return {
      globalConfig: { ivr: '', soundPath: '', agiPath: '', language: '', comment: '', numberDialed: false, logIvr: false },
      suggestedName: 'projeto-importado',
      contexts: [],
      crossRefs: [],
      unresolvedRefs: [],
      stats: { contexts: 0, nodesByType: {}, commented: [], raw: [], unresolvedRefs: [] },
    };
  }

  // Extract GlobalConfig from the first context
  const globalConfig = extractGlobalConfig(rawContexts[0]);

  /** @type {ResolvedContext[]} */
  const resolvedContexts = [];

  /** @type {Object} stats for the modal */
  const stats = {
    contexts: rawContexts.length,
    nodesByType: {},
    commented: [],
    raw: [],
  };

  for (let i = 0; i < rawContexts.length; i++) {
    const rawCtx = rawContexts[i];
    const isMacro = /^macro-/i.test(rawCtx.name);
    const { childNodes, dtmfGotos, directives } = resolveContext(rawCtx, globalConfig, i === 0);

    // Count stats
    for (const n of childNodes) {
      if (n.commented) {
        stats.commented.push(n.origLine || '');
      }
      const t = n.type;
      stats.nodesByType[t] = (stats.nodesByType[t] || 0) + 1;
      if (t === 'raw') stats.raw.push(n.data?.rawLine || '');
    }

    resolvedContexts.push({
      id: `ctx-${uid()}`,
      name: rawCtx.name,
      isMacro,
      childNodes,
      directives,
    });
  }

  // Always add the config node to stats
  stats.nodesByType['config'] = 1;

  // Build cross-context references
  const crossRefs = buildCrossRefs(resolvedContexts);

  // Collect unresolved references (targets not in file)
  const ctxNameSet = new Set(resolvedContexts.map((c) => c.name));
  const unresolvedSet = new Set();
  for (const ref of crossRefs) {
    const ctxName = (ref.targetCtxName || '').trim();
    if (!ctxName || ctxName.length <= 1 || /^\d+$/.test(ctxName)) continue;
    if (!ctxNameSet.has(ctxName)) unresolvedSet.add(ctxName);
  }
  const unresolvedRefs = [...unresolvedSet].sort();
  stats.unresolvedRefs = unresolvedRefs;

  const suggestedName =
    rawContexts[0]?.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() ||
    'projeto-importado';

  return {
    globalConfig,
    suggestedName,
    contexts: resolvedContexts,
    crossRefs,
    unresolvedRefs,
    stats,
  };
}
