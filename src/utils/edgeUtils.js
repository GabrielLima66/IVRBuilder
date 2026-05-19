import { Position } from 'reactflow';

/**
 * Calcula o ponto onde a linha traçada do centro de intersectionNode em
 * direção ao centro de targetNode cruza a borda de intersectionNode.
 * Usa aproximação por elipse inscrita no bounding-box do nó.
 */
function getNodeIntersection(intersectionNode, targetNode) {
  const { width: w1 = 1, height: h1 = 1, positionAbsolute: p1 } = intersectionNode;
  const { positionAbsolute: p2, width: w2 = 0, height: h2 = 0 } = targetNode;

  const cx1 = p1.x + w1 / 2;
  const cy1 = p1.y + h1 / 2;
  const cx2 = p2.x + w2 / 2;
  const cy2 = p2.y + h2 / 2;

  // Direção normalizada em coordenadas de elipse
  const xx1 = (cx2 - cx1) / (2 * w1) - (cy2 - cy1) / (2 * h1);
  const yy1 = (cx2 - cx1) / (2 * w1) + (cy2 - cy1) / (2 * h1);
  const a   = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);

  return {
    x: (w1 / 2) * a * (xx1 + yy1) + cx1,
    y: (h1 / 2) * a * (-xx1 + yy1) + cy1,
  };
}

/**
 * Determina em qual borda do nó o ponto de interseção se encontra.
 * Retorna Position.Left | Right | Top | Bottom.
 */
function getEdgeSide(node, point) {
  const { positionAbsolute: p, width = 0, height = 0 } = node;
  const nx = Math.round(p.x);
  const ny = Math.round(p.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);

  if (px <= nx + 1)           return Position.Left;
  if (px >= nx + width - 1)  return Position.Right;
  if (py <= ny + 1)           return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;
  return Position.Top;
}

/**
 * Retorna os parâmetros para uma FloatingEdge sem waypoints.
 * Endpoints calculados em relação ao centro de cada nó.
 */
export function getEdgeParams(sourceNode, targetNode) {
  const srcPt = getNodeIntersection(sourceNode, targetNode);
  const tgtPt = getNodeIntersection(targetNode, sourceNode);

  return {
    sx: srcPt.x,
    sy: srcPt.y,
    tx: tgtPt.x,
    ty: tgtPt.y,
    sourcePos: getEdgeSide(sourceNode, srcPt),
    targetPos: getEdgeSide(targetNode, tgtPt),
  };
}

/**
 * Versão dirigida — usada quando a edge tem waypoints.
 * Source endpoint: calculado em direção ao PRIMEIRO waypoint.
 * Target endpoint: calculado a partir do ÚLTIMO waypoint.
 * Garante que a edge entre/saia pelo lado geometricamente correto.
 */
export function getEdgeParamsDirected(sourceNode, targetNode, firstWp, lastWp) {
  const pt2node = (pt) => ({ positionAbsolute: pt, width: 0, height: 0 });
  const srcPt = getNodeIntersection(sourceNode, pt2node(firstWp));
  const tgtPt = getNodeIntersection(targetNode, pt2node(lastWp));
  return {
    sx: srcPt.x, sy: srcPt.y,
    tx: tgtPt.x, ty: tgtPt.y,
    sourcePos: getEdgeSide(sourceNode, srcPt),
    targetPos: getEdgeSide(targetNode, tgtPt),
  };
}

/**
 * Handles semanticamente fixos — edges com esses handles usam 'smoothstep' (não floating).
 *
 * ctx-start : ContextNode SOURCE — determina o 1º nó da sequência interna.
 *             Deve sair da faixa START, posição visual obrigatória.
 * d-*       : MenuNode DTMF — cada dígito tem uma linha de saída à direita.
 *             Manter fixo preserva o alinhamento visual com a linha do dígito.
 *
 * Removidos de FIXED (agora são floating e aceitam waypoints):
 *   ctx-in  — edges que chegam ao ContextNode pelo topo podem ser curvadas
 *   true    — branch do TimeNode (já tem código explícito em onConnect para cor)
 *   closed  — fall-through do TimeNode
 *   open    — legado
 */
const FIXED_HANDLES = new Set(['ctx-start']);

export function isSemanticHandle(handle) {
  if (!handle) return false;
  // ctx-start fixo + dígitos DTMF (d-1, d-2, d-i, d-t, …)
  return FIXED_HANDLES.has(handle) || /^d-/.test(handle);
}
