import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';

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

const RawNode = memo(({ id, data, selected }) => {
  const { setNodes, setEdges } = useReactFlow();
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);

  const handleChange = useCallback((e) => {
    setNodes((ns) =>
      ns.map((n) => n.id === id ? { ...n, data: { ...n.data, rawLine: e.target.value } } : n)
    );
  }, [id, setNodes]);

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

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor: data._commented ? '#ff8c0033' : '#ff8c0099',
        borderStyle: data._commented ? 'dashed' : 'solid',
        opacity: data._commented ? 0.6 : 1,
        minWidth: 220,
        ...(isConnectedActive && { '--node-active-color': '#ff8c00', '--node-active-glow': 'rgba(255,140,0,0.65)' }),
      }}
    >
      <Handle type="target" position={Position.Top}    id="in"       style={{ background: '#ff8c00' }} />
      <Handle type="target" position={Position.Left}   id="in-left"  style={{ background: '#ff8c00' }} />
      <Handle type="source" position={Position.Bottom} id="out"      style={{ background: '#ff8c00' }} />
      <Handle type="source" position={Position.Right}  id="out-right" style={{ background: '#ff8c00' }} />

      <div className="rcx-node-header" style={{
        background: 'linear-gradient(180deg, #ff8c0022 0%, #ff8c0008 100%)',
        borderColor: '#ff8c0066',
        color: '#ff8c00',
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5 }}>
          {data._commented ? '// RAW' : '// RAW'}
        </span>
        {data._commented
          ? <span className="badge" style={{ borderColor: '#ff505088', color: '#ff5050', fontSize: 8 }}>DESATIVADO</span>
          : <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', fontSize: 8 }}>não mapeado</span>
        }
      </div>

      <div className="rcx-node-body">
        <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginBottom: 4, letterSpacing: 0.5 }}>
          linha original:
        </div>
        <textarea
          className="term-textarea"
          value={data.rawLine || ''}
          rows={2}
          style={{ fontSize: 10, resize: 'vertical', borderColor: '#ff8c0066' }}
          onChange={handleChange}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          readOnly={!!data._commented}
        />

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
    </div>
  );
});

RawNode.displayName = 'RawNode';
export default RawNode;
