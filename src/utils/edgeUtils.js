import { Position } from 'reactflow';

/** Returns the center coordinate of a cardinal handle on the node border */
function getHandleCenter(node, position) {
  const { positionAbsolute: p, width = 0, height = 0 } = node;
  switch (position) {
    case Position.Right:  return { x: p.x + width,     y: p.y + height / 2 };
    case Position.Left:   return { x: p.x,             y: p.y + height / 2 };
    case Position.Top:    return { x: p.x + width / 2, y: p.y };
    case Position.Bottom: return { x: p.x + width / 2, y: p.y + height };
    default:              return { x: p.x + width / 2, y: p.y + height / 2 };
  }
}

/**
 * Horizontal-first handle selection.
 *
 * Rules (A = source, B = target, compared by center points):
 *   B below+right  → exit Right of A,  enter Top    of B
 *   B below+left   → exit Left of A,   enter Top    of B
 *   B above+right  → exit Right of A,  enter Bottom of B
 *   B above+left   → exit Left of A,   enter Bottom of B
 *   B directly below  (|dx| < threshold) → exit Bottom of A, enter Top   of B
 *   B directly above  (|dx| < threshold) → exit Top    of A, enter Bottom of B
 *   B directly right  (|dy| < threshold) → exit Right  of A, enter Left  of B
 *   B directly left   (|dy| < threshold) → exit Left   of A, enter Right of B
 */
const DIRECT_THRESHOLD = 30; // px — within this = "directly" aligned

function resolveHandles(scx, scy, tcx, tcy) {
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (Math.abs(dx) < DIRECT_THRESHOLD) {
    const down = dy >= 0;
    return {
      sourcePosition: down ? Position.Bottom : Position.Top,
      targetPosition: down ? Position.Top    : Position.Bottom,
    };
  }
  if (Math.abs(dy) < DIRECT_THRESHOLD) {
    const right = dx >= 0;
    return {
      sourcePosition: right ? Position.Right : Position.Left,
      targetPosition: right ? Position.Left  : Position.Right,
    };
  }
  // Diagonal: horizontal-first — exit right/left, enter top/bottom
  return {
    sourcePosition: dx >= 0 ? Position.Right  : Position.Left,
    targetPosition: dy >= 0 ? Position.Top    : Position.Bottom,
  };
}

/**
 * Retorna os parâmetros para uma FloatingEdge sem waypoints.
 * Handle de saída/entrada calculados com regra horizontal-first.
 */
export function getEdgeParams(sourceNode, targetNode) {
  const { positionAbsolute: sp, width: sw = 0, height: sh = 0 } = sourceNode;
  const { positionAbsolute: tp, width: tw = 0, height: th = 0 } = targetNode;

  const scx = sp.x + sw / 2;
  const scy = sp.y + sh / 2;
  const tcx = tp.x + tw / 2;
  const tcy = tp.y + th / 2;

  const { sourcePosition, targetPosition } = resolveHandles(scx, scy, tcx, tcy);
  const srcPt = getHandleCenter(sourceNode, sourcePosition);
  const tgtPt = getHandleCenter(targetNode, targetPosition);

  return {
    sx: srcPt.x, sy: srcPt.y,
    tx: tgtPt.x, ty: tgtPt.y,
    sourcePos: sourcePosition,
    targetPos: targetPosition,
  };
}

/**
 * Versão dirigida — usada quando a edge tem waypoints.
 * Source endpoint: calculado em direção ao PRIMEIRO waypoint.
 * Target endpoint: calculado a partir do ÚLTIMO waypoint.
 * Aplica a mesma regra horizontal-first para consistência visual.
 */
export function getEdgeParamsDirected(sourceNode, targetNode, firstWp, lastWp) {
  const { positionAbsolute: sp, width: sw = 0, height: sh = 0 } = sourceNode;
  const { positionAbsolute: tp, width: tw = 0, height: th = 0 } = targetNode;

  const scx = sp.x + sw / 2;
  const scy = sp.y + sh / 2;
  const tcx = tp.x + tw / 2;
  const tcy = tp.y + th / 2;

  // Source exits toward the first waypoint
  const { sourcePosition } = resolveHandles(scx, scy, firstWp.x, firstWp.y);
  // Target is entered from the direction of the last waypoint
  const { targetPosition } = resolveHandles(lastWp.x, lastWp.y, tcx, tcy);

  const srcPt = getHandleCenter(sourceNode, sourcePosition);
  const tgtPt = getHandleCenter(targetNode, targetPosition);

  return {
    sx: srcPt.x, sy: srcPt.y,
    tx: tgtPt.x, ty: tgtPt.y,
    sourcePos: sourcePosition,
    targetPos: targetPosition,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Obstacle avoidance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se o segmento (sx,sy)→(tx,ty) intersecta o retângulo dado.
 * Usa o algoritmo paramétrico linha × aresta-do-rect.
 */
function lineIntersectsRect(sx, sy, tx, ty, rect) {
  const { left, top, right, bottom } = rect;

  // Descarte rápido por bounding box
  if (Math.max(sx, tx) < left  || Math.min(sx, tx) > right  ||
      Math.max(sy, ty) < top   || Math.min(sy, ty) > bottom) return false;

  const dx = tx - sx;
  const dy = ty - sy;

  // Testa cada aresta do retângulo usando parâmetro t ∈ [0,1]
  const tests = [];
  if (dx !== 0) {
    tests.push({ t: (left  - sx) / dx, key: 'y', lo: top,  hi: bottom });
    tests.push({ t: (right - sx) / dx, key: 'y', lo: top,  hi: bottom });
  }
  if (dy !== 0) {
    tests.push({ t: (top    - sy) / dy, key: 'x', lo: left, hi: right });
    tests.push({ t: (bottom - sy) / dy, key: 'x', lo: left, hi: right });
  }

  for (const { t, key, lo, hi } of tests) {
    if (t < 0 || t > 1) continue;
    const pt = key === 'y' ? sy + t * dy : sx + t * dx;
    if (pt >= lo && pt <= hi) return true;
  }
  return false;
}

/**
 * Calcula um ponto de desvio para a edge (sx,sy)→(tx,ty) contornar obstáculos.
 *
 * @param {number} sx - X de origem da edge
 * @param {number} sy - Y de origem
 * @param {number} tx - X de destino
 * @param {number} ty - Y de destino
 * @param {Array}  allNodes - todos os nós do store (com positionAbsolute)
 * @param {string} sourceId - id do nó de origem (excluído da checagem)
 * @param {string} targetId - id do nó de destino (excluído da checagem)
 * @param {string} [sourceParentId] - ContextNode pai da origem (excluído)
 * @param {string} [targetParentId] - ContextNode pai do destino (excluído)
 * @returns {{ x: number, y: number } | null}
 */
export function computeObstacleAvoidance(sx, sy, tx, ty, allNodes, sourceId, targetId, sourceParentId, targetParentId) {
  const PAD = 28; // padding externo ao bounding box do nó

  let bestDetour = null;
  let bestCost   = Infinity;

  for (const node of allNodes) {
    if (node.id === sourceId || node.id === targetId) continue;
    if (sourceParentId && node.id === sourceParentId) continue;
    if (targetParentId && node.id === targetParentId) continue;
    if (!node.positionAbsolute || !node.width || !node.height) continue;
    if (node.width < 20 || node.height < 20) continue;

    const bbox = {
      left:   node.positionAbsolute.x - PAD,
      top:    node.positionAbsolute.y - PAD,
      right:  node.positionAbsolute.x + node.width  + PAD,
      bottom: node.positionAbsolute.y + node.height + PAD,
    };

    if (!lineIntersectsRect(sx, sy, tx, ty, bbox)) continue;

    // Ponto de desvio: midpoint do segmento projetado em cada lado do bbox
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;

    const candidates = [
      { x: midX,       y: bbox.top    },
      { x: midX,       y: bbox.bottom },
      { x: bbox.left,  y: midY        },
      { x: bbox.right, y: midY        },
    ];

    for (const c of candidates) {
      const cost = Math.hypot(c.x - sx, c.y - sy) + Math.hypot(c.x - tx, c.y - ty);
      if (cost < bestCost) { bestCost = cost; bestDetour = c; }
    }
  }

  return bestDetour;
}

/**
 * Handles semanticamente fixos — edges com esses handles usam 'smoothstep' (não floating).
 *
 * ctx-start : ContextNode SOURCE — determina o 1º nó da sequência interna.
 *             Deve sair da faixa START, posição visual obrigatória.
 *
 * d-* (DTMF): NÃO usa smoothstep. Permanece como 'floating' (EdgeWithWaypoints),
 *             que lê rfSourceX/Y do React Flow para usar a posição real de cada
 *             handle e aplica roteamento floating-style no lado do target.
 */
const FIXED_HANDLES = new Set(['ctx-start']);

export function isSemanticHandle(handle) {
  if (!handle) return false;
  return FIXED_HANDLES.has(handle);
}
