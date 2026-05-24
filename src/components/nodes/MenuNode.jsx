import React, { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';

const MenuNode = memo(({ id, data, selected }) => {
  const digits = data.digits || [];
  const updateNodeInternals = useUpdateNodeInternals();
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  const modeCtx      = useModeContext();
  const displayTitle = getNodeLabel('menu', modeCtx);

  useEffect(() => {
    updateNodeInternals(id);
  }, [digits.length, id, updateNodeInternals]);

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{ minWidth: 240 }}
    >
      {/* Entradas: topo e esquerda */}
      <Handle type="target" position={Position.Top}  id="in"      />
      <Handle type="target" position={Position.Left} id="in-left" />

      <div className="rcx-node-header">
        <span className="neon-text">▶ {displayTitle}</span>
        {modeCtx !== 'amigavel' && <span className="badge">(menu)</span>}
      </div>
      <div className="rcx-node-body">
        <div className="rcx-node-row"><span className="k">audio</span><span className="v">{data.greeting || '1-bem-vindo'}</span></div>
        <div className="rcx-node-row"><span className="k">wait</span><span className="v">{data.waitExten || 4}s</span></div>

        {/*
          Bloco DTMF — margens negativas laterais cancelam o padding do body (10px)
          para que os handles fiquem exatamente na borda direita do nó.
        */}
        <div style={{ marginTop: 6, marginLeft: -10, marginRight: -10 }}>
          {digits.map((d) => (
            <div key={d.id} className="digit-row" style={{ paddingLeft: 10, paddingRight: 10, position: 'relative' }}>
              <span>
                <span className="badge" style={{ marginRight: 6 }}>{d.id}</span>
                {d.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`d-${d.id}`}
              />
            </div>
          ))}

          <div className="digit-row" style={{ color: '#ff8c00', paddingLeft: 10, paddingRight: 10, position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>i</span>
              invalid
            </span>
            <Handle type="source" position={Position.Right} id="d-i"
              style={{ background: '#ff8c00' }} />
          </div>

          <div className="digit-row" style={{ color: '#ff8c00', paddingLeft: 10, paddingRight: 10, position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>t</span>
              timeout
            </span>
            <Handle type="source" position={Position.Right} id="d-t"
              style={{ background: '#ff8c00' }} />
          </div>
        </div>
      </div>
    </div>
  );
});

MenuNode.displayName = 'MenuNode';
export default MenuNode;
