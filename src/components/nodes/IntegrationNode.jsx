import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useReviewMode } from '../../contexts/ReviewModeContext';
import { useThemeContext } from '../../contexts/ThemeContext';
import { resolveNodeColor } from '../../utils/nodeColors';

const BASE_ACCENT = '#a78bfa';

const IntegrationNode = memo(({ id, data, selected }) => {
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  const reviewMode = useReviewMode();
  const theme = useThemeContext();
  const accent = resolveNodeColor(BASE_ACCENT, theme);

  const variables = Array.isArray(data.variables) ? data.variables : [];
  const agiScript = (data.agiScript || '').split('/').pop();
  const dest = data.destination || {};

  const destLabel =
    dest.type === 'goto'  ? `→ ${dest.context || '...'}` :
    dest.type === 'queue' ? `⇒ fila: ${dest.queue || '...'}` :
    null;

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor: accent,
        minWidth: 210,
        ...(isConnectedActive && {
          '--node-active-color': accent,
          '--node-active-glow': 'rgba(167,139,250,0.65)',
        }),
      }}
    >
      <Handle type="target" position={Position.Top}    id="in"        style={{ background: accent }} />
      <Handle type="target" position={Position.Left}   id="in-left"   style={{ background: accent }} />
      <Handle type="source" position={Position.Bottom} id="out"       style={{ background: accent }} />
      <Handle type="source" position={Position.Right}  id="out-right" style={{ background: accent }} />

      <div className="rcx-node-header" style={{
        background: `linear-gradient(180deg, ${accent}22 0%, ${accent}08 100%)`,
        borderColor: `${accent}66`,
        color: accent,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, opacity: 0.8 }}>INTEG</span>
          {reviewMode && (
            <span
              className="badge"
              style={{ borderColor: '#00cc4499', color: '#00cc44', fontSize: 9 }}
              title="Bloco de integração detectado automaticamente — confiança alta"
            >✓</span>
          )}
        </span>
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 11, letterSpacing: 1, paddingLeft: 6,
        }}>
          INTEGRAÇÃO
        </span>
      </div>

      <div className="rcx-node-body" style={{ gap: 3 }}>
        {variables.length > 0 && (
          <div style={{ fontSize: 9, color: '#d4b8ff', lineHeight: 1.5 }}>
            <span style={{ opacity: 0.6 }}>SET</span>{' '}
            {variables.map((v) => v.key || '?').join(', ')}
          </div>
        )}
        {agiScript && (
          <div style={{ fontSize: 9, color: accent, fontFamily: 'inherit', opacity: 0.9 }}>
            ▸ {agiScript}
          </div>
        )}
        {destLabel && (
          <div style={{
            fontSize: 9,
            color: dest.type === 'queue' ? '#ff8c00' : '#00d4ff',
            marginTop: 1,
          }}>
            {destLabel}
          </div>
        )}
        {!agiScript && variables.length === 0 && (
          <div style={{ fontSize: 9, color: 'var(--node-hint-color)', fontStyle: 'italic' }}>
            configure as propriedades →
          </div>
        )}
      </div>
    </div>
  );
});

IntegrationNode.displayName = 'IntegrationNode';
export default IntegrationNode;
