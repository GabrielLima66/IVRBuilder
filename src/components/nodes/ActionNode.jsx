import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { ACTION_META } from '../../utils/actionMeta';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useThemeContext } from '../../contexts/ThemeContext';
import { resolveNodeColor } from '../../utils/nodeColors';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';
import { useReviewMode } from '../../contexts/ReviewModeContext';
import { useConfig } from '../../contexts/ConfigContext';

const btnStyle = (color) => ({
  flex: 1,
  padding: '3px 0',
  fontSize: 8,
  letterSpacing: 1,
  background: 'transparent',
  border: `1px solid ${color}55`,
  color,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 2,
});

const minBtnSty = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 9, padding: '0 2px', lineHeight: 1,
  opacity: 0.6, flexShrink: 0, fontFamily: 'inherit', color: 'inherit',
};

const ActionNode = memo(({ id, data, selected, type }) => {
  const meta = ACTION_META[type];
  if (!meta) return null;
  const { setNodes, setEdges } = useReactFlow();
  const Icon = meta.icon;
  const rows = meta.summary(data) || [];
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);

  // ── Cor resolvida para o tema atual ─────────────────────────────────────────
  // Remapeia cores que colidiriam com o chrome do tema (verde no matrix,
  // roxo no orpen), garantindo contraste adequado em ambos os temas.
  const theme      = useThemeContext();
  const modeCtx    = useModeContext();
  const reviewMode = useReviewMode();
  const { highFidelityMode } = useConfig();
  const color      = resolveNodeColor(meta.color, theme);
  const displayTitle = getNodeLabel(type, modeCtx);

  // Nó preservado: importado, não editado, highFidelityMode ativo
  const isPreserved = highFidelityMode && !data.isDirty && !!data.originalLine;

  // confidence badge in review mode
  const confidenceLevel = reviewMode
    ? (data._commented || type === 'execif' || type === 'execiftime' ? 'medium' : 'high')
    : null;

  const handleActivate = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const { _commented, _origLine, ...rest } = n.data;
        return { ...n, data: rest };
      })
    );
  }, [id, setNodes]);

  const handleExclude = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  const toggleMinimize = useCallback(() => {
    setNodes((ns) => ns.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, minimized: !n.data.minimized } } : n
    ));
  }, [id, setNodes]);

  const errors      = meta.validate ? meta.validate(data) : [];
  const isInvalid   = errors.length > 0;
  const borderColor = data._commented
    ? (color + '44')
    : (isInvalid ? '#ff5050' : (color + '99'));

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor,
        borderStyle: data._commented ? 'dashed' : 'solid',
        opacity: data._commented ? 0.6 : 1,
        minWidth: 210,
        ...(isConnectedActive && { '--node-active-color': color, '--node-active-glow': color + '99' }),
      }}
    >
      {/* ── Handles: 4 lados ── */}
      <Handle type="target" position={Position.Top}    id="in"        style={{ background: color }} />
      <Handle type="target" position={Position.Left}   id="in-left"   style={{ background: color }} />
      {!meta.terminal && (
        <>
          <Handle type="source" position={Position.Bottom} id="out"       style={{ background: color }} />
          <Handle type="source" position={Position.Right}  id="out-right" style={{ background: color }} />
        </>
      )}

      <div className="rcx-node-header" style={{
        background: `linear-gradient(180deg, ${color}22 0%, ${color}08 100%)`,
        borderColor: color + '88',
        color,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" aria-label={data.minimized ? 'Expandir nó' : 'Minimizar nó'}
            title={data.minimized ? 'Expandir' : 'Minimizar'}
            onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={minBtnSty}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          >
            {data.minimized ? '▶' : '▼'}
          </button>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, textShadow: `0 0 5px ${color}` }}>
            <Icon size={12} /> {data._commented ? `// ${displayTitle}` : displayTitle}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {confidenceLevel === 'medium' && (
            <span className="badge" style={{ borderColor: '#ffcc0099', color: '#ffcc00', fontSize: 9 }} title="Mapeamento parcial — verifique este nó">?</span>
          )}
          {confidenceLevel === 'high' && (
            <span className="badge" style={{ borderColor: '#00cc4499', color: '#00cc44', fontSize: 9 }} title="Mapeamento bem-sucedido">✓</span>
          )}
          {isPreserved && (
            <span className="node-preserved-badge" title="Linha original preservada — não editado">⬤</span>
          )}
          {data._commented
            ? <span className="badge" style={{ borderColor: '#ff505088', color: '#ff5050' }}>DESATIVADO</span>
            : modeCtx !== 'amigavel' && (
                <span className="badge" style={{ borderColor: color, color }}>{meta.app}</span>
              )
          }
        </span>
      </div>

      {!data.minimized && (
        <>
          {meta.supportsLabel && data.label?.trim() && (
            <div style={{
              padding: '2px 10px',
              fontSize: 9,
              color: '#ffcc00',
              letterSpacing: 1,
              fontFamily: 'inherit',
              borderBottom: '1px dashed #ffcc0044',
              background: '#ffcc000a',
            }}>
              ({data.label.trim()})
            </div>
          )}

          <div className="rcx-node-body">
            {rows.map((r, i) => (
              <div key={i} className="rcx-node-row">
                <span className="k">{r.k}</span>
                <span className="v" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.v}
                </span>
              </div>
            ))}

            {isInvalid && !data._commented && (
              <div style={{
                marginTop: 6, padding: '3px 6px',
                fontSize: 9, color: '#ff5050',
                borderTop: '1px dashed #ff505066',
              }}>
                ⚠ {errors[0]}
              </div>
            )}

            {data._commented && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={handleActivate}
                  style={btnStyle('var(--neon)')}>
                  ATIVAR
                </button>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={handleExclude}
                  style={btnStyle('#ff5050')}>
                  EXCLUIR
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

ActionNode.displayName = 'ActionNode';
export default ActionNode;
