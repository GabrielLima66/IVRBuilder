import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { cls } from '../../utils/common';

const MODE_COLOR = { contexto: '#00d4ff', fila: '#ff8c00', macro: '#a78bfa' };
const MODE_LABEL = { contexto: 'CONTEXTO', fila: 'FILA', macro: 'MACRO+FILA' };

// Handle leve para os 4 lados — posicionado por React Flow automaticamente
const SRC = { width: 10, height: 10 };
const TGT = { width: 10, height: 10 };

const RouteNode = memo(({ data, selected }) => {
  const mode  = data.routeMode || 'macro';
  const color = MODE_COLOR[mode] || '#ff8c00';

  return (
    <div className={cls('rcx-node', selected && 'selected')}
      style={{ borderColor: color + '99', minWidth: 230 }}>

      {/* ── Handles 4 lados ── */}
      <Handle type="target" position={Position.Top}    id="in"        style={{ ...TGT, background: color }} />
      <Handle type="target" position={Position.Left}   id="in-left"   style={{ ...TGT, background: color }} />
      <Handle type="source" position={Position.Bottom} id="out"       style={{ ...SRC, background: color }} />
      <Handle type="source" position={Position.Right}  id="out-right" style={{ ...SRC, background: color }} />

      <div className="rcx-node-header" style={{
        background: `linear-gradient(180deg, ${color}22 0%, ${color}08 100%)`,
        borderColor: color + '88', color,
      }}>
        <span style={{ textShadow: `0 0 5px ${color}` }}>▶ DESTINO / ROTA</span>
        <span className="badge" style={{ borderColor: color, color }}>
          {MODE_LABEL[mode] || 'MACRO+FILA'}
        </span>
      </div>

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
              <span className="v" style={{ fontSize: 10, color: '#a78bfa' }}>orpen-ivr-transfer</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

RouteNode.displayName = 'RouteNode';
export default RouteNode;
