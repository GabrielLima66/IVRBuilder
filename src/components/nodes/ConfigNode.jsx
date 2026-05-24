import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';

const ConfigNode = memo(({ id, data, selected }) => {
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  return (
  <div className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')} style={{ borderColor: 'var(--neon)' }}>
    <div className="rcx-node-header">
      <span className="neon-text">▶ CONFIG / START</span>
      <span className="badge">IVR {data.ivr || '----'}</span>
    </div>
    <div className="rcx-node-body">
      <div className="rcx-node-row">
        <span className="k">__IVR</span>
        <span className="v">{data.ivr || '----'}</span>
      </div>
      <div className="rcx-node-row">
        <span className="k">SOUND_PATH</span>
        <span className="v" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.soundPath}
        </span>
      </div>
      <div className="rcx-node-row">
        <span className="k">AGI_PATH</span>
        <span className="v" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.agiPath}
        </span>
      </div>
      <div className="rcx-node-row">
        <span className="k">language</span>
        <span className="v">{data.language || 'pt_BR'}</span>
      </div>
    </div>
    {/* ConfigNode é o START: apenas saídas */}
    <Handle type="source" position={Position.Bottom} id="out"       style={{ background: 'var(--neon)' }} />
    <Handle type="source" position={Position.Right}  id="out-right" style={{ background: 'var(--neon)' }} />
    <Handle type="source" position={Position.Left}   id="out-left"  style={{ background: 'var(--neon)' }} />
  </div>
  );
});

ConfigNode.displayName = 'ConfigNode';
export default ConfigNode;
