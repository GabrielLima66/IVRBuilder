import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';

/**
 * Retorna um label curto para um finalDestination.
 * @param {{ type: string, contextName?: string, ctx?: string, ext?: string, target?: string }|null} fd
 * @returns {string}
 */
function destLabel(fd) {
  if (!fd) return '';
  if (fd.type === 'context') return fd.contextName || '';
  if (fd.type === 'queue')   return `fila ${fd.ext || fd.ctx || ''}`;
  if (fd.type === 'dial')    return `Dial(${fd.target || ''})`;
  if (fd.type === 'hangup')  return 'Hangup';
  return '';
}

const MenuNode = memo(({ id, data, selected }) => {
  const digits = data.digits || [];
  const updateNodeInternals = useUpdateNodeInternals();
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);
  const modeCtx      = useModeContext();
  const displayTitle = getNodeLabel('menu', modeCtx);

  // Estado de expansão por dígito (Set de ids expandidos)
  const [expandedDigits, setExpandedDigits] = useState(new Set());

  useEffect(() => {
    updateNodeInternals(id);
  }, [digits.length, id, updateNodeInternals]);

  const toggleDigit = (digitId) => {
    setExpandedDigits((prev) => {
      const next = new Set(prev);
      if (next.has(digitId)) next.delete(digitId);
      else next.add(digitId);
      return next;
    });
  };

  // Exibição de áudio: primeiro arquivo + "+N" se houver múltiplos
  const audioFiles  = Array.isArray(data.audioFiles) && data.audioFiles.length > 0
    ? data.audioFiles
    : [data.greeting || '1-bem-vindo'];
  const firstAudio  = audioFiles[0] || '';
  const extraCount  = audioFiles.length - 1;

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
        {/* Linha de áudio com indicador de múltiplos */}
        <div className="rcx-node-row">
          <span className="k">audio</span>
          <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firstAudio}
            </span>
            {extraCount > 0 && (
              <span
                title={audioFiles.join('\n')}
                style={{
                  fontSize: 9,
                  background: 'var(--neon)',
                  color: '#000',
                  borderRadius: 3,
                  padding: '0 4px',
                  fontWeight: 'bold',
                  cursor: 'help',
                  flexShrink: 0,
                }}
              >
                +{extraCount}
              </span>
            )}
          </span>
        </div>
        <div className="rcx-node-row">
          <span className="k">wait</span>
          <span className="v">{data.waitExten || data.waitSeconds || 4}s</span>
        </div>

        {/*
          Bloco DTMF — margens negativas laterais cancelam o padding do body (10px)
          para que os handles fiquem exatamente na borda direita do nó.
        */}
        <div style={{ marginTop: 6, marginLeft: -10, marginRight: -10 }}>
          {digits.map((d) => {
            const hasActions  = Array.isArray(d.actions) && d.actions.length > 0;
            const isExpanded  = expandedDigits.has(d.id);
            const dLabel      = d.comment || d.label || `Opcao ${d.id}`;
            const dDest       = destLabel(d.finalDestination);

            return (
              <div key={d.id} style={{ position: 'relative' }}>
                {/* Linha principal do dígito */}
                <div
                  className="digit-row"
                  style={{
                    paddingLeft: 10,
                    paddingRight: 40,
                    cursor: hasActions ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 26,
                  }}
                  onClick={(e) => { e.stopPropagation(); if (hasActions) toggleDigit(d.id); }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                    <span className="badge" style={{ marginRight: 4, flexShrink: 0 }}>{d.id}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dLabel}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {dDest && (
                      <span style={{ fontSize: 9, color: 'var(--neon-dim)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        →{dDest}
                      </span>
                    )}
                    {hasActions && (
                      <span style={{ fontSize: 9, color: 'var(--neon)' }}>
                        {isExpanded ? '▲' : `▼${d.actions.length}`}
                      </span>
                    )}
                  </span>
                </div>

                {/* Lista expandida de ações */}
                {isExpanded && hasActions && (
                  <div style={{
                    paddingLeft: 16,
                    paddingRight: 40,
                    paddingBottom: 4,
                    fontSize: 9,
                    color: 'var(--neon-dim)',
                    background: 'rgba(0,0,0,0.2)',
                    borderLeft: '2px solid var(--neon)',
                    marginLeft: 10,
                    marginBottom: 2,
                    lineHeight: 1.8,
                  }}>
                    {d.actions.map((a, i) => {
                      const preview = a.data
                        ? Object.values(a.data).filter(Boolean).join(' ').slice(0, 35)
                        : '';
                      return (
                        <div key={i} style={{ display: 'flex', gap: 4 }}>
                          <span style={{ color: 'var(--neon)', minWidth: 12 }}>{i + 1}.</span>
                          <span style={{ color: '#fff', marginRight: 2 }}>{a.type}</span>
                          {preview && <span style={{ opacity: 0.7 }}>{preview}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Handle
                  type="source"
                  position={Position.Right}
                  id={`d-${d.id}`}
                />
              </div>
            );
          })}

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
