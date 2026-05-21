/**
 * EdgeWithWaypoints — edge com offset elástico.
 *
 * Interação de drag:
 *   - Selecione a edge clicando nela (React Flow nativo)
 *   - Quando selecionada, um handle "⣿ arrastar" aparece no midpoint
 *   - Clique e arraste esse handle para mover a linha inteira como elástico
 *
 * O offset é salvo como { offsetX, offsetY } no edge.data.
 * Reset automático quando um dos nós conectados se move.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  useStore, useReactFlow,
  EdgeLabelRenderer, BaseEdge, getSmoothStepPath,
} from 'reactflow';
import { getEdgeParams, getEdgeParamsDirected } from '../../utils/edgeUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Path ORTOGONAL
// ─────────────────────────────────────────────────────────────────────────────
function buildOrthogonalPath(pts) {
  if (pts.length < 2) return '';
  const R = 6;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const dx = B.x - A.x, dy = B.y - A.y;
    if (Math.abs(dy) < 1) { d += ` L ${B.x} ${B.y}`; continue; }
    if (Math.abs(dx) < 1) { d += ` L ${B.x} ${B.y}`; continue; }
    const r  = Math.min(R, Math.abs(dx) / 2, Math.abs(dy) / 2);
    const bx = B.x - Math.sign(dx) * r;
    const ay = A.y + Math.sign(dy) * r;
    d += ` L ${bx} ${A.y} Q ${B.x} ${A.y} ${B.x} ${ay} L ${B.x} ${B.y}`;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle de drag do midpoint (via EdgeLabelRenderer)
// ─────────────────────────────────────────────────────────────────────────────
const MidpointDragHandle = React.memo(function MidpointDragHandle({ x, y, zoom, onDrag }) {
  const [hov, setHov] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleMouseDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag(true);
    const sx = e.clientX, sy = e.clientY;

    const onMove = (ev) => {
      onDrag((ev.clientX - sx) / zoom, (ev.clientY - sy) / zoom);
    };
    const onUp = () => {
      setDrag(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [zoom, onDrag]);

  return (
    <div
      className="nodrag nopan"
      style={{
        position:  'absolute',
        transform: `translate(-50%,-50%) translate(${x}px,${y}px)`,
        cursor:    drag ? 'grabbing' : 'grab',
        pointerEvents: 'all',
        zIndex:    1001,
        padding:   6,           // área de clique ampliada
        display:   'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => !drag && setHov(false)}
      onMouseDown={handleMouseDown}
    >
      <div style={{
        width:        hov || drag ? 18 : 12,
        height:       hov || drag ? 18 : 12,
        borderRadius: 3,
        background:   '#0d0d0d',
        border:       `1.5px solid ${hov || drag ? '#00ff41' : '#00b32d88'}`,
        boxShadow:    hov || drag ? '0 0 8px #00ff4166' : 'none',
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        fontSize:     9,
        color:        hov || drag ? '#00ff41' : '#00b32d88',
        opacity:      hov || drag ? 1 : 0.7,
        transition:   'all .12s',
        userSelect:   'none',
      }}>
        {hov || drag ? '↕' : '·'}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// EdgeWithWaypoints
// ─────────────────────────────────────────────────────────────────────────────
export default function EdgeWithWaypoints({
  id, source, target, data, markerEnd, style, selected,
}) {
  const { setEdges } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  // Subscrições ao store — TODAS antes do early return
  const sourceNode = useStore(useCallback((s) => s.nodeInternals.get(source), [source]));
  const targetNode = useStore(useCallback((s) => s.nodeInternals.get(target), [target]));

  // Chaves de posição para detectar movimento dos nós conectados
  const srcPosKey = useStore(useCallback((s) => {
    const n = s.nodeInternals.get(source);
    return n?.positionAbsolute
      ? `${Math.round(n.positionAbsolute.x)},${Math.round(n.positionAbsolute.y)}`
      : null;
  }, [source]));
  const tgtPosKey = useStore(useCallback((s) => {
    const n = s.nodeInternals.get(target);
    return n?.positionAbsolute
      ? `${Math.round(n.positionAbsolute.x)},${Math.round(n.positionAbsolute.y)}`
      : null;
  }, [target]));

  const offsetX = data?.offsetX ?? 0;
  const offsetY = data?.offsetY ?? 0;

  // Reseta offset quando nó se move (após o mount inicial)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (offsetX === 0 && offsetY === 0) return;
    setEdges((es) =>
      es.map((e) => e.id === id ? { ...e, data: { ...e.data, offsetX: 0, offsetY: 0 } } : e)
    );
  }, [srcPosKey, tgtPosKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Early return depois de todos os hooks
  if (!sourceNode?.positionAbsolute || !targetNode?.positionAbsolute ||
      !sourceNode.width             || !targetNode.width) return null;

  // ── Cálculo de path ─────────────────────────────────────────────────────
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const hasOffset = Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1;

  let pathD;
  if (!hasOffset) {
    [pathD] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
      targetX: tx, targetY: ty, targetPosition: targetPos,
      borderRadius: 6,
    });
  } else {
    const wpX = (sx + tx) / 2 + offsetX;
    const wpY = (sy + ty) / 2 + offsetY;
    const { sx: dsx, sy: dsy, tx: dtx, ty: dty } =
      getEdgeParamsDirected(sourceNode, targetNode, { x: wpX, y: wpY }, { x: wpX, y: wpY });
    pathD = buildOrthogonalPath([{ x: dsx, y: dsy }, { x: wpX, y: wpY }, { x: dtx, y: dty }]);
  }

  // Posição do handle de drag (midpoint com offset)
  const midX = (sx + tx) / 2 + offsetX;
  const midY = (sy + ty) / 2 + offsetY;

  // Callback de drag: acumula o deslocamento sobre o offset atual
  const handleDrag = useCallback((dx, dy) => {
    setEdges((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        return { ...e, data: { ...(e.data || {}), offsetX: offsetX + dx, offsetY: offsetY + dy } };
      })
    );
  }, [id, offsetX, offsetY, setEdges]);

  return (
    <>
      <BaseEdge id={id} path={pathD} markerEnd={markerEnd} style={style} />

      {/* Handle de drag visível quando edge está selecionada */}
      {selected && (
        <EdgeLabelRenderer>
          <MidpointDragHandle
            x={midX}
            y={midY}
            zoom={zoom}
            onDrag={handleDrag}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
