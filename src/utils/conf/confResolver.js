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
import { logUnknown } from './unknownCommandsLog.js';

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
 * @param {boolean} [hasParens=true]  se a chamada original tinha parênteses (ex: bare Hangup sem ())
 * @returns {Object|null}
 */
function appToNodeData(application, args, hasParens = true) {
  const cmd    = application.toLowerCase();
  const params = args;

  switch (cmd) {
    case 'answer':
      return { type: 'answer', data: {} };

    case 'hangup':
      return { type: 'hangup', data: { causeCode: params || '', hasParens } };

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
      // Suporta múltiplos arquivos separados por &:
      // Background(${SOUND_PATH}/arq1&${SOUND_PATH}/arq2&${SOUND_PATH}/arq3)
      const rawParts = params.split('&').map((p) => p.split('/').pop().trim()).filter(Boolean);
      const filenames = rawParts.length > 0 ? rawParts : [''];
      return { type: 'background', data: { filename: filenames[0], filenames, label: '' } };
    }

    case 'gotoiftime': {
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
      const spec      = params.substring(0, qi).split(',');
      const destFull  = params.substring(qi + 1);
      const destParts = destFull.split(',');
      const dest      = destParts[0] || '';
      // Preserve extensão/prioridade quando destino é 3-partes (ex: rcx-queue,7310,1)
      const destExt   = destParts[1] && destParts[1] !== 's' ? destParts[1] : '';
      const destPri   = destParts[2] && destParts[2] !== '1' ? destParts[2] : '';
      const [ts, weekdays, mdays, months] = spec;
      const [tStart, tEnd] = (ts || '*').split('-');
      return {
        type: 'time',
        data: {
          timeStart:      tStart !== '*' ? tStart : '',
          timeEnd:        tEnd   !== '*' ? tEnd   : '',
          weekdays:       weekdays && weekdays !== '*' ? weekdays.split('&') : [],
          months:         months   && months   !== '*' ? months.split('&')   : [],
          mday:           mdays    && mdays    !== '*' ? mdays               : '',
          trueContext:    dest,
          trueExtension:  destExt,
          truePriority:   destPri,
          label:          '',
        },
      };
    }

    case 'goto': {
      const parts = params.split(',');
      const ctx   = parts[0] || '';
      const ext   = parts[1] || 's';
      const pri   = parts[2] || '1';
      // Heurística: Goto(ctx-queue, NNNN, 1) → RouteNode modo FILA
      // Critério: extensão é número puro (3-6 dígitos) E nome do contexto contém
      // "queue" ou "fila" (insensível a maiúsculas).
      const isQueueContext = /queue|fila/i.test(ctx);
      const isNumericExt   = /^\d{3,6}$/.test(ext);
      if (isQueueContext && isNumericExt) {
        return {
          type: 'route',
          data: {
            routeMode:    'fila',
            queue:        ext,       // número da fila (ex: 7810)
            queueOptions: '',
            context:      ctx,       // preservado para referência
            extension:    ext,
            priority:     pri,
          },
        };
      }
      return {
        type: 'route',
        data: {
          routeMode: 'contexto',
          context:   ctx,
          extension: ext,
          priority:  pri,
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
      // BUG 1: preserva o path completo SEM adicionar ${AGI_PATH}/ e SEM strip de prefixo
      const script = (parts[0] || '').trim();
      // BUG 1: preserva capitalização original da aplicação (Agi vs AGI)
      return { type: 'agi', data: { script, originalCasing: application, params: parts.slice(1).filter(Boolean), label: '' } };
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

    case 'execiftime': {
      // ExecIfTime(times,weekdays,mdays,months?App(args))
      const qi = params.indexOf('?');
      if (qi < 0) return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
      const specParts = params.substring(0, qi).split(',');
      const action    = params.substring(qi + 1);
      const [ts, weekdays, mdays, months] = specParts;
      return {
        type: 'execiftime',
        data: {
          hours:     ts       || '*',
          days:      weekdays || '*',
          monthdays: mdays    || '*',
          months:    months   || '*',
          action:    action   || '',
        },
      };
    }

    case 'sipaddheader': {
      // SIPAddHeader(Nome: valor)
      const colonIdx = params.indexOf(':');
      const headerName = colonIdx >= 0 ? params.slice(0, colonIdx).trim()  : params.trim();
      const value      = colonIdx >= 0 ? params.slice(colonIdx + 1).trim() : '';
      return { type: 'sipaddheader', data: { headerName, value } };
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
      logUnknown(application);
      return { type: 'raw', data: { rawLine: toCmdFull(application, args) } };
  }
}

// ── Extração de GlobalConfig ─────────────────────────────────────────────────

/**
 * Returns true only if this context is a real GlobalConfig setup context —
 * i.e., it explicitly defines SOUND_PATH or AGI_PATH.
 * Contexts that merely set __IVR without defining paths are real IVR entry
 * contexts that should be treated as regular ContextNodes.
 *
 * @param {import('./confMapper.js').RawContext|null} ctx
 * @returns {boolean}
 */
function isGlobalConfigCtx(ctx) {
  if (!ctx) return false;
  for (const ext of ctx.extensions) {
    const cmd = ext.application.toLowerCase();
    if (cmd === 'set') {
      if (/^SOUND_PATH=/i.test(ext.args)) return true;
      if (/^AGI_PATH=/i.test(ext.args))   return true;
    }
  }
  return false;
}

/**
 * Scans the first context's extensions for config fields.
 * Only called when isGlobalConfigCtx() returns true.
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
 * Only returns true when the globalConfig actually has non-empty values —
 * prevents false positives when globalConfig is empty (non-GlobalConfig first context).
 * @param {Object} nd
 * @param {GlobalConfig} globalConfig
 * @returns {boolean}
 */
function isGlobalLine(nd, globalConfig) {
  if (!nd?._configField) return false;
  switch (nd._configField) {
    case 'ivr':          return globalConfig.ivr          !== '' && nd._configVal === globalConfig.ivr;
    case 'numberDialed': return globalConfig.numberDialed === true;
    case 'soundPath':    return globalConfig.soundPath    !== '' && nd._configVal === globalConfig.soundPath;
    case 'agiPath':      return globalConfig.agiPath      !== '' && nd._configVal === globalConfig.agiPath;
    case 'language':     return globalConfig.language     !== '' && nd._configVal === globalConfig.language;
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

// ── Helpers para processamento de opções DTMF ────────────────────────────────

/**
 * Retorna true se a aplicação encerra o fluxo da opção (não há linhas depois).
 * @param {string} application
 * @returns {boolean}
 */
function isTerminalApp(application) {
  return ['goto', 'dial', 'hangup'].includes(application.toLowerCase());
}

/**
 * Constrói um objeto `finalDestination` a partir da linha terminal de uma opção DTMF.
 * BUG 4: preserva aridade original do Goto (argCount).
 * @param {string} application
 * @param {string} args
 * @returns {{ type: string, [key: string]: unknown }|null}
 */
function buildFinalDest(application, args) {
  const cmd = application.toLowerCase();
  if (cmd === 'goto') {
    const parts = args.split(',');
    const argCount = parts.length;        // BUG 4: preserva aridade (1, 2 ou 3)
    const ctx = (parts[0] || '').trim();
    const ext = argCount >= 2 ? (parts[1] || '').trim() : '';
    const pri = argCount >= 3 ? (parts[2] || '').trim() : '';
    // Heurística fila: contexto contém "queue" ou "fila" + extensão numérica de 3-6 dígitos
    if (argCount >= 2 && /queue|fila/i.test(ctx) && /^\d{3,6}$/.test(ext)) {
      return { type: 'queue', ctx, ext, pri };
    }
    return { type: 'context', contextName: ctx, ext, pri, argCount };
  }
  if (cmd === 'dial') {
    const parts = args.split(',');
    return { type: 'dial', target: parts[0] || '', timeout: parts[1] || '' };
  }
  if (cmd === 'hangup') {
    return { type: 'hangup', causeCode: args || '' };
  }
  return null;
}

/**
 * Classifica as linhas de um bloco DTMF em `actions[]` + `finalDestination`.
 * Boilerplate ignorado: Macro(sayDigit,...) e Macro(logIvr,ENTER_CONTEXT,...).
 * BUG 2: captura o label original do Macro(logIvr,ENTER_CONTEXT,label).
 *
 * @param {import('../conf/confMapper.js').RawDtmfLine[]} lines
 * @returns {{ actions: Array<{type:string, data:Object}>, finalDest: Object|null, logIvrLabel: string|null }}
 */
function processOptionLines(lines) {
  const actions = [];
  let finalDest = null;
  let logIvrLabel = null;   // BUG 2

  for (const line of lines) {
    const cmd = line.application.toLowerCase();

    // Ignora boilerplate: Macro(sayDigit,...) e Macro(sayDigits,...)
    if (cmd === 'macro') {
      const macroName = line.args.split(',')[0].toLowerCase().trim();
      if (macroName === 'saydigit' || macroName === 'saydigits') continue;
      // BUG 2: ignora Macro(logIvr,ENTER_CONTEXT,...) mas salva o label original
      if (macroName === 'logivr' && /ENTER_CONTEXT/i.test(line.args)) {
        const logIvrParts = line.args.split(',');
        if (logIvrParts.length >= 3) logIvrLabel = logIvrParts[2].trim() || null;
        continue;
      }
    }

    // Linha terminal: termina a sequência de ações da opção
    if (isTerminalApp(cmd)) {
      finalDest = buildFinalDest(line.application, line.args);
      break;
    }

    // Linha de ação intermediária
    const nd = appToNodeData(line.application, line.args, line.hasParens ?? true);
    if (!nd) continue;

    if (nd._configField) {
      // Linhas de config dentro de opção DTMF são tratadas como Set genérico
      actions.push({ type: 'set', data: { assignment: line.args, label: '' } });
    } else {
      actions.push({ type: nd.type, data: nd.data || {} });
    }
  }

  return { actions, finalDest, logIvrLabel };
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

  // ── 1. Collect include directives — serão adicionados ao FINAL (convenção Asterisk)
  // Não adiciona aqui: includeNodes é appendado após todas as extensões 's'.
  /** @type {ResolvedNodeData[]} */
  const includeNodes = rawCtx.directives.map((dir) => ({
    type: 'include',
    data: { contextName: dir },
  }));

  // ── 2. Process sequential 's' extensions ────────────────────────────────
  for (const ext of rawCtx.extensions) {
    const nd = appToNodeData(ext.application, ext.args, ext.hasParens ?? true);
    if (!nd) continue;

    // Skip global config lines that match the extracted GlobalConfig
    if (nd._configField) {
      if (isGlobalLine(nd, globalConfig)) continue;
      // Different value → emit as explicit Set node
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

    // BUG 7: preserva o label da extensão no data do nó (usado para distinguir
    // Background standalone de Background de menu no passo 4)
    const nodeData = { ...nd.data };
    if (ext.label) nodeData._label = ext.label;
    childNodes.push({ type: nd.type, data: nodeData });
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
    // Mapa de digit → bloco completo (inclui comment e lines)
    const dtmfMap = new Map();
    for (const block of rawCtx.dtmfBlocks) {
      dtmfMap.set(block.digit, block);
    }

    // Absorb WaitExten + Backgrounds do FINAL de childNodes.
    //
    // Atenção: alguns .conf têm um `exten => s,n,Hangup` DEPOIS do WaitExten
    // (como fallthrough da sequência 's' ao final das opções DTMF).
    // Esse Hangup fica no FINAL de childNodes e deve ser PRESERVADO — apenas
    // pulamos por cima dele para encontrar o WaitExten abaixo.
    //
    // Tipos "terminais de fim de bloco" que podem aparecer depois do WaitExten:
    const TAIL_SKIP_TYPES = new Set(['hangup', 'return', 'include', 'raw']);

    // Encontra o índice do WaitExten mais próximo do final (ignorando tail-skip)
    let waitExtenIdx = -1;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const t = childNodes[i].type;
      if (t === 'waitexten') { waitExtenIdx = i; break; }
      if (!TAIL_SKIP_TYPES.has(t)) break; // parou em algo que não é skip → não tem WaitExten
    }

    let menuWaitExten = 4;
    if (waitExtenIdx >= 0) {
      menuWaitExten = childNodes[waitExtenIdx].data?.seconds ?? 4;
      childNodes.splice(waitExtenIdx, 1); // remove sem alterar posição dos outros
    }

    // BUG 7: Absorb apenas backgrounds rotulados como 'menu' (ou sem rótulo).
    // Backgrounds com outros rótulos (ex: 'bv' para anúncio antes do menu) ficam como standalone.
    // Trabalhamos do final para cima, da mesma forma, ignorando tail-skip types.
    const audioFiles = [];
    let absorbedBgLabel = null; // label do primeiro Background absorvido (exec order)
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      if (node.type !== 'background') {
        if (TAIL_SKIP_TYPES.has(node.type)) continue; // pula hangup/include no final
        break;
      }
      const bgLabel = node.data._label || null;
      if (bgLabel !== null && bgLabel !== 'menu') break; // background standalone — para
      const fnames = node.data?.filenames || [node.data?.filename || ''];
      audioFiles.unshift(...fnames);
      // Captura o label do Background — o mais antigo (primeiro em exec order)
      // é o último que encontramos no loop reverso, então sobrescrevemos sempre
      if (bgLabel) absorbedBgLabel = bgLabel;
      childNodes.splice(i, 1); // remove o background absorvido
    }
    if (audioFiles.length === 0) audioFiles.push('boas-vindas');

    // ── Dígitos numéricos (1-9, 0) ──────────────────────────────────────────
    const DIGIT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const menuDigits = [];

    for (const dig of DIGIT_ORDER) {
      if (!dtmfMap.has(dig)) continue;
      const block = dtmfMap.get(dig);
      const { actions, finalDest, logIvrLabel } = processOptionLines(block.lines); // BUG 2

      if (finalDest?.type === 'context') dtmfGotos[dig] = finalDest.contextName;
      else if (finalDest?.type === 'queue') dtmfGotos[dig] = finalDest.ctx;

      menuDigits.push({
        id:               dig,
        label:            block.comment || `Opcao ${dig}`,
        comment:          block.comment || null,
        actions,
        finalDestination: finalDest,
        logIvrLabel:      logIvrLabel || null,   // BUG 2: label original do Macro(logIvr,...)
      });
    }

    // ── Opções i (inválido) e t (timeout) ───────────────────────────────────
    let invalidMacro = '';
    let timeoutMacro = '';
    let invalidOption = null;
    let timeoutOption = null;

    for (const ext of ['i', 't']) {
      if (!dtmfMap.has(ext)) continue;
      const block = dtmfMap.get(ext);
      const { actions, finalDest, logIvrLabel } = processOptionLines(block.lines); // BUG 2

      if (finalDest?.type === 'context') dtmfGotos[ext] = finalDest.contextName;
      else if (finalDest?.type === 'queue') dtmfGotos[ext] = finalDest.ctx;

      const optObj = { comment: block.comment || null, actions, finalDestination: finalDest, logIvrLabel: logIvrLabel || null };

      if (ext === 'i') {
        invalidOption = optObj;
        const macroAct = actions.find((a) => a.type === 'macro');
        if (macroAct) invalidMacro = macroAct.data.name || '';
        if (!invalidMacro) {
          const rawMacro = block.lines.find((l) => /^Macro$/i.test(l.application));
          if (rawMacro) invalidMacro = rawMacro.args.split(',')[0] || '';
        }
      } else {
        timeoutOption = optObj;
        const macroAct = actions.find((a) => a.type === 'macro');
        if (macroAct) timeoutMacro = macroAct.data.name || '';
        if (!timeoutMacro) {
          const rawMacro = block.lines.find((l) => /^Macro$/i.test(l.application));
          if (rawMacro) timeoutMacro = rawMacro.args.split(',')[0] || '';
        }
      }
    }

    // ── Adiciona MenuNode ────────────────────────────────────────────────────
    childNodes.push({
      type: 'menu',
      data: {
        contextName:      rawCtx.name,
        audioFiles,
        greeting:         audioFiles[0] || 'boas-vindas', // compat legado
        label:            absorbedBgLabel || 'menu',       // label do Background absorvido
        waitExten:        menuWaitExten,
        waitSeconds:      menuWaitExten,
        digits:           menuDigits,
        invalidMacro,
        timeoutMacro,
        invalidMacroName: invalidMacro,  // nome exato preservado (sem replace)
        timeoutMacroName: timeoutMacro,  // nome exato preservado (sem replace)
        invalidOption,
        timeoutOption,
        maxRetry:         2,
        retryGoto:        '',
        invalidSound:     '',
        _dtmfGotos:       dtmfGotos,
      },
      _menuNodeMarker: true,
    });
  }

  // ── 5. Append include directives ao FINAL (após todos os exten =>)
  for (const inc of includeNodes) {
    childNodes.push(inc);
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

  // Detect whether the first context is a real GlobalConfig (defines SOUND_PATH or AGI_PATH).
  // Contexts that only set __IVR (like [ura-principal-sac]) are regular IVR entry contexts,
  // not setup-only blocks — they must NOT be treated as GlobalConfig.
  const isRealGlobalConfig = isGlobalConfigCtx(rawContexts[0]);
  const globalConfig = isRealGlobalConfig
    ? extractGlobalConfig(rawContexts[0])
    : { ivr: '', soundPath: '', agiPath: '', language: '', comment: '', numberDialed: false, logIvr: false };

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
    // isFirstContext: only true when the first context IS a real GlobalConfig setup block.
    // Otherwise all contexts are treated as regular ContextNodes (no lines skipped).
    const { childNodes, dtmfGotos, directives } = resolveContext(rawCtx, globalConfig, isRealGlobalConfig && i === 0);

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
    isRealGlobalConfig, // true when first context defines SOUND_PATH/AGI_PATH
    suggestedName,
    contexts: resolvedContexts,
    crossRefs,
    unresolvedRefs,
    stats,
  };
}
