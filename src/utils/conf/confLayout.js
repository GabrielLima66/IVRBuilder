/**
 * confLayout.js — fase 4 do pipeline de importação .conf.
 * Calcula posições x/y e dimensões dos ContextNodes e do GlobalConfigNode.
 * Usa as mesmas constantes do confParser.js legado para consistência visual.
 *
 * @typedef {Object} ContextLayout
 * @property {string} ctxId       ID do ContextNode
 * @property {{ x: number, y: number }} position
 * @property {number} width
 * @property {number} height
 * @property {Array<{ nodeIdx: number, x: number, y: number }>} childPositions
 *
 * @typedef {Object} LayoutResult
 * @property {{ x: number, y: number }} configPosition
 * @property {ContextLayout[]} contextLayouts
 */

// ── Constantes de layout (idênticas ao confParser.js legado) ─────────────────
export const CTX_MIN_WIDTH  = 520;  // largura mínima do ContextNode
export const CTX_PAD_TOP    = 34;   // altura do header do ContextNode
export const CTX_PAD_BOTTOM = 20;   // padding inferior
export const CTX_PAD_H      = 20;   // padding horizontal dos filhos
export const NODE_H         = 60;   // altura estimada de um nó filho
export const NODE_GAP       = 0;    // gap entre filhos (colados verticalmente)
export const CTX_COL_GAP    = 120;  // gap horizontal entre ContextNodes
export const CTX_ROW_Y      = 220;  // Y fixo de todos os ContextNodes

/**
 * Calcula o layout completo para o grafo resolvido.
 * GlobalConfigNode é centralizado horizontalmente acima dos ContextNodes.
 * ContextNodes são dispostos em grade simples da esquerda para a direita.
 * Child nodes são empilhados verticalmente dentro de cada ContextNode.
 *
 * @param {import('./confResolver.js').ResolvedGraph} graph
 * @returns {LayoutResult}
 */
export function calculateLayout(graph) {
  const { contexts } = graph;
  const CONFIG_WIDTH = 220;  // largura estimada do GlobalConfigNode

  /** @type {ContextLayout[]} */
  const contextLayouts = [];
  let xOffset = 50;

  for (const ctx of contexts) {
    const childPositions = [];
    let yChild = CTX_PAD_TOP;

    // Each child node gets a vertical slot
    for (let i = 0; i < ctx.childNodes.length; i++) {
      childPositions.push({ nodeIdx: i, x: CTX_PAD_H, y: yChild });
      yChild += NODE_H + NODE_GAP;
    }

    // MenuNode takes extra vertical space for the macro nodes below it
    // The macroStackY offset is already encoded in childNodes order,
    // but we need to compensate for the menu node itself which is taller.
    // Detect MenuNode(s) and add extra height for visual spacing.
    for (let i = 0; i < ctx.childNodes.length; i++) {
      const n = ctx.childNodes[i];
      if (n._menuNodeMarker) {
        // Add extra gap after menu node (visible height is ~160px)
        const extraH = 100; // visual clearance below menu
        // Shift all subsequent child positions down
        for (let j = i + 1; j < childPositions.length; j++) {
          childPositions[j].y += extraH;
        }
        yChild += extraH;
      }
    }

    const height = Math.max(yChild + CTX_PAD_BOTTOM, 220);

    contextLayouts.push({
      ctxId: ctx.id,
      position: { x: xOffset, y: CTX_ROW_Y },
      width: CTX_MIN_WIDTH,
      height,
      childPositions,
    });

    xOffset += CTX_MIN_WIDTH + CTX_COL_GAP;
  }

  // Center the GlobalConfigNode horizontally over all ContextNodes
  const totalCtxWidth =
    contexts.length * CTX_MIN_WIDTH +
    Math.max(0, contexts.length - 1) * CTX_COL_GAP;

  const configX = Math.max(50, 50 + (totalCtxWidth - CONFIG_WIDTH) / 2);
  const configPosition = { x: configX, y: 20 };

  return { configPosition, contextLayouts };
}
