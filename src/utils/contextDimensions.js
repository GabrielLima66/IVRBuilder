/**
 * contextDimensions.js — cálculo de dimensões de ContextNode e nós filhos.
 *
 * Fonte de verdade: constantes espelham ContextNode.jsx para garantir que
 * as dimensões calculadas na importação sejam idênticas às do canvas.
 *
 * O ContextNode.jsx recalcula dinamicamente via useEffect após o render,
 * mas fornecer valores iniciais corretos evita saltos visuais e overlapping.
 */

// ── Constantes de layout — sincronizadas com ContextNode.jsx ─────────────────

/** Altura do cabeçalho do ContextNode (header com nome do contexto) */
export const CTX_HEADER_H  = 34;   // px

/** Padding entre o cabeçalho e o primeiro nó filho — evita sobreposição com a borda-bottom do header */
export const CTX_PAD_TOP    = 8;   // px

/** Padding horizontal dos nós filhos (20px cada lado = 40px total) */
export const CTX_PAD_H     = 20;   // px por lado

/** Padding inferior do ContextNode */
export const CTX_PAD_BOTTOM = 20;  // px

/** Largura mínima do ContextNode */
export const CTX_MIN_W     = 320;  // px

// ── Alturas estimadas por tipo de nó ─────────────────────────────────────────
//
// Baseadas na estrutura real dos componentes:
//   Header (.rcx-node-header): ~32px
//   Body padding (.rcx-node-body): 16px (8px top + 8px bottom)
//   Cada linha de dados (.rcx-node-row): ~19px (font 11px + padding 4px×2)
//
// Fórmula: 32 + 16 + N_rows × 19   (arredondado para múltiplo de 10)
//
// MenuNode usa cálculo dinâmico — ver getMenuNodeHeight().

export const NODE_DEFAULT_HEIGHTS = {
  // 1 linha de dados → ~67px
  hangup:      70,
  return:      70,
  noop:        70,
  set:         70,
  saydigits:   70,
  mixmonitor:  70,
  stopmonitor: 70,
  answer:      70,
  wait:        70,
  waitexten:   70,
  playback:    70,
  background:  70,
  raw:         90,   // textarea levemente mais alto
  commented:   80,

  // 2 linhas de dados → ~86px
  agi:        90,
  macro:      90,
  execif:     90,
  execiftime: 90,
  verbose:    90,
  saynumber:  90,
  chanspy:    90,

  // 3 linhas de dados → ~105px
  gosub:      110,
  gotoif:     110,
  dial:       110,
  read:       110,

  // Nós estruturais com layouts próprios
  route:      110,   // 3 campos (modo, fila/ctx, opções)
  time:       150,   // horário + dias + meses + destino
  config:     200,   // muitos campos de configuração
  // menu: calculado dinamicamente por getMenuNodeHeight()
};

/** Largura padrão de todos os nós filhos dentro de um ContextNode */
export const NODE_DEFAULT_WIDTH = 280; // px (CTX_MIN_W - 2×CTX_PAD_H = 280)

/** Gap vertical entre nós filhos consecutivos */
export const CTX_CHILD_GAP = 8; // px

// ── Dimensões do MenuNode ─────────────────────────────────────────────────────

/** Altura da seção "digit-row" por opção DTMF (audio, wait, cada opção numérica) */
const DTMF_ROW_H  = 29; // px por linha (padding 4px×2 + font 11px + border 1px ≈ 20px → arredondado)
const MENU_BASE_H = 90; // header + linhas audio/wait + padding body

/**
 * Calcula a altura estimada de um MenuNode com base no número de opções DTMF.
 * Inclui as linhas "invalid" e "timeout" (sempre presentes).
 *
 * @param {number} digitCount - número de opções numéricas (ex: 4 para 1-4)
 * @returns {number} altura em pixels
 */
export function getMenuNodeHeight(digitCount) {
  // audio + wait = 2 linhas s (no body do menu, acima das digit-rows)
  // digits + invalid (i) + timeout (t) = digitCount + 2 digit-rows
  return MENU_BASE_H + (digitCount + 2) * DTMF_ROW_H;
}

/**
 * Retorna a altura estimada de um nó filho, considerando seu tipo e data.
 *
 * @param {{ type: string, data?: Record<string, unknown> }} node
 * @returns {number} altura em pixels
 */
export function getNodeHeight(node) {
  if (node.type === 'menu') {
    const digits = Array.isArray(node.data?.digits) ? node.data.digits.length : 4;
    return getMenuNodeHeight(digits);
  }
  return NODE_DEFAULT_HEIGHTS[node.type] ?? 90;
}

// ── Cálculo de dimensões do ContextNode ──────────────────────────────────────

/**
 * Calcula largura e altura do ContextNode a partir das dimensões dos filhos.
 * Usa a mesma fórmula do ContextNode.jsx (layout useMemo).
 *
 * @param {Array<{ width?: number, height: number }>} childNodes
 * @returns {{ width: number, height: number }}
 */
export function calculateContextDimensions(childNodes) {
  const minInnerW = CTX_MIN_W - CTX_PAD_H * 2; // área interna mínima = 280px

  const maxChildW = childNodes.length > 0
    ? Math.max(...childNodes.map((n) => n.width ?? NODE_DEFAULT_WIDTH))
    : minInnerW;

  const innerW = Math.max(minInnerW, maxChildW);
  const ctxW   = innerW + CTX_PAD_H * 2; // 20px cada lado

  // Gap entre filhos: (N-1) × CTX_CHILD_GAP
  const gaps   = childNodes.length > 1 ? (childNodes.length - 1) * CTX_CHILD_GAP : 0;
  const totalH = childNodes.reduce((acc, n) => acc + (n.height ?? 90), 0);
  // CTX_PAD_TOP: espaço entre cabeçalho e primeiro filho (evita sobreposição)
  const ctxH   = CTX_HEADER_H + CTX_PAD_TOP + totalH + gaps + CTX_PAD_BOTTOM;

  return {
    width:  Math.max(CTX_MIN_W, ctxW),
    // mínimo visual = cabeçalho + pad_top + 40px de conteúdo mínimo + padding inferior
    height: Math.max(CTX_HEADER_H + CTX_PAD_TOP + 40 + CTX_PAD_BOTTOM, ctxH),
  };
}
