import React, { useCallback } from 'react';
import { useStore, getSmoothStepPath, BaseEdge } from 'reactflow';
import { getEdgeParams } from '../../utils/edgeUtils';

/**
 * FloatingEdge — edge com pontos de conexão dinâmicos.
 *
 * Diferente das edges fixas (smoothstep), esta edge ignora handles pré-definidos
 * e calcula em tempo real qual lado de cada nó gera o caminho mais direto.
 * Reage automaticamente quando qualquer nó é arrastado no canvas.
 *
 * Participam desse sistema: todos os nós com handles padrão (in, out, etc.)
 * Ficam fora: ctx-start, ctx-in, true, closed e handles DTMF (d-1, d-i …)
 */
export default function FloatingEdge({ id, source, target, markerEnd, style }) {
  // nodeInternals contém positionAbsolute e dimensões reais — atualizados em tempo real
  const sourceNode = useStore(
    useCallback((s) => s.nodeInternals.get(source), [source])
  );
  const targetNode = useStore(
    useCallback((s) => s.nodeInternals.get(target), [target])
  );

  // Aguarda as dimensões serem calculadas pelo React Flow
  if (
    !sourceNode?.positionAbsolute ||
    !targetNode?.positionAbsolute ||
    !sourceNode.width ||
    !targetNode.width
  ) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  const [edgePath] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={style}
    />
  );
}
