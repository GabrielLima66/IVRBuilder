import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { ACTION_META } from '../../utils/actionMeta';
import { cls } from '../../utils/common';

const ActionNode = memo(({ data, selected, type }) => {
  const meta = ACTION_META[type];
  if (!meta) return null;
  const Icon = meta.icon;
  const rows = meta.summary(data) || [];

  // Validação em tempo real: borda vermelha se inválido
  const errors   = meta.validate ? meta.validate(data) : [];
  const isInvalid = errors.length > 0;
  const borderColor = isInvalid ? '#ff5050' : (meta.color + '99');

  return (
    <div
      className={cls('rcx-node', selected && 'selected')}
      style={{ borderColor, minWidth: 210 }}
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
          <Icon size={12} /> {meta.title}
        </span>
        <span className="badge" style={{ borderColor: meta.color, color: meta.color }}>{meta.app}</span>
      </div>

      {/* Badge de label em amarelo neon (visível quando label está definido) */}
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

        {/* Banner de validação */}
        {isInvalid && (
          <div style={{
            marginTop: 6, padding: '3px 6px',
            fontSize: 9, color: '#ff5050',
            borderTop: '1px dashed #ff505066',
          }}>
            ⚠ {errors[0]}
          </div>
        )}
      </div>
    </div>
  );
});

ActionNode.displayName = 'ActionNode';
export default ActionNode;
