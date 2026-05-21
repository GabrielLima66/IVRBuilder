/**
 * ContextOrderOverlay — renderizado como irmão do <ReactFlow>, acima do canvas.
 * Exibe controles de reordenação (drag handle ⠿, botões ↑↓, campo numérico) sobre
 * cada nó filho de ContextNode quando o mouse está sobre ele.
 *
 * Arquitetura:
 *  - Usa useStore(s => s.transform) para converter coordenadas de flow → tela.
 *  - Usa useStore(s => s.nodeInternals) para posição absoluta e dimensões de cada filho.
 *  - Recebe mousePos do Canvas (onMouseMove no wrapperRef) para detectar hover.
 *  - Callbacks onMoveUp/onMoveDown/onMoveTo/onDragReorder atualizam data.childOrder
 *    no Canvas via setNodes.
 *
 * Z-index: o wrapperRef tem position:relative. Este overlay fica em zIndex:50,
 * acima dos nós React Flow (que têm z-index ≤ 0 por padrão), portanto sem
 * problemas de stacking com o ContextNode (zIndex: -1).
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from 'reactflow';

// ─── helpers ──────────────────────────────────────────────────────────────────

function canvasToScreen(absPos, transform) {
  const [tx, ty, zoom] = transform;
  return {
    x: absPos.x * zoom + tx,
    y: absPos.y * zoom + ty,
  };
}

// ─── Componente principal ──────────────────────────────────────────────────────

function ContextOrderOverlay({
  nodes,
  mousePos,       // { x, y } relativo ao wrapperRef (px)
  onMoveUp,       // (ctxId, nodeId) => void
  onMoveDown,     // (ctxId, nodeId) => void
  onMoveTo,       // (ctxId, nodeId, newIndex1Based) => void
  onDragReorder,  // (ctxId, nodeId, targetIndex) => void
}) {
  const transform     = useStore((s) => s.transform);
  const nodeInternals = useStore((s) => s.nodeInternals);

  // Estado de drag-to-reorder
  const [dragging, setDragging]         = useState(null); // { ctxId, nodeId, startY, currentY }
  const [dropIndex, setDropIndex]       = useState(null); // índice de destino durante drag
  const dragRef                         = useRef(null);

  // Estado do campo de posição em edição
  const [editingPos, setEditingPos]   = useState(null); // { nodeId, value }

  // ── Detecta qual filho está sob o mouse ──────────────────────────────────────
  let hoveredCtxId  = null;
  let hoveredNodeId = null;
  let hoveredIndex  = -1;

  if (mousePos && !dragging) {
    for (const ctx of nodes) {
      if (ctx.type !== 'context') continue;
      const childOrder = ctx.data.childOrder || [];
      for (let i = 0; i < childOrder.length; i++) {
        const cid      = childOrder[i];
        const internal = nodeInternals.get(cid);
        if (!internal) continue;

        const abs  = internal.positionAbsolute || { x: 0, y: 0 };
        const sc   = canvasToScreen(abs, transform);
        const zoom = transform[2];
        const w    = (internal.width  || 220) * zoom;
        const h    = (internal.height || 60)  * zoom;

        if (
          mousePos.x >= sc.x && mousePos.x <= sc.x + w &&
          mousePos.y >= sc.y && mousePos.y <= sc.y + h
        ) {
          hoveredCtxId  = ctx.id;
          hoveredNodeId = cid;
          hoveredIndex  = i;
          break;
        }
      }
      if (hoveredNodeId) break;
    }
  }

  // ── Drag-to-reorder: mousemove e mouseup globais ─────────────────────────────
  useEffect(() => {
    if (!dragging) return;

    const ctx        = nodes.find((n) => n.id === dragging.ctxId);
    const childOrder = ctx?.data?.childOrder || [];

    const onMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setDragging((d) => ({ ...d, currentY: clientY }));

      // Determina o índice de destino com base na posição Y do cursor
      let target = childOrder.length - 1;
      for (let i = 0; i < childOrder.length; i++) {
        const cid      = childOrder[i];
        const internal = nodeInternals.get(cid);
        if (!internal) continue;
        const abs  = internal.positionAbsolute || { x: 0, y: 0 };
        const sc   = canvasToScreen(abs, transform);
        const zoom = transform[2];
        const h    = (internal.height || 60) * zoom;
        const midY = sc.y + h / 2;
        if (clientY < midY) { target = i; break; }
      }
      setDropIndex(target);
    };

    const onUp = () => {
      if (dropIndex !== null && dropIndex !== childOrder.indexOf(dragging.nodeId)) {
        onDragReorder(dragging.ctxId, dragging.nodeId, dropIndex);
      }
      setDragging(null);
      setDropIndex(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [dragging, dropIndex, nodes, nodeInternals, transform, onDragReorder]);

  // ── Linha indicadora durante drag ─────────────────────────────────────────────
  let dropIndicator = null;
  if (dragging && dropIndex !== null) {
    const ctx        = nodes.find((n) => n.id === dragging.ctxId);
    const childOrder = ctx?.data?.childOrder || [];
    const ctxInternal = nodeInternals.get(dragging.ctxId);

    if (ctxInternal) {
      const ctxAbs  = ctxInternal.positionAbsolute || { x: 0, y: 0 };
      const ctxSc   = canvasToScreen(ctxAbs, transform);
      const zoom    = transform[2];
      const ctxW    = (ctxInternal.width || 320) * zoom;

      // Y da linha: topo do nó de destino (ou fundo do último)
      let lineY = ctxSc.y;
      if (dropIndex < childOrder.length) {
        const targetId       = childOrder[dropIndex];
        const targetInternal = nodeInternals.get(targetId);
        if (targetInternal) {
          const abs = targetInternal.positionAbsolute || { x: 0, y: 0 };
          lineY = canvasToScreen(abs, transform).y;
        }
      } else {
        // Fim da lista: fundo do último filho
        const lastId       = childOrder[childOrder.length - 1];
        const lastInternal = nodeInternals.get(lastId);
        if (lastInternal) {
          const abs = lastInternal.positionAbsolute || { x: 0, y: 0 };
          const h   = (lastInternal.height || 60) * zoom;
          lineY = canvasToScreen(abs, transform).y + h;
        }
      }

      dropIndicator = (
        <div style={{
          position: 'absolute',
          left:   ctxSc.x,
          top:    lineY - 1,
          width:  ctxW,
          height: 2,
          background: 'var(--neon)',
          boxShadow:  '0 0 6px var(--neon)',
          pointerEvents: 'none',
          zIndex: 60,
        }} />
      );
    }
  }

  // ── Renderização dos controles sobre o nó em hover ───────────────────────────
  let controls = null;
  const activeNodeId = hoveredNodeId || (dragging ? dragging.nodeId : null);

  if (activeNodeId) {
    const ctxId      = hoveredCtxId || (dragging ? dragging.ctxId : null);
    const ctx        = nodes.find((n) => n.id === ctxId);
    const childOrder = ctx?.data?.childOrder || [];
    const idx        = childOrder.indexOf(activeNodeId);
    const internal   = nodeInternals.get(activeNodeId);

    if (internal && idx >= 0) {
      const abs  = internal.positionAbsolute || { x: 0, y: 0 };
      const sc   = canvasToScreen(abs, transform);
      const zoom = transform[2];
      const w    = (internal.width  || 220) * zoom;
      const h    = (internal.height || 60)  * zoom;

      const isFirst = idx === 0;
      const isLast  = idx === childOrder.length - 1;

      // ── Mecanismo A: Drag handle (esquerda, largura 16px) ─────────────────
      const dragHandle = (
        <div
          className="ctx-reorder-control ctx-drag-handle"
          style={{
            position: 'absolute',
            left:   sc.x,
            top:    sc.y,
            width:  16 * zoom,
            height: h,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            cursor:         dragging ? 'grabbing' : 'grab',
            pointerEvents:  'all',
            zIndex: 55,
            color: 'var(--neon-dim)',
            fontSize: 10 * zoom,
            userSelect: 'none',
            background: 'rgba(0,255,65,0.04)',
            borderRight: '1px solid var(--line)',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging({ ctxId, nodeId: activeNodeId, startY: e.clientY, currentY: e.clientY });
            setDropIndex(idx);
          }}
        >
          ⠿
        </div>
      );

      // ── Mecanismo B: Botões ↑ ↓ (canto superior direito) ─────────────────
      const btnStyle = (disabled) => ({
        background:    'var(--panel)',
        border:        `1px solid ${disabled ? 'var(--line)' : 'var(--neon)'}`,
        color:         disabled ? 'var(--line)' : 'var(--neon)',
        fontFamily:    'inherit',
        fontSize:      Math.max(8, 10 * zoom),
        width:         Math.max(14, 18 * zoom),
        height:        Math.max(14, 18 * zoom),
        cursor:        disabled ? 'default' : 'pointer',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        padding:       0,
        lineHeight:    1,
        pointerEvents: disabled ? 'none' : 'all',
        borderRadius:  2,
        transition:    'background 0.1s',
      });

      const arrowButtons = (
        <div style={{
          position: 'absolute',
          right:  (sc.x + w) - (sc.x + w),   // alinha à direita
          left:   sc.x + w - Math.max(42, 44 * zoom),
          top:    sc.y,
          display:        'flex',
          gap:            2,
          pointerEvents:  'none',
          zIndex: 56,
        }}>
          <button
            className="ctx-reorder-control"
            disabled={isFirst}
            style={btnStyle(isFirst)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!isFirst) onMoveUp(ctxId, activeNodeId); }}
            title="Mover para cima"
          >↑</button>
          <button
            className="ctx-reorder-control"
            disabled={isLast}
            style={btnStyle(isLast)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!isLast) onMoveDown(ctxId, activeNodeId); }}
            title="Mover para baixo"
          >↓</button>
        </div>
      );

      // ── Mecanismo C: Campo numérico de posição (canto superior esquerdo) ──
      const posFieldW = Math.max(28, 32 * zoom);
      const posField  = (
        <div style={{
          position:   'absolute',
          left:       sc.x + 18 * zoom,  // logo à direita do drag handle
          top:        sc.y,
          zIndex:     56,
          pointerEvents: 'none',
        }}>
          <input
            className="ctx-reorder-control"
            type="number"
            min={1}
            max={childOrder.length}
            value={editingPos?.nodeId === activeNodeId ? editingPos.value : idx + 1}
            style={{
              width:      posFieldW,
              height:     Math.max(14, 18 * zoom),
              background: 'var(--panel)',
              border:     '1px solid var(--neon-dim)',
              color:      'var(--neon)',
              fontFamily: 'inherit',
              fontSize:   Math.max(8, 9 * zoom),
              textAlign:  'center',
              padding:    0,
              outline:    'none',
              borderRadius: 2,
              pointerEvents: 'all',
            }}
            onFocus={() => setEditingPos({ nodeId: activeNodeId, value: idx + 1 })}
            onChange={(e) => setEditingPos({ nodeId: activeNodeId, value: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') {
                setEditingPos(null);
                e.target.blur();
              }
            }}
            onBlur={() => {
              if (!editingPos) return;
              const raw = parseInt(editingPos.value, 10);
              if (!isNaN(raw) && raw >= 1 && raw <= childOrder.length) {
                onMoveTo(ctxId, activeNodeId, raw - 1); // converte para 0-based
              }
              setEditingPos(null);
            }}
          />
        </div>
      );

      controls = (
        <>
          {dragHandle}
          {arrowButtons}
          {posField}
        </>
      );
    }
  }

  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      pointerEvents: 'none',
      zIndex:        50,
      overflow:      'hidden',
    }}>
      {controls}
      {dropIndicator}
    </div>
  );
}

export default ContextOrderOverlay;
