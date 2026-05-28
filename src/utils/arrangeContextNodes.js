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

import { CTX_MIN_W, CTX_PAD_H, NODE_DEFAULT_WIDTH } from './contextDimensions.js';

/** Gap horizontal entre ContextNodes adjacentes (px) */
export const ARRANGE_GAP_H = 120;

/** Largura estimada do GlobalConfigNode (sem style.width disponível) */
const CONFIG_ESTIMATED_W = 260;

/**
 * Retorna a largura real de um ContextNode.
 *
 * Prioridade:
 *  1. node.width  — fornecido pelo React Flow após o primeiro render
 *  2. node.style.width — atualizado pelo useEffect do ContextNode
 *  3. Calculado a partir dos filhos — fallback pré-render (ex: importação)
 *  4. CTX_MIN_W — último recurso para contextos sem filhos
 *
 * @param {import('reactflow').Node} ctx
 * @param {Map<string,import('reactflow').Node>} nodeById
 * @returns {number} largura em px
 */
function getContextWidth(ctx, nodeById) {
  if (ctx.width > CTX_MIN_W)        return ctx.width;
  if (ctx.style?.width > CTX_MIN_W) return ctx.style.width;

  // Pré-render: calcula a partir dos filhos (mesmo algoritmo do ContextNode.jsx)
  const childIds = ctx.data?.childOrder || [];
  if (!childIds.length) return CTX_MIN_W;

  let maxChildW = NODE_DEFAULT_WIDTH;
  for (const cid of childIds) {
    const child = nodeById.get(cid);
    if (child) maxChildW = Math.max(maxChildW, child.style?.width || child.width || NODE_DEFAULT_WIDTH);
  }
  return Math.max(CTX_MIN_W, maxChildW + CTX_PAD_H * 2);
}

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

  // O(1) node lookup — evita nodes.find() repetido dentro dos loops abaixo
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let configNode = null;
  const ctxNodes = [];
  for (const n of nodes) {
    if (n.type === 'config' && !n.parentNode) configNode = n;
    else if (n.type === 'context' && !n.parentNode) ctxNodes.push(n);
  }

  if (!ctxNodes.length) return [];

  const configX = configNode?.position.x ?? 40;
  const configY = configNode?.position.y ?? 80;
  const targetY = configY; // todos os contextos normais no mesmo Y do config

  // Separa normais dos de expansão DTMF numa única passagem (js-combine-iterations)
  const normalCtxs   = [];
  const expandedCtxs = [];
  for (const n of ctxNodes) {
    if (n.data?.expandedFrom) expandedCtxs.push(n); else normalCtxs.push(n);
  }

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
    xCursor += getContextWidth(ctx, nodeById) + ARRANGE_GAP_H;
  }

  // ── Contextos de expansão: à direita do contexto pai do MenuNode ──────────
  for (const ctx of expandedCtxs) {
    if (!forceAll && ctx.data?.manuallyPositioned) continue;

    const menuNodeId = ctx.data.expandedFrom;
    const menuNode   = nodeById.get(menuNodeId);
    if (!menuNode) continue;

    if (menuNode.parentNode) {
      // MenuNode está dentro de um ContextNode — posiciona à direita desse contexto
      const parentCtx = nodeById.get(menuNode.parentNode);
      if (!parentCtx) continue;
      updates.push({
        id: ctx.id,
        position: {
          x: parentCtx.position.x + getContextWidth(parentCtx, nodeById) + ARRANGE_GAP_H,
          // Y absoluto: topo do contexto pai + Y relativo do MenuNode dentro dele
          y: parentCtx.position.y + (menuNode.position.y || 0),
        },
      });
    } else {
      // MenuNode standalone — posiciona à direita dele
      const menuW = menuNode.width || menuNode.style?.width || 250;
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
