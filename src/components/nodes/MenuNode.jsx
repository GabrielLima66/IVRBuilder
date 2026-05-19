import React, { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { cls } from '../../utils/common';

const MenuNode = memo(({ id, data, selected }) => {
  const digits = data.digits || [];
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [digits.length, id, updateNodeInternals]);

  return (
    <div className={cls('rcx-node', selected && 'selected')} style={{ minWidth: 240 }}>
      {/* Entradas: topo e esquerda */}
      <Handle type="target" position={Position.Top}  id="in"      />
      <Handle type="target" position={Position.Left} id="in-left" />

      <div className="rcx-node-header">
        <span className="neon-text">▶ IVR MENU</span>
        <span className="badge">(menu)</span>
      </div>
      <div className="rcx-node-body">
        <div className="rcx-node-row"><span className="k">audio</span><span className="v">{data.greeting || '1-bem-vindo'}</span></div>
        <div className="rcx-node-row"><span className="k">wait</span><span className="v">{data.waitExten || 4}s</span></div>
        <div style={{ marginTop: 6 }}>
          {/* Handles de DTMF — lado direito (posição relativa via CSS) */}
          {digits.map((d) => (
            <div key={d.id} className="digit-row">
              <span>
                <span className="badge" style={{ marginRight: 6 }}>{d.id}</span>
                {d.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`d-${d.id}`}
                style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          ))}
          <div className="digit-row" style={{ color: '#ff8c00', position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>i</span>
              invalid
            </span>
            <Handle type="source" position={Position.Right} id="d-i"
              style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', background: '#ff8c00' }} />
          </div>
          <div className="digit-row" style={{ color: '#ff8c00', position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>t</span>
              timeout
            </span>
            <Handle type="source" position={Position.Right} id="d-t"
              style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', background: '#ff8c00' }} />
          </div>
        </div>
      </div>
    </div>
  );
});

MenuNode.displayName = 'MenuNode';
export default MenuNode;
