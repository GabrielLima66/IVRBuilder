/**
 * confLayout.js — fase 4 do pipeline de importação .conf.
 * Calcula posições x/y e dimensões dos ContextNodes e do GlobalConfigNode.
 *
 * Usa as constantes e funções de contextDimensions.js para garantir que
 * as dimensões calculadas aqui sejam idênticas às que o ContextNode.jsx
 * calcula dinamicamente no canvas (evita saltos visuais ao abrir o canvas).
 *
 * @typedef {Object} ContextLayout
 * @property {string} ctxId               ID do ContextNode
 * @property {{ x: number, y: number }} position
 * @property {number} width               largura calculada
 * @property {number} height              altura calculada
 * @property {number} childWidth          largura forçada em cada filho
 * @property {Array<{ nodeIdx: number, x: number, y: number }>} childPositions
 *
 * @typedef {Object} LayoutResult
 * @property {{ x: number, y: number }} configPosition
 * @property {ContextLayout[]} contextLayouts
 */

import {
  CTX_HEADER_H,
  CTX_PAD_TOP,
  CTX_PAD_H,
  CTX_PAD_BOTTOM,
  CTX_MIN_W,
  CTX_CHILD_GAP,
  NODE_DEFAULT_WIDTH,
  getNodeHeight,
  calculateContextDimensions,
} from '../contextDimensions.js';

// ── Constantes de grid ────────────────────────────────────────────────────────

/** Gap horizontal entre ContextNodes adjacentes */
export const CTX_COL_GAP = 120;   // px

/** Y fixo de todos os ContextNodes (abaixo do GlobalConfigNode) */
export const CTX_ROW_Y   = 240;   // px — um pouco mais que o legado para dar espaço ao GlobalConfig

/**
 * Calcula o layout completo para o grafo resolvido.
 * GlobalConfigNode centralizado horizontalmente acima dos ContextNodes.
 * ContextNodes dispostos em grade da esquerda para a direita.
 * Nós filhos empilhados verticalmente dentro de cada ContextNode.
 *
 * @param {import('./confResolver.js').ResolvedGraph} graph
 * @returns {LayoutResult}
 */
export function calculateLayout(graph) {
  const { contexts } = graph;
  const CONFIG_WIDTH  = 260; // largura estimada do GlobalConfigNode

  /** @type {ContextLayout[]} */
  const contextLayouts = [];
  let xOffset = 50;

  for (const ctx of contexts) {
    const childPositions = [];

    // ── Calcula altura de cada filho ──────────────────────────────────────
    const childHeights = ctx.childNodes.map((n) => getNodeHeight(n));
    const childWidth   = Math.max(
      NODE_DEFAULT_WIDTH,
      ...ctx.childNodes.map((n) => n.width ?? NODE_DEFAULT_WIDTH)
    );

    // ── Posiciona filhos verticalmente ───────────────────────────────────────
    // Começa em CTX_HEADER_H + CTX_PAD_TOP para não sobrepor o cabeçalho
    let yChild = CTX_HEADER_H + CTX_PAD_TOP;
    for (let i = 0; i < ctx.childNodes.length; i++) {
      if (i > 0) yChild += CTX_CHILD_GAP; // gap antes de cada filho (exceto o primeiro)
      childPositions.push({ nodeIdx: i, x: CTX_PAD_H, y: yChild });
      yChild += childHeights[i];
    }

    // ── Calcula dimensões do ContextNode ─────────────────────────────────
    const childDims = ctx.childNodes.map((n, i) => ({
      width:  childWidth,
      height: childHeights[i],
    }));
    const { width, height } = calculateContextDimensions(childDims);

    contextLayouts.push({
      ctxId: ctx.id,
      position:   { x: xOffset, y: CTX_ROW_Y },
      width,
      height,
      childWidth: width - CTX_PAD_H * 2, // largura real dos filhos dentro do contexto
      childPositions,
    });

    xOffset += width + CTX_COL_GAP;
  }

  // ── GlobalConfigNode: centralizado acima dos contextos ─────────────────
  const totalCtxWidth = xOffset - CTX_COL_GAP - 50; // total ocupado pelos contextos
  const configX = Math.max(50, 50 + (totalCtxWidth - CONFIG_WIDTH) / 2);
  const configPosition = { x: configX, y: 20 };

  return { configPosition, contextLayouts };
}
