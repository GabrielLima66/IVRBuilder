/**
 * EdgeWithWaypoints — edge com offset elástico + path DTMF independente.
 *
 * ── Edges DTMF (sourceHandle d-*) ────────────────────────────────────────────
 *   Usam Bézier cúbico com arm horizontal fixo de DTMF_ARM px.
 *   Path: M sx sy  C sx+ARM sy,  tx-ARM ty,  tx ty
 *   - sx/sy: posição real do handle (rfSourceX/Y fornecido pelo React Flow)
 *   - tx/ty: posição real do target handle (rfTargetX/Y do React Flow)
 *   - Primeiro control point: mesmo Y que sy → saída 100% horizontal
 *   - Segundo control point:  mesmo Y que ty → chegada 100% horizontal
 *   Cada edge sai paralela no seu próprio Y antes de curvar ao destino.
 *   Sem offset elástico, sem floating recalc, sem MidpointDragHandle.
 *
 * ── Edges floating (demais handles) ─────────────────────────────────────────
 *   Floating handles calculados por getEdgeParams/getEdgeParamsDirected.
 *   Offset elástico via { offsetX, offsetY } em edge.data.
 *   MidpointDragHandle aparece quando a edge está selecionada.
 *   Reset automático quando um dos nós conectados se move.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  useStore, useReactFlow,
  EdgeLabelRenderer, BaseEdge, getSmoothStepPath,
} from 'reactflow';
import { getEdgeParams, getEdgeParamsDirected } from '../../utils/edgeUtils';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';

// Comprimento do arm horizontal na saída/chegada das edges DTMF (px no canvas).
const DTMF_ARM = 80;

// ─────────────────────────────────────────────────────────────────────────────
// Path ORTOGONAL (usado pelas edges floating com offset)
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
// Handle de drag do midpoint (apenas para edges floating não-DTMF)
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
        padding:   6,
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
        background:   'var(--bg)',
        border:       `1.5px solid ${hov || drag ? 'var(--neon)' : 'var(--neon-dim)'}`,
        boxShadow:    hov || drag ? '0 0 8px var(--neon-glow)' : 'none',
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        fontSize:     9,
        color:        hov || drag ? 'var(--neon)' : 'var(--neon-dim)',
        opacity:      hov || drag ? 1 : 0.65,
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
  id, source, target,
  // React Flow v11 passa handle IDs como sourceHandleId/targetHandleId (não sourceHandle).
  // sourceX/Y e targetX/Y são calculados a partir do handle registrado via updateNodeInternals.
  // Para handles DTMF (d-*), cada linha do MenuNode tem rfSourceX/Y próprios.
  sourceX: rfSourceX, sourceY: rfSourceY,
  targetX: rfTargetX, targetY: rfTargetY,
  sourceHandleId,          // ← nome real do prop no React Flow v11
  data, markerEnd, style, selected,
}) {
  const { setEdges } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  // Estado de seleção visual — ANTES do early return (Rules of Hooks)
  const { activeEdgeIds } = useActiveSelection();
  const isActive      = activeEdgeIds.has(id);
  // Edge em repouso: tracejada, 25% opacidade.
  // Edge ativa: sólida, 100% opacidade, brilho pulsante.
  //
  // Cores: se o stroke armazenado for o verde padrão (#00ff41) ou ausente,
  // usa var(--neon) para suportar troca de tema sem re-criar edges.
  const rawStroke       = style?.stroke;
  const isDefaultStroke = !rawStroke || rawStroke === '#00ff41';
  const strokeColor     = isDefaultStroke ? 'var(--neon)' : rawStroke;
  const computedStyle = {
    ...style,
    stroke: strokeColor,          // garante que o path usa a cor correta do tema
    ...(isActive
      ? {
          // Ativo: sólido, glow pulsante via CSS @keyframes edge-glow-pulse
          opacity:             1,
          '--edge-glow-color': strokeColor,
          animation:           'edge-glow-pulse 0.8s ease-in-out infinite',
        }
      : {
          // Repouso: tracejado discreto
          strokeDasharray: '6 4',
          opacity:         0.25,
          animation:       'none',
          filter:          'none',
        }
    ),
  };

  // Subscrições ao store — TODAS antes do early return (Rules of Hooks)
  const sourceNode = useStore(useCallback((s) => s.nodeInternals.get(source), [source]));
  const targetNode = useStore(useCallback((s) => s.nodeInternals.get(target), [target]));

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

  // Reset de offset quando nó conectado se move (no-op para DTMF que não usam offset)
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

  // ── Detecção de handle DTMF ───────────────────────────────────────────────
  // sourceHandleId é o prop correto em React Flow v11 (não sourceHandle).
  const isDtmf = /^d-/.test(sourceHandleId);

  // ── DTMF: Bézier cúbico com arm horizontal independente por handle ─────────
  if (isDtmf && rfSourceX != null) {
    const sx = rfSourceX;
    const sy = rfSourceY;

    // Ponto de chegada: usa posição real do targetHandle fornecida pelo React Flow.
    // Fallback para getEdgeParamsDirected se RF não disponibilizou rfTargetX.
    let tx, ty;
    if (rfTargetX != null) {
      tx = rfTargetX;
      ty = rfTargetY;
    } else {
      const d = getEdgeParamsDirected(sourceNode, targetNode, { x: sx, y: sy }, { x: sx, y: sy });
      tx = d.tx; ty = d.ty;
    }

    // Bézier cúbico: arm horizontal garante saída/chegada paralelas por handle.
    // C1 = (sx+ARM, sy) → sai horizontalmente no Y exato do handle.
    // C2 = (tx-ARM, ty) → chega horizontalmente no Y do target handle.
    // Cada edge tem seu próprio sy, portanto as curvas NÃO convergem.
    const pathD = `M ${sx} ${sy} C ${sx + DTMF_ARM} ${sy}, ${tx - DTMF_ARM} ${ty}, ${tx} ${ty}`;

    return (
      <BaseEdge id={id} path={pathD} markerEnd={markerEnd} style={computedStyle} />
    );
  }

  // ── Floating padrão (todos os demais handles) ─────────────────────────────
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

  const midX = (sx + tx) / 2 + offsetX;
  const midY = (sy + ty) / 2 + offsetY;

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
      <BaseEdge id={id} path={pathD} markerEnd={markerEnd} style={computedStyle} />
      {selected && (
        <EdgeLabelRenderer>
          <MidpointDragHandle x={midX} y={midY} zoom={zoom} onDrag={handleDrag} />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
