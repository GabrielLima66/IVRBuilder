/**
 * arrangeContextNodes.js — auto-arranjo horizontal de ContextNodes.
 *
 * Função pura: recebe todos os nós do canvas e retorna apenas os ContextNodes
 * com posições atualizadas. Nunca move o GlobalConfigNode.
 *
 * Regras:
 *  - Contextos normais: dispostos horizontalmente em sequência por exportOrder,
 *    alinhados pelo topo no Y do GlobalConfigNode.
 *  - Contextos de expansão (data.expandedFrom): posicionados à direita do
 *    ContextNode que contém o MenuNode de origem, alinhados verticalmente com ele.
 *  - Nós com data.manuallyPositioned=true são ignorados (a menos que forceAll=true).
 */

import { CTX_MIN_W } from './contextDimensions.js';

/** Gap horizontal entre ContextNodes adjacentes (px) */
export const ARRANGE_GAP_H = 120;

/** Largura estimada do GlobalConfigNode (sem style.width disponível) */
const CONFIG_ESTIMATED_W = 260;

/**
 * Calcula as posições ideais para os ContextNodes do canvas.
 *
 * @param {import('reactflow').Node[]} nodes  todos os nós do canvas
 * @param {{ forceAll?: boolean }} [options]
 *   forceAll: se true, ignora data.manuallyPositioned (usado pelo botão ORGANIZAR)
 * @returns {Array<{ id: string, position: { x: number, y: number } }>}
 *   apenas os nós que devem ser reposicionados
 */
export function arrangeContextNodes(nodes, options = {}) {
  const { forceAll = false } = options;

  const configNode = nodes.find((n) => n.type === 'config' && !n.parentNode);
  const ctxNodes   = nodes.filter((n) => n.type === 'context' && !n.parentNode);

  if (!ctxNodes.length) return [];

  const configX = configNode?.position.x ?? 40;
  const configY = configNode?.position.y ?? 80;
  const targetY = configY; // todos os contextos normais no mesmo Y do config

  // Separa contextos normais dos de expansão DTMF
  const normalCtxs   = ctxNodes.filter((n) => !n.data?.expandedFrom);
  const expandedCtxs = ctxNodes.filter((n) => !!n.data?.expandedFrom);

  // Ordena contextos normais por exportOrder crescente
  const sortedNormal = [...normalCtxs].sort((a, b) => {
    const ao = a.data?.exportOrder ?? 9999;
    const bo = b.data?.exportOrder ?? 9999;
    return ao - bo;
  });

  const updates = [];

  // ── Contextos normais: sequência horizontal a partir do config ────────────
  let xCursor = configX + CONFIG_ESTIMATED_W + ARRANGE_GAP_H;

  for (const ctx of sortedNormal) {
    if (!forceAll && ctx.data?.manuallyPositioned) {
      // Nó posicionado manualmente — mantém, não avança o cursor
      continue;
    }
    updates.push({ id: ctx.id, position: { x: xCursor, y: targetY } });
    const w = ctx.style?.width || ctx.width || CTX_MIN_W;
    xCursor += w + ARRANGE_GAP_H;
  }

  // ── Contextos de expansão: à direita do contexto pai do MenuNode ──────────
  for (const ctx of expandedCtxs) {
    if (!forceAll && ctx.data?.manuallyPositioned) continue;

    const menuNodeId = ctx.data.expandedFrom;
    const menuNode   = nodes.find((n) => n.id === menuNodeId);
    if (!menuNode) continue;

    if (menuNode.parentNode) {
      // MenuNode está dentro de um ContextNode — posiciona à direita desse contexto
      const parentCtx = nodes.find((n) => n.id === menuNode.parentNode);
      if (!parentCtx) continue;
      const parentW = parentCtx.style?.width || parentCtx.width || CTX_MIN_W;
      updates.push({
        id: ctx.id,
        position: {
          x: parentCtx.position.x + parentW + ARRANGE_GAP_H,
          // Y absoluto: topo do contexto pai + Y relativo do MenuNode dentro dele
          y: parentCtx.position.y + (menuNode.position.y || 0),
        },
      });
    } else {
      // MenuNode standalone — posiciona à direita dele
      const menuW = menuNode.style?.width || menuNode.width || 250;
      updates.push({
        id: ctx.id,
        position: {
          x: menuNode.position.x + menuW + ARRANGE_GAP_H,
          y: menuNode.position.y,
        },
      });
    }
  }

  return updates;
}
