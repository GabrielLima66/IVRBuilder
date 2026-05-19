/**
 * EdgeWithWaypoints — edge com waypoints editáveis estilo Lucidchart.
 *
 * Toda interatividade usa EdgeLabelRenderer (HTML divs), não SVG,
 * porque eventos de mouse em SVG no contexto do React Flow são interceptados
 * pelo sistema interno antes de chegar aos handlers da edge customizada.
 *
 * Uso:
 *  - Passe o mouse sobre o ponto central de qualquer segmento → aparece ⊕
 *  - Arraste-o para curvar a linha naquele ponto
 *  - Arraste as bolinhas verdes para reposicionar waypoints existentes
 *  - Passe o mouse sobre uma bolinha → aparece × para remover
 *  - Botão direito na bolinha → menu "Remover ponto"
 */

import React, { useState, useCallback, useContext, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  useStore, useReactFlow,
  EdgeLabelRenderer, BaseEdge, getSmoothStepPath,
} from 'reactflow';
import { getEdgeParams, getEdgeParamsDirected } from '../../utils/edgeUtils';
import { useEdgeMode, snapToGrid } from '../../contexts/EdgeModeContext';

/** Aplica snap quando no modo grade, retorna o valor intacto no modo livre */
function maybeSnap(x, y, gridMode) {
  return gridMode ? { x: snapToGrid(x), y: snapToGrid(y) } : { x, y };
}

// ─────────────────────────────────────────────────────────────────────────────
// Path ORTOGONAL — apenas segmentos horizontais e verticais (sem diagonais).
// Para cada par de pontos consecutivos:
//   - Se já alinhados: linha reta
//   - Caso contrário: L-shape com canto arredondado (horizontal → vertical)
// ─────────────────────────────────────────────────────────────────────────────
function buildOrthogonalPath(pts) {
  if (pts.length < 2) return '';

  const R = 6;
  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;

    if (Math.abs(dy) < 1) { d += ` L ${B.x} ${B.y}`; continue; } // horizontal
    if (Math.abs(dx) < 1) { d += ` L ${B.x} ${B.y}`; continue; } // vertical

    // L-shape: horizontal até B.x, depois vertical até B.y
    const r  = Math.min(R, Math.abs(dx) / 2, Math.abs(dy) / 2);
    const bx = B.x - Math.sign(dx) * r;
    const ax = B.x;
    const ay = A.y + Math.sign(dy) * r;

    d += ` L ${bx} ${A.y} Q ${B.x} ${A.y} ${ax} ${ay} L ${B.x} ${B.y}`;
  }

  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// SegmentMidHandle — ponto arrastável no meio de cada segmento.
// Sempre visível (sutil). Hover → cresce e indica que é drag handle.
// MouseDown → cria waypoint naquele ponto e inicia drag imediatamente.
// ─────────────────────────────────────────────────────────────────────────────
const SegmentMidHandle = memo(function SegmentMidHandle({ x, y, zoom, onDragStart }) {
  const [hov, setHov] = useState(false);
  const edgeMode = useEdgeMode();
  const gridMode = edgeMode === 'grid';

  const handleMouseDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const { x: sx, y: sy } = maybeSnap(x, y, gridMode);
    onDragStart(e, sx, sy);
  }, [onDragStart, x, y, gridMode]);

  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        transform: `translate(-50%,-50%) translate(${x}px,${y}px)`,
        width:  hov ? 20 : 10,
        height: hov ? 20 : 10,
        cursor: 'grab',
        pointerEvents: 'all',
        zIndex: 998,
        transition: 'width .12s, height .12s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={handleMouseDown}
    >
      <div style={{
        width:  hov ? 14 : 6,
        height: hov ? 14 : 6,
        borderRadius: '50%',
        background: '#0d0d0d',
        border: `${hov ? 1.5 : 1}px ${hov ? 'solid' : 'dashed'} ${hov ? '#00ff41' : '#00b32d88'}`,
        boxShadow: hov ? '0 0 8px #00ff4166' : 'none',
        opacity: hov ? 1 : 0.55,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8, color: '#00ff41',
        transition: 'all .12s',
      }}>
        {hov ? '⊕' : ''}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// WaypointDot — bolinha arrastável sobre um waypoint existente.
// Sempre visível quando há waypoints. Hover → botão × + highlight.
// ─────────────────────────────────────────────────────────────────────────────
const WaypointDot = memo(function WaypointDot({ x, y, index, zoom, onMove, onRemove }) {
  const [hov,    setHov]    = useState(false);
  const [drag,   setDrag]   = useState(false);
  const [ctx,    setCtx]    = useState(null);
  const edgeMode = useEdgeMode();
  const gridMode = edgeMode === 'grid';

  const handleDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag(true);
    const sx = e.clientX, sy = e.clientY, ox = x, oy = y;
    const move = (ev) => {
      const raw = { x: ox + (ev.clientX - sx) / zoom, y: oy + (ev.clientY - sy) / zoom };
      const { x: nx, y: ny } = maybeSnap(raw.x, raw.y, gridMode);
      onMove(index, nx, ny);
    };
    const up = () => {
      setDrag(false);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup',   up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
  }, [x, y, index, zoom, onMove]);

  const handleCtx = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        transform: `translate(-50%,-50%) translate(${x}px,${y}px)`,
        cursor: drag ? 'grabbing' : 'grab',
        pointerEvents: 'all',
        zIndex: 1001,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={handleDown}
      onContextMenu={handleCtx}
    >
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: '#0d0d0d',
        border: `2px solid ${hov || drag ? '#00ff41' : '#00b32d'}`,
        boxShadow: hov || drag ? '0 0 8px #00ff4188' : 'none',
        transition: 'box-shadow .1s, border-color .1s',
        position: 'relative',
      }}>
        {hov && !drag && (
          <button
            style={{
              position: 'absolute', top: -7, right: -7,
              width: 13, height: 13, borderRadius: '50%',
              background: '#ff5050', border: 'none', cursor: 'pointer',
              fontSize: 9, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, boxShadow: '0 0 4px #ff505088',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          >×</button>
        )}
      </div>

      {ctx && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
            onClick={() => setCtx(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}
          />
          <div style={{
            position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 9998,
            background: 'var(--panel)', border: '1px solid var(--neon-dim)',
            borderRadius: 3, overflow: 'hidden',
            boxShadow: '0 0 14px rgba(0,255,65,0.25)',
            minWidth: 155,
          }}>
            <div style={{
              padding: '4px 10px', fontSize: 9,
              color: 'var(--neon-dim)', letterSpacing: 1,
              borderBottom: '1px solid var(--line)', background: 'var(--panel-2)',
            }}>// WAYPOINT</div>
            <button
              style={{
                display: 'block', width: '100%', background: 'transparent',
                border: 'none', color: '#ff5050', fontFamily: 'inherit',
                fontSize: 12, padding: '9px 12px',
                cursor: 'pointer', textAlign: 'left', letterSpacing: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ff3b3b18'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { onRemove(index); setCtx(null); }}
            >⌫ Remover ponto</button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// EdgeWithWaypoints — componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function EdgeWithWaypoints({
  id, source, target, data, markerEnd, style, selected,
}) {
  // ── Todos os hooks antes de qualquer return ───────────────────────────────
  const { setEdges } = useReactFlow();
  const sourceNode  = useStore(useCallback((s) => s.nodeInternals.get(source), [source]));
  const targetNode  = useStore(useCallback((s) => s.nodeInternals.get(target), [target]));
  const zoom        = useStore((s) => s.transform[2]);
  const waypoints   = data?.waypoints || [];
  const edgeMode    = useEdgeMode();
  const gridMode    = edgeMode === 'grid';

  const patch = useCallback((wps) => {
    setEdges((es) =>
      es.map((e) => e.id === id ? { ...e, data: { ...(e.data || {}), waypoints: wps } } : e)
    );
  }, [id, setEdges]);

  const moveWaypoint = useCallback((idx, mx, my) => {
    patch(waypoints.map((wp, i) => (i === idx ? { x: mx, y: my } : wp)));
  }, [waypoints, patch]);

  const removeWaypoint = useCallback((idx) => {
    patch(waypoints.filter((_, i) => i !== idx));
  }, [waypoints, patch]);

  // ── Early return depois de todos os hooks ─────────────────────────────────
  if (
    !sourceNode?.positionAbsolute || !targetNode?.positionAbsolute ||
    !sourceNode.width             || !targetNode.width
  ) return null;

  // ── Cálculo de path ───────────────────────────────────────────────────────
  // Com waypoints: endpoints calculados em direção ao 1º/último waypoint.
  // Sem waypoints: cálculo padrão source→target.
  const edgeParamsFn = waypoints.length > 0
    ? getEdgeParamsDirected(
        sourceNode, targetNode,
        waypoints[0],                        // source aponta para o 1º waypoint
        waypoints[waypoints.length - 1],     // target recebe do último waypoint
      )
    : getEdgeParams(sourceNode, targetNode);

  const { sx, sy, tx, ty, sourcePos, targetPos } = edgeParamsFn;
  const allPts = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }];

  // Sempre ortogonal: sem diagonais independente do modo livre/grade
  let pathD;
  if (waypoints.length === 0) {
    [pathD] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
      targetX: tx, targetY: ty, targetPosition: targetPos,
      borderRadius: 6,
    });
  } else {
    pathD = buildOrthogonalPath(allPts);
  }

  // ── Drag de segmento: um único gesto cria + move o waypoint ──────────────
  // Capture zoom e gridMode no momento do drag para cálculo correto.
  function startSegmentDrag(e, segIdx, startFlowX, startFlowY) {
    const startClientX  = e.clientX;
    const startClientY  = e.clientY;
    const currentZoom   = zoom;    // snapshot do zoom
    const currentGrid   = gridMode; // snapshot do modo de snap

    // Insere o waypoint na posição inicial (já vem snapped pelo SegmentMidHandle)
    const baseWps = [...waypoints];
    baseWps.splice(segIdx, 0, { x: startFlowX, y: startFlowY });
    patch(baseWps);

    // Rastreia o movimento e atualiza só o waypoint recém-criado
    const onMove = (ev) => {
      const dx  = (ev.clientX - startClientX) / currentZoom;
      const dy  = (ev.clientY - startClientY) / currentZoom;
      const raw = { x: startFlowX + dx, y: startFlowY + dy };
      const { x: nx, y: ny } = maybeSnap(raw.x, raw.y, currentGrid);
      patch(
        baseWps.map((wp, i) => (i === segIdx ? { x: nx, y: ny } : wp))
      );
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Caminho SVG visual da edge */}
      <BaseEdge id={id} path={pathD} markerEnd={markerEnd} style={style} />

      {/* Controles visíveis APENAS quando a edge está selecionada */}
      {selected && <EdgeLabelRenderer>
        {/* ── Handles de segmento: sempre visíveis (sutis), hover revela ⊕ ── */}
        {allPts.slice(0, -1).map((p, i) => {
          const q  = allPts[i + 1];
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          return (
            <SegmentMidHandle
              key={`seg-${i}`}
              x={mx} y={my}
              zoom={zoom}
              onDragStart={(e, fx, fy) => startSegmentDrag(e, i, fx, fy)}
            />
          );
        })}

        {/* ── Waypoints existentes: bolinhas arrastáveis ── */}
        {waypoints.map((wp, i) => (
          <WaypointDot
            key={`wp-${i}`}
            x={wp.x} y={wp.y}
            index={i}
            zoom={zoom}
            onMove={moveWaypoint}
            onRemove={removeWaypoint}
          />
        ))}
      </EdgeLabelRenderer>}
    </>
  );
}
