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

/**
 * Handles semanticamente fixos — edges com esses handles usam 'smoothstep' (não floating).
 *
 * ctx-start : ContextNode SOURCE — determina o 1º nó da sequência interna.
 *             Deve sair da faixa START, posição visual obrigatória.
 * d-*       : MenuNode DTMF — cada dígito tem uma linha de saída à direita.
 *             Manter fixo preserva o alinhamento visual com a linha do dígito.
 */
const FIXED_HANDLES = new Set(['ctx-start']);

export function isSemanticHandle(handle) {
  if (!handle) return false;
  return FIXED_HANDLES.has(handle) || /^d-/.test(handle);
}
