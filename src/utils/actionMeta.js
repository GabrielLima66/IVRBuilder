import {
  CornerDownRight, Undo2, Scissors,
  Terminal, Boxes, GitBranch, TimerReset, MessageSquare, Megaphone,
  Keyboard, ListOrdered, Hash, Disc, Square, Eye,
  PhoneCall, Timer, Play,
  Pen, GitFork, PhoneOutgoing, Volume2, Hourglass,
  Link2, Tag,
} from 'lucide-react';

// ── Helpers de validação reutilizáveis ───────────────────────────────────────
const ok = () => [];
const req = (val, label) => (val?.trim() ? [] : [`${label} é obrigatório`]);
const reqNum = (val, label) => {
  const n = Number(val);
  return !isNaN(n) && n > 0 ? [] : [`${label} deve ser numérico positivo`];
};
// Resolve parâmetros variádicos com backward-compat para campo `args` legado
const resolveParams = (params, args) => {
  const arr = Array.isArray(params) ? params.filter((p) => String(p ?? '').trim()) : [];
  return arr.length ? arr.join(',') : (args?.trim() || '');
};

export const ACTION_META = {
  // ── Controle de Fluxo ────────────────────────────────────────────────────
  gosub: {
    title: 'GOSUB', app: 'Gosub', icon: CornerDownRight, color: '#00d4ff', category: 'flow',
    summary: (d) => [
      { k: 'context', v: d.context || '—' },
      { k: 'ext/pri', v: `${d.extension || 's'},${d.priority || '1'}` },
      { k: 'args',    v: resolveParams(d.params, d.args) || '—' },
    ],
    validate: (d) => req(d.context, 'Contexto'),
  },
  return: {
    title: 'RETURN', app: 'Return', icon: Undo2, color: '#00d4ff', category: 'flow',
    terminal: true,
    summary: (d) => [{ k: 'value', v: d.value || '(empty)' }],
    validate: ok,
  },
  hangup: {
    title: 'HANGUP', app: 'Hangup', icon: Scissors, color: '#ff5050', category: 'flow',
    terminal: true,
    summary: (d) => [{ k: 'cause', v: d.causeCode || '(default)' }],
    validate: ok,
  },
  gotoif: {
    title: 'GOTOIF', app: 'GotoIf', icon: GitFork, color: '#00d4ff', category: 'flow',
    summary: (d) => [
      { k: 'expr',  v: d.expression       || '—' },
      { k: 'true',  v: d.trueDestination  || '(fall-through)' },
      { k: 'false', v: d.falseDestination || '(fall-through)' },
    ],
    validate: (d) => req(d.expression, 'Expressão lógica'),
  },

  // ── Execução Lógica ───────────────────────────────────────────────────────
  set: {
    title: 'SET', app: 'Set', icon: Pen, color: '#a78bfa', category: 'logic',
    supportsLabel: true, // reset de estado — destino de re-entrada
    summary: (d) => [{ k: 'assign', v: d.assignment || '—' }],
    validate: (d) => {
      if (!d.assignment?.trim()) return ['Formato obrigatório: VARIAVEL=valor'];
      if (!d.assignment.includes('=')) return ['Faltando = (use VAR=valor)'];
      const left = d.assignment.split('=')[0];
      if (!left.trim()) return ['Nome da variável inválido'];
      return [];
    },
  },
  agi: {
    title: 'AGI', app: 'Agi', icon: Terminal, color: '#a78bfa', category: 'logic',
    supportsLabel: true, // re-entrada em consulta AGI
    summary: (d) => [
      { k: 'script', v: d.script || '—' },
      { k: 'params', v: resolveParams(d.params, d.args) || '—' },
    ],
    validate: (d) => req(d.script, 'Script AGI'),
  },
  macro: {
    title: 'MACRO', app: 'Macro', icon: Boxes, color: '#a78bfa', category: 'logic',
    supportsLabel: true, // re-entrada em macro
    summary: (d) => [
      { k: 'name',   v: d.name || '—' },
      { k: 'params', v: resolveParams(d.params, d.args) || '—' },
    ],
    validate: (d) => req(d.name, 'Nome da macro'),
  },
  execif: {
    title: 'EXEC IF', app: 'ExecIf', icon: GitBranch, color: '#a78bfa', category: 'logic',
    summary: (d) => [
      { k: 'cond',  v: d.expression || '—' },
      { k: 'apply', v: d.action     || '—' },
    ],
    validate: (d) => req(d.expression, 'Expressão'),
  },
  execiftime: {
    title: 'EXEC IF TIME', app: 'ExecIfTime', icon: TimerReset, color: '#a78bfa', category: 'logic',
    summary: (d) => [
      { k: 'time',  v: `${d.hours || '*'} / ${d.days || '*'}` },
      { k: 'apply', v: d.action || '—' },
    ],
    validate: ok,
  },
  noop: {
    title: 'NOOP', app: 'Noop', icon: MessageSquare, color: '#888888', category: 'logic',
    supportsLabel: true, // marcador/âncora no fluxo
    summary: (d) => [{ k: 'text', v: d.text || '—' }],
    validate: ok,
  },
  verbose: {
    title: 'VERBOSE', app: 'Verbose', icon: Megaphone, color: '#888888', category: 'logic',
    summary: (d) => [
      { k: 'level', v: String(d.level ?? 3) },
      { k: 'msg',   v: d.message || '—' },
    ],
    validate: ok,
  },

  // ── Interação / Monitoramento ─────────────────────────────────────────────
  dial: {
    title: 'DIAL', app: 'Dial', icon: PhoneOutgoing, color: '#ff8c00', category: 'io',
    summary: (d) => [
      { k: 'dest',    v: d.destination || '—' },
      { k: 'timeout', v: d.timeout     || '—' },
      { k: 'opts',    v: d.options     || '—' },
    ],
    validate: (d) => {
      if (!d.destination?.trim()) return ['Destino obrigatório (ex: SIP/3885)'];
      if (!/[A-Za-z]+\//.test(d.destination.trim())) return ['Use Tecnologia/recurso (ex: SIP/ramal)'];
      return [];
    },
  },
  read: {
    title: 'READ DTMF', app: 'Read', icon: Keyboard, color: '#ffcc00', category: 'io',
    supportsLabel: true, // re-prompt de entrada
    summary: (d) => [
      { k: 'var',    v: d.variable  || '—' },
      { k: 'audio',  v: d.audio     || '—' },
      { k: 'digits', v: `${d.maxDigits || 0} / ${d.timeout || 0}s` },
    ],
    validate: (d) => req(d.variable, 'Variável de destino'),
  },
  saydigits: {
    title: 'SAY DIGITS', app: 'SayDigits', icon: ListOrdered, color: '#ffcc00', category: 'io',
    summary: (d) => [{ k: 'value', v: d.value || '—' }],
    validate: (d) => req(d.value, 'Valor'),
  },
  saynumber: {
    title: 'SAY NUMBER', app: 'SayNumber', icon: Hash, color: '#ffcc00', category: 'io',
    summary: (d) => [
      { k: 'value',  v: d.value  || '—' },
      { k: 'gender', v: d.gender || '—' },
    ],
    validate: (d) => req(d.value, 'Valor'),
  },
  mixmonitor: {
    title: 'MIX MONITOR', app: 'MixMonitor', icon: Disc, color: '#ff8c00', category: 'io',
    summary: (d) => [{ k: 'file', v: `${d.filename || 'rec'}.${d.extension || 'wav'}` }],
    validate: ok,
  },
  stopmonitor: {
    title: 'STOP MONITOR', app: 'StopMonitor', icon: Square, color: '#ff8c00', category: 'io',
    summary: () => [{ k: 'op', v: 'stop recording' }],
    validate: ok,
  },
  chanspy: {
    title: 'CHAN SPY', app: 'ChanSpy', icon: Eye, color: '#ff8c00', category: 'io',
    summary: (d) => [
      { k: 'target',  v: `SIP/${d.target || '—'}` },
      { k: 'options', v: d.options || '—' },
    ],
    validate: (d) => req(d.target, 'Ramal alvo'),
  },

  // ── Diretivas de Contexto ──────────────────────────────────────────────────
  include: {
    title: 'INCLUDE', app: 'include', icon: Link2, color: '#00d4ff', category: 'flow',
    summary: (d) => [{ k: 'context', v: d.contextName || '—' }],
    validate: (d) => req(d.contextName, 'Contexto'),
  },

  // ── Integração SIP ─────────────────────────────────────────────────────────
  sipaddheader: {
    title: 'SIP ADD HEADER', app: 'SIPAddHeader', icon: Tag, color: '#00d4ff', category: 'io',
    summary: (d) => [
      { k: 'header', v: d.headerName || '—' },
      { k: 'value',  v: d.value      || '—' },
    ],
    validate: (d) => req(d.headerName, 'Nome do header'),
  },

  // ── Sistema / Áudio ───────────────────────────────────────────────────────
  answer: {
    title: 'ANSWER', app: 'Answer', icon: PhoneCall, color: '#00ff41', category: 'system',
    summary: () => [{ k: 'op', v: 'Answer()' }],
    validate: ok,
  },
  wait: {
    title: 'WAIT', app: 'Wait', icon: Timer, color: '#00ff41', category: 'system',
    summary: (d) => [{ k: 'segundos', v: String(d.seconds ?? 1) }],
    validate: (d) => reqNum(d.seconds, 'Segundos'),
  },
  waitexten: {
    title: 'WAIT EXTEN', app: 'WaitExten', icon: Hourglass, color: '#00ff41', category: 'system',
    supportsLabel: true, // ponto de re-entrada para DTMF
    summary: (d) => [{ k: 'segundos', v: String(d.seconds ?? 4) }],
    validate: (d) => reqNum(d.seconds, 'Segundos'),
  },
  playback: {
    title: 'PLAYBACK', app: 'Playback', icon: Play, color: '#00ff41', category: 'system',
    supportsLabel: true, // ponto de re-início de áudio
    summary: (d) => [{ k: 'arquivo', v: d.filename || '—' }],
    validate: (d) => req(d.filename, 'Arquivo de áudio'),
  },
  background: {
    title: 'BACKGROUND', app: 'Background', icon: Volume2, color: '#00ff41', category: 'system',
    supportsLabel: true, // padrão (menu) — destino clássico de Goto
    summary: (d) => [{ k: 'arquivo', v: d.filename || '—' }],
    validate: (d) => req(d.filename, 'Arquivo de áudio'),
  },
};

export function actionLine(n) {
  const d = n.data || {};

  switch (n.type) {
    case 'gosub': {
      const params = resolveParams(d.params, d.args);
      // Asterisk: Gosub(ctx,ext,pri(args)) — args in parens after priority.
      // Omit parens entirely when no args (Gosub(ctx,ext,pri) is valid).
      const argsPart = params ? `(${params})` : '';
      return `Gosub(${d.context || ''},${d.extension || 's'},${d.priority || '1'}${argsPart})`;
    }
    case 'return':
      return d.value ? `Return(${d.value})` : `Return()`;
    case 'hangup':
      return d.causeCode ? `Hangup(${d.causeCode})` : `Hangup()`;
    case 'gotoif': {
      const trueDest  = (d.trueDestination  || '').trim();
      const falseDest = (d.falseDestination || '').trim();
      return `GotoIf($[${d.expression || ''}]?${trueDest}:${falseDest})`;
    }
    case 'set':
      return `Set(${d.assignment || ''})`;
    case 'agi': {
      const params = resolveParams(d.params, d.args);
      return `AGI(\${AGI_PATH}/${d.script || ''}${params ? ',' + params : ''})`;
    }
    case 'macro': {
      const params = resolveParams(d.params, d.args);
      return `Macro(${d.name || ''}${params ? ',' + params : ''})`;
    }
    case 'execif':
      return `ExecIf($[${d.expression || ''}]?${d.action || ''})`;
    case 'execiftime':
      return `ExecIfTime(${d.hours || '*'},${d.days || '*'},${d.monthdays || '*'},${d.months || '*'}?${d.action || ''})`;
    case 'noop':
      return `Noop(${d.text || ''})`;
    case 'verbose':
      return `Verbose(${d.level ?? 3},${d.message || ''})`;
    case 'dial': {
      // Dial(destination[,timeout[,options]])
      let line = (d.destination || '').trim();
      const timeout = (d.timeout || '').trim();
      const options = (d.options  || '').trim();
      if (timeout)       line += ',' + timeout;
      if (options && !timeout) line += ','; // placeholder when no timeout but has options
      if (options)       line += ',' + options;
      return `Dial(${line})`;
    }
    case 'read':
      return `Read(${d.variable || 'VAR'},\${SOUND_PATH}/${d.audio || ''},${d.maxDigits || 1},,${d.timeout || 5})`;
    case 'saydigits':
      return `SayDigits(${d.value || ''})`;
    case 'saynumber':
      return `SayNumber(${d.value || ''}${d.gender ? ',' + d.gender : ''})`;
    case 'mixmonitor':
      return `MixMonitor(${d.filename || 'rec'}.${d.extension || 'wav'})`;
    case 'stopmonitor':
      return `StopMonitor()`;
    case 'chanspy':
      return `ChanSpy(SIP/${d.target || ''}${d.options ? ',' + d.options : ''})`;
    case 'answer':
      return `Answer()`;
    case 'wait':
      return `Wait(${d.seconds ?? 1})`;
    case 'waitexten':
      return `WaitExten(${d.seconds ?? 4})`;
    case 'playback':
      return `Playback(\${SOUND_PATH}/${d.filename || ''})`;
    case 'background': {
      // Suporta múltiplos arquivos: filenames[] tem prioridade sobre filename string
      const files = Array.isArray(d.filenames) && d.filenames.length > 0
        ? d.filenames
        : [d.filename || ''];
      const joined = files.map((f) => `\${SOUND_PATH}/${f}`).join('&');
      return `Background(${joined})`;
    }
    // Diretiva include — sem prefixo exten => (detectado como isRaw no exportador)
    case 'include':
      return `include => ${d.contextName || ''}`;
    // SIP header
    case 'sipaddheader':
      return `SIPAddHeader(${d.headerName || ''}: ${d.value || ''})`;
    default:
      return null;
  }
}
