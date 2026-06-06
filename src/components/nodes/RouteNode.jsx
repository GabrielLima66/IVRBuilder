import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';
import { useConfig } from '../../contexts/ConfigContext';

const MODE_COLOR = { contexto: '#00d4ff', fila: '#ff8c00', macro: '#a78bfa' };
const MODE_LABEL = { contexto: 'CONTEXTO', fila: 'FILA', macro: 'MACRO+FILA' };

const SRC = { width: 10, height: 10 };
const TGT = { width: 10, height: 10 };

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

const RouteNode = memo(({ id, data, selected }) => {
  const { setNodes, setEdges } = useReactFlow();
  const mode  = data.routeMode || 'macro';
  const color = MODE_COLOR[mode] || '#ff8c00';
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  const modeCtx     = useModeContext();
  const displayTitle = getNodeLabel('route', modeCtx);
  const { highFidelityMode } = useConfig();
  const isPreserved = highFidelityMode && !data.isDirty && !!data.originalLine;

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

  const borderColor = data._commented ? (color + '33') : (color + '99');

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor,
        borderStyle: data._commented ? 'dashed' : 'solid',
        opacity: data._commented ? 0.6 : 1,
        minWidth: 230,
        ...(isConnectedActive && { '--node-active-color': color, '--node-active-glow': color + '99' }),
      }}
    >
      <Handle type="target" position={Position.Top}    id="in"        style={{ ...TGT, background: color }} />
      <Handle type="target" position={Position.Left}   id="in-left"   style={{ ...TGT, background: color }} />
      <Handle type="source" position={Position.Bottom} id="out"       style={{ ...SRC, background: color }} />
      <Handle type="source" position={Position.Right}  id="out-right" style={{ ...SRC, background: color }} />

      <div className="rcx-node-header" style={{
        background: `linear-gradient(180deg, ${color}22 0%, ${color}08 100%)`,
        borderColor: color + '88', color,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: `0 0 5px ${color}` }}>
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
          {data._commented ? `// ${displayTitle}` : displayTitle}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isPreserved && <span className="node-preserved-badge" title="Linha original preservada — não editado">⬤</span>}
          {data._commented
            ? <span className="badge" style={{ borderColor: '#ff505088', color: '#ff5050' }}>DESATIVADO</span>
            : modeCtx !== 'amigavel' && (
                <span className="badge" style={{ borderColor: color, color }}>{MODE_LABEL[mode] || 'MACRO+FILA'}</span>
              )
          }
        </span>
      </div>

      {!data.minimized && (
        <div className="rcx-node-body">
          {mode === 'contexto' && (
            <>
              <div className="rcx-node-row">
                <span className="k">ctx</span>
                <span className="v" style={{ maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data.context || '—'}
                </span>
              </div>
              <div className="rcx-node-row">
                <span className="k">ext</span><span className="v">{data.extension || 's'}</span>
                <span className="k" style={{ marginLeft: 8 }}>pri</span><span className="v">{data.priority || '1'}</span>
              </div>
            </>
          )}
          {mode === 'fila' && (
            <>
              <div className="rcx-node-row"><span className="k">Queue</span><span className="v">{data.queue || '—'}</span></div>
              <div className="rcx-node-row"><span className="k">opts</span><span className="v">{data.queueOptions || '(sem)'}</span></div>
            </>
          )}
          {mode === 'macro' && (
            <>
              <div className="rcx-node-row"><span className="k">DESTINY</span><span className="v">{data.queue || '—'}</span></div>
              <div className="rcx-node-row">
                <span className="k">→</span>
                <span className="v" style={{ fontSize: 10, color: '#a78bfa' }}>rcx-ivr-transfer</span>
              </div>
            </>
          )}

          {data._commented && (
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              <button onMouseDown={(e) => e.stopPropagation()} onClick={handleActivate} style={btnStyle('var(--neon)')}>
                ATIVAR
              </button>
              <button onMouseDown={(e) => e.stopPropagation()} onClick={handleExclude} style={btnStyle('#ff5050')}>
                EXCLUIR
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

RouteNode.displayName = 'RouteNode';
export default RouteNode;
