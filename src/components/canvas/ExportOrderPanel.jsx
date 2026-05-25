/**
 * ExportOrderPanel — painel lateral de gerenciamento da ordem de exportação dos ContextNodes.
 *
 * Exibe a lista de todos os contextos ordenados por exportOrder.
 * Permite: drag-to-reorder, botões ↑↓, campo numérico, toggle isDraft.
 * Mostra prévia da ordem final de exportação no rodapé.
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';

// ── Constantes de layout ──────────────────────────────────────────────────────
const PANEL_W     = 320;
const ITEM_H      = 48; // px — altura de cada item da lista
const DRAFT_COLOR = '#666';

// ── Utilitário: reordena e normaliza exportOrder de 1..N ─────────────────────
function reorderList(list, fromIdx, toIdx) {
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  // Reassign exportOrder 1..N
  return next.map((item, i) => ({ ...item, exportOrder: i + 1 }));
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ExportOrderPanel({ nodes, onClose, onUpdateNode }) {
  // configNode: always first, not reorderable
  const configNode = useMemo(
    () => nodes.find((n) => n.type === 'config'),
    [nodes]
  );

  // Contextos ordenados por exportOrder para exibição
  const [list, setList] = useState(() =>
    [...nodes.filter((n) => n.type === 'context')]
      .sort((a, b) => {
        const ao = a.data?.exportOrder ?? Infinity;
        const bo = b.data?.exportOrder ?? Infinity;
        return ao - bo;
      })
      .map((n) => ({
        id:          n.id,
        contextName: n.data?.contextName || 'sem-nome',
        exportOrder: n.data?.exportOrder ?? 999,
        isDraft:     !!n.data?.isDraft,
      }))
  );

  // Estado de edição do campo numérico
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const dragState = useRef(null);  // { fromIdx, fromY, currentY }
  const [dragIdx,    setDragIdx]    = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const handleDragStart = useCallback((e, idx) => {
    e.preventDefault();
    dragState.current = { fromIdx: idx, fromY: e.clientY, currentY: e.clientY };
    setDragIdx(idx);
    setDropTarget(idx);

    const onMove = (ev) => {
      dragState.current.currentY = ev.clientY;
      const dy     = ev.clientY - dragState.current.fromY;
      const offset = Math.round(dy / ITEM_H);
      const target = Math.max(0, Math.min(list.length - 1, dragState.current.fromIdx + offset));
      setDropTarget(target);
    };
    const onUp = () => {
      if (dragState.current) {
        const { fromIdx } = dragState.current;
        setDropTarget((t) => {
          const toIdx = t ?? fromIdx;
          if (toIdx !== fromIdx) {
            setList((prev) => {
              const next = reorderList(prev, fromIdx, toIdx);
              // propagate immediately
              next.forEach((item) => {
                onUpdateNode(item.id, { exportOrder: item.exportOrder });
              });
              return next;
            });
          }
          return null;
        });
      }
      dragState.current = null;
      setDragIdx(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [list.length, onUpdateNode]);

  // ── ↑ / ↓ ─────────────────────────────────────────────────────────────────
  const moveUp = useCallback((idx) => {
    if (idx === 0) return;
    setList((prev) => {
      const next = reorderList(prev, idx, idx - 1);
      next.forEach((item) => onUpdateNode(item.id, { exportOrder: item.exportOrder }));
      return next;
    });
  }, [onUpdateNode]);

  const moveDown = useCallback((idx) => {
    setList((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = reorderList(prev, idx, idx + 1);
      next.forEach((item) => onUpdateNode(item.id, { exportOrder: item.exportOrder }));
      return next;
    });
  }, [onUpdateNode]);

  // ── Campo numérico ─────────────────────────────────────────────────────────
  const startEdit = useCallback((item) => {
    setEditingId(item.id);
    setEditValue(String(item.exportOrder));
  }, []);

  const commitEdit = useCallback((id) => {
    const n = parseInt(editValue, 10);
    if (!isNaN(n) && n >= 1) {
      setList((prev) => {
        const fromIdx = prev.findIndex((i) => i.id === id);
        if (fromIdx < 0) return prev;
        const toIdx = Math.min(prev.length - 1, n - 1);
        const next  = reorderList(prev, fromIdx, toIdx);
        next.forEach((item) => onUpdateNode(item.id, { exportOrder: item.exportOrder }));
        return next;
      });
    }
    setEditingId(null);
  }, [editValue, onUpdateNode]);

  // ── Toggle isDraft ─────────────────────────────────────────────────────────
  const toggleDraft = useCallback((id) => {
    setList((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, isDraft: !item.isDraft } : item
      );
      const item = next.find((i) => i.id === id);
      if (item) onUpdateNode(id, { isDraft: item.isDraft });
      return next;
    });
  }, [onUpdateNode]);

  // ── Prévia de exportação ───────────────────────────────────────────────────
  const preview = useMemo(
    () => list.filter((i) => !i.isDraft),
    [list]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 60,
        width: PANEL_W,
        background: 'var(--panel)',
        borderLeft: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        color: 'var(--neon)',
        boxShadow: '-4px 0 24px var(--neon-glow-faint)',
        userSelect: 'none',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--neon-glow-bg)',
      }}>
        <span style={{ letterSpacing: 2, fontSize: 10 }}>⊞ ORDEM DE EXPORTAÇÃO</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid var(--line)',
            color: 'var(--neon-dim)', cursor: 'pointer', fontSize: 11,
            padding: '2px 8px', borderRadius: 2, fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>

      {/* ── GlobalConfigNode (fixo, sempre primeiro) ──────────────────────── */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: 0.5,
      }}>
        <span style={{ color: 'var(--neon)', fontSize: 10, minWidth: 18, textAlign: 'right' }}>⚑</span>
        <span style={{ flex: 1, color: 'var(--neon)', fontSize: 10, letterSpacing: 0.5 }}>
          CONFIG / START <span style={{ color: 'var(--neon-dim)' }}>(sempre primeiro)</span>
        </span>
      </div>

      {/* ── Lista de contextos ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {list.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--neon-dim)', fontSize: 10, textAlign: 'center' }}>
            // nenhum contexto no canvas
          </div>
        )}

        {list.map((item, idx) => {
          const isBeingDragged = dragIdx === idx;
          const isDropTarget   = dropTarget === idx && dragIdx !== null && dragIdx !== idx;

          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px 0 8px',
                height: ITEM_H,
                background: isDropTarget
                  ? 'var(--ctx-bg-inset)'
                  : isBeingDragged
                    ? 'var(--neon-glow-bg)'
                    : 'transparent',
                borderTop: isDropTarget ? '1px solid var(--neon)' : '1px solid transparent',
                opacity: isBeingDragged ? 0.4 : item.isDraft ? 0.5 : 1,
                transition: 'background 0.1s',
                boxSizing: 'border-box',
              }}
            >
              {/* Drag handle */}
              <div
                onMouseDown={(e) => handleDragStart(e, idx)}
                style={{
                  cursor: 'grab', color: 'var(--neon-dim)', fontSize: 14,
                  padding: '4px 2px', lineHeight: 1,
                  flexShrink: 0,
                }}
                title="Arrastar para reordenar"
              >
                ⠿
              </div>

              {/* Número / campo de ordem */}
              {editingId === item.id ? (
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={list.length}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{
                    width: 32, background: 'var(--panel)', border: '1px solid var(--neon)',
                    color: 'var(--neon)', fontFamily: 'inherit', fontSize: 11,
                    textAlign: 'center', borderRadius: 2, padding: '1px 2px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  onClick={() => startEdit(item)}
                  title="Clique para editar posição"
                  style={{
                    minWidth: 28, textAlign: 'right', color: 'var(--neon-dim)',
                    cursor: 'text', padding: '2px 4px',
                    border: '1px solid transparent',
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                >
                  {item.exportOrder}
                </span>
              )}

              {/* Nome do contexto */}
              <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: item.isDraft ? DRAFT_COLOR : 'var(--neon)',
                textDecoration: item.isDraft ? 'line-through' : 'none',
                letterSpacing: 0.5,
              }}>
                {item.contextName}
              </span>

              {/* Badge RASCUNHO */}
              {item.isDraft && (
                <span style={{
                  fontSize: 8, color: DRAFT_COLOR, border: '1px solid #444',
                  borderRadius: 2, padding: '0 4px', letterSpacing: 1,
                  flexShrink: 0,
                }}>
                  RASCUNHO
                </span>
              )}

              {/* Botões ↑↓ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                {[
                  { label: '↑', action: () => moveUp(idx),   disabled: idx === 0 },
                  { label: '↓', action: () => moveDown(idx), disabled: idx === list.length - 1 },
                ].map(({ label, action, disabled }) => (
                  <button
                    key={label}
                    onClick={action}
                    disabled={disabled}
                    style={{
                      background: 'transparent',
                      border: disabled ? '1px solid var(--line)' : '1px solid var(--neon-dim)',
                      color: disabled ? 'var(--line)' : 'var(--neon-dim)',
                      fontFamily: 'inherit', fontSize: 9, cursor: disabled ? 'default' : 'pointer',
                      padding: '0 4px', lineHeight: '12px', borderRadius: 1,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Toggle RASCUNHO */}
              <button
                onClick={() => toggleDraft(item.id)}
                title={item.isDraft ? 'Ativar para exportação' : 'Marcar como rascunho (excluir da exportação)'}
                style={{
                  background: item.isDraft ? 'rgba(100,100,100,0.2)' : 'transparent',
                  border: item.isDraft ? '1px solid #555' : '1px solid var(--line)',
                  color: item.isDraft ? DRAFT_COLOR : 'var(--neon-dim)',
                  fontFamily: 'inherit', fontSize: 8, cursor: 'pointer',
                  padding: '2px 5px', borderRadius: 2, letterSpacing: 0.5,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >
                {item.isDraft ? '○ DRAFT' : '● DRAFT'}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Prévia de exportação ────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--line)',
        padding: '10px 16px',
        background: 'var(--neon-glow-bg)',
      }}>
        <div style={{ color: 'var(--neon-dim)', fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
          // PRÉVIA DO .conf (ordem de blocos)
        </div>
        <div style={{ lineHeight: 1.8 }}>
          <div style={{ color: 'var(--neon)', fontSize: 10, opacity: 0.6 }}>
            [orpen-ivr-{configNode?.data?.ivr || '??'}]
            <span style={{ color: 'var(--neon-dim)', fontSize: 9 }}> ← sempre primeiro</span>
          </div>
          {preview.map((item, i) => (
            <div key={item.id} style={{ color: 'var(--neon)', fontSize: 10 }}>
              <span style={{ color: 'var(--neon-dim)', marginRight: 6 }}>{i + 1}.</span>
              [{item.contextName}]
            </div>
          ))}
          {preview.length === 0 && (
            <div style={{ color: DRAFT_COLOR, fontSize: 9, fontStyle: 'italic' }}>
              // nenhum contexto ativo para exportar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
