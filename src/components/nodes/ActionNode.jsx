import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { ACTION_META } from '../../utils/actionMeta';
import { cls } from '../../utils/common';

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

const ActionNode = memo(({ id, data, selected, type }) => {
  const meta = ACTION_META[type];
  if (!meta) return null;
  const { setNodes, setEdges } = useReactFlow();
  const Icon = meta.icon;
  const rows = meta.summary(data) || [];

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

  const errors      = meta.validate ? meta.validate(data) : [];
  const isInvalid   = errors.length > 0;
  const borderColor = data._commented
    ? (meta.color + '44')
    : (isInvalid ? '#ff5050' : (meta.color + '99'));

  return (
    <div
      className={cls('rcx-node', selected && 'selected')}
      style={{
        borderColor,
        borderStyle: data._commented ? 'dashed' : 'solid',
        opacity: data._commented ? 0.6 : 1,
        minWidth: 210,
      }}
    >
      {/* ── Handles: 4 lados ── */}
      <Handle type="target" position={Position.Top}    id="in"        style={{ background: meta.color }} />
      <Handle type="target" position={Position.Left}   id="in-left"   style={{ background: meta.color }} />
      {!meta.terminal && (
        <>
          <Handle type="source" position={Position.Bottom} id="out"       style={{ background: meta.color }} />
          <Handle type="source" position={Position.Right}  id="out-right" style={{ background: meta.color }} />
        </>
      )}

      <div className="rcx-node-header" style={{
        background: `linear-gradient(180deg, ${meta.color}22 0%, ${meta.color}08 100%)`,
        borderColor: meta.color + '88',
        color: meta.color,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, textShadow: `0 0 5px ${meta.color}` }}>
          <Icon size={12} /> {data._commented ? `// ${meta.title}` : meta.title}
        </span>
        {data._commented
          ? <span className="badge" style={{ borderColor: '#ff505088', color: '#ff5050' }}>DESATIVADO</span>
          : <span className="badge" style={{ borderColor: meta.color, color: meta.color }}>{meta.app}</span>
        }
      </div>

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
            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleActivate} style={btnStyle('#00ff41')}>
              ATIVAR
            </button>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleExclude} style={btnStyle('#ff5050')}>
              EXCLUIR
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

ActionNode.displayName = 'ActionNode';
export default ActionNode;
