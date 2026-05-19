/**
 * RawNode — representa um comando Asterisk não reconhecido pelo parser.
 * Visual: borda laranja neon, editable.
 * O nó exporta a linha original intacta no .conf.
 */
import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';

const RawNode = memo(({ id, data, selected }) => {
  const { setNodes } = useReactFlow();

  const handleChange = useCallback((e) => {
    setNodes((ns) =>
      ns.map((n) => n.id === id ? { ...n, data: { ...n.data, rawLine: e.target.value } } : n)
    );
  }, [id, setNodes]);

  return (
    <div
      className={cls('rcx-node', selected && 'selected')}
      style={{ borderColor: '#ff8c0099', minWidth: 220 }}
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
        <span style={{ fontSize: 9, letterSpacing: 1.5 }}>// RAW</span>
        <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', fontSize: 8 }}>
          não mapeado
        </span>
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
        />
      </div>
    </div>
  );
});

RawNode.displayName = 'RawNode';
export default RawNode;
