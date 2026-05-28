import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';
import { useMenuActions } from '../../contexts/MenuActionsContext';

function destLabel(fd) {
  if (!fd) return '';
  if (fd.type === 'context') return fd.contextName || '';
  if (fd.type === 'queue')   return `fila ${fd.ext || fd.ctx || ''}`;
  if (fd.type === 'dial')    return `Dial(${fd.target || ''})`;
  if (fd.type === 'hangup')  return 'Hangup';
  return '';
}

const ACTION_BTN = {
  background:  'none',
  border:      'none',
  cursor:      'pointer',
  fontSize:    8,
  color:       'var(--neon)',
  opacity:     0.7,
  fontFamily:  'inherit',
  letterSpacing: 0.5,
  padding:     '0 3px',
  flexShrink:  0,
  lineHeight:  1,
  transition:  'opacity 0.1s',
};

const MenuNode = memo(({ id, data, selected }) => {
  const digits = data.digits || [];
  const updateNodeInternals = useUpdateNodeInternals();
  const { activeNodeIds }   = useActiveSelection();
  const isConnectedActive   = activeNodeIds.has(id);
  const modeCtx             = useModeContext();
  const displayTitle        = getNodeLabel('menu', modeCtx);
  const menuActions         = useMenuActions();
  const rfInstance          = useReactFlow();

  // Todos os hooks antes de qualquer early return — Rules of Hooks
  const [expandedDigits,    setExpandedDigits]    = useState(new Set());
  const [hoveredDigitId,    setHoveredDigitId]    = useState(null);
  const [collapseConfirmId, setCollapseConfirmId] = useState(null);
  const [collapseIsModified, setCollapseIsModified] = useState(false);

  useEffect(() => {
    updateNodeInternals(id);
  }, [digits.length, id, updateNodeInternals]);

  const toggleDigit = (digitId) => {
    setExpandedDigits((prev) => {
      const next = new Set(prev);
      if (next.has(digitId)) next.delete(digitId); else next.add(digitId);
      return next;
    });
  };

  // Centraliza o canvas no ContextNode expandido
  const navigateToCtx = (ctxId) => {
    const nodes   = rfInstance.getNodes();
    const ctxNode = nodes.find((n) => n.id === ctxId);
    if (!ctxNode) return;
    const w = ctxNode.style?.width  || ctxNode.width  || 320;
    const h = ctxNode.style?.height || ctxNode.height || 100;
    rfInstance.fitBounds(
      { x: ctxNode.position.x, y: ctxNode.position.y, width: w, height: h },
      { duration: 600, padding: 0.25 }
    );
  };

  // ── EXPANDIR ─────────────────────────────────────────────────────────────
  const handleExpand = (e, digitId) => {
    e.stopPropagation();
    menuActions?.expandDigitToContext(id, digitId);
  };

  // ── RECOLHER: inicia confirmação inline ──────────────────────────────────
  const handleCollapseRequest = (e, digitId) => {
    e.stopPropagation();
    const digit   = (data.digits || []).find((d) => d.id === digitId);
    const ctxId   = digit?.expandedToContextId;
    const nodes   = rfInstance.getNodes();
    const ctxNode = nodes.find((n) => n.id === ctxId);
    const current  = ctxNode?.data.childOrder?.length ?? 0;
    const original = digit?.expandedChildCount ?? 0;
    setCollapseIsModified(current !== original);
    setCollapseConfirmId(digitId);
  };

  // Confirma o recolher
  const handleCollapseConfirm = (e, digitId) => {
    e.stopPropagation();
    menuActions?.collapseDigitContext(id, digitId);
    setCollapseConfirmId(null);
    setHoveredDigitId(null);
  };

  // Cancela o recolher
  const handleCollapseCancel = (e) => {
    e.stopPropagation();
    setCollapseConfirmId(null);
  };

  const audioFiles = Array.isArray(data.audioFiles) && data.audioFiles.length > 0
    ? data.audioFiles
    : [data.greeting || '1-bem-vindo'];
  const firstAudio = audioFiles[0] || '';
  const extraCount = audioFiles.length - 1;

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{ minWidth: 240 }}
    >
      <Handle type="target" position={Position.Top}  id="in"      />
      <Handle type="target" position={Position.Left} id="in-left" />

      <div className="rcx-node-header">
        <span className="neon-text">▶ {displayTitle}</span>
        {modeCtx !== 'amigavel' && <span className="badge">(menu)</span>}
      </div>

      <div className="rcx-node-body">
        {/* Linha de áudio */}
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
                  fontSize: 9, background: 'var(--neon)', color: '#000',
                  borderRadius: 3, padding: '0 4px', fontWeight: 'bold',
                  cursor: 'help', flexShrink: 0,
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

        {/* Bloco DTMF */}
        <div style={{ marginTop: 6, marginLeft: -10, marginRight: -10 }}>
          {digits.map((d) => {
            const hasActions      = Array.isArray(d.actions) && d.actions.length > 0;
            const isExpandedInline = expandedDigits.has(d.id);
            const isExpandedToCtx = !!d.expandedToContextId;
            const isHovered       = hoveredDigitId === d.id;
            const isConfirming    = collapseConfirmId === d.id;
            const dLabel          = d.comment || d.label || `Opcao ${d.id}`;
            const dDest           = destLabel(d.finalDestination);

            return (
              <div key={d.id} style={{ position: 'relative' }}>
                {/* Linha principal */}
                <div
                  className="digit-row"
                  style={{
                    paddingLeft: 10, paddingRight: 40,
                    cursor: !isExpandedToCtx && hasActions ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: 26,
                  }}
                  onMouseEnter={() => setHoveredDigitId(d.id)}
                  onMouseLeave={() => {
                    // Mantém hover enquanto confirmação estiver aberta para este dígito
                    if (collapseConfirmId !== d.id) setHoveredDigitId(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpandedToCtx && hasActions) toggleDigit(d.id);
                  }}
                >
                  {/* Esquerda: badge + label */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', minWidth: 0 }}>
                    <span className="badge" style={{ marginRight: 4, flexShrink: 0 }}>{d.id}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dLabel}
                    </span>
                  </span>

                  {/* Direita */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, maxWidth: 130 }}>
                    {isExpandedToCtx ? (
                      <>
                        {/* Link para o ContextNode */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigateToCtx(d.expandedToContextId); }}
                          title={`Ir para ${d.expandedToContextName}`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 9, color: 'var(--neon)', fontFamily: 'inherit',
                            letterSpacing: 0.3, padding: 0,
                            display: 'flex', alignItems: 'center', gap: 2,
                            maxWidth: isHovered && !isConfirming ? 70 : 115,
                            overflow: 'hidden',
                          }}
                        >
                          <span style={{ color: 'var(--neon-dim)', flexShrink: 0 }}>→</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.expandedToContextName}
                          </span>
                          <span style={{ flexShrink: 0 }}>⤢</span>
                        </button>

                        {/* Botão RECOLHER */}
                        {isHovered && !isConfirming && (
                          <button
                            type="button"
                            onClick={(e) => handleCollapseRequest(e, d.id)}
                            aria-label={`Recolher contexto da opção ${d.id}`}
                            style={ACTION_BTN}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                          >
                            ⤡ RECOLHER
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {!isHovered && dDest && (
                          <span style={{ fontSize: 9, color: 'var(--neon-dim)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            →{dDest}
                          </span>
                        )}
                        {!isHovered && hasActions && (
                          <span style={{ fontSize: 9, color: 'var(--neon)' }}>
                            {isExpandedInline ? '▲' : `▼${d.actions.length}`}
                          </span>
                        )}
                        {isHovered && hasActions && (
                          <button
                            type="button"
                            onClick={(e) => handleExpand(e, d.id)}
                            aria-label={`Expandir opção ${d.id} para contexto`}
                            style={ACTION_BTN}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                          >
                            ⤢ EXPANDIR
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>

                {/* Confirmação inline de recolher */}
                {isConfirming && isExpandedToCtx && (
                  <div
                    style={{
                      paddingLeft: 16, paddingRight: 40, paddingTop: 4, paddingBottom: 6,
                      fontSize: 9, color: 'var(--neon-dim)',
                      background: 'rgba(0,0,0,0.25)',
                      borderLeft: '2px solid var(--neon)',
                      marginLeft: 10, marginBottom: 2,
                      lineHeight: 1.7,
                    }}
                  >
                    {collapseIsModified && (
                      <div style={{ color: '#ffcc00', marginBottom: 3, lineHeight: 1.6 }}>
                        ⚠ O contexto foi modificado. Recolher pode perder alterações feitas diretamente no contexto.
                      </div>
                    )}
                    <div style={{ marginBottom: 5 }}>
                      Recolher vai trazer as ações de volta para o menu e remover o contexto. Confirmar?
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => handleCollapseConfirm(e, d.id)}
                        style={{
                          ...ACTION_BTN, opacity: 1,
                          border: '1px solid var(--neon)', padding: '1px 6px', borderRadius: 2,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neon-glow-faint)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        SIM
                      </button>
                      <button
                        type="button"
                        onClick={handleCollapseCancel}
                        style={{
                          ...ACTION_BTN, opacity: 1, color: 'var(--neon-dim)',
                          border: '1px solid var(--line)', padding: '1px 6px', borderRadius: 2,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-dim)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                      >
                        NÃO
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista inline de ações (toggle ▼/▲) */}
                {!isExpandedToCtx && isExpandedInline && hasActions && (
                  <div style={{
                    paddingLeft: 16, paddingRight: 40, paddingBottom: 4,
                    fontSize: 9, color: 'var(--neon-dim)',
                    background: 'rgba(0,0,0,0.2)',
                    borderLeft: '2px solid var(--neon)',
                    marginLeft: 10, marginBottom: 2,
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

                <Handle type="source" position={Position.Right} id={`d-${d.id}`} />
              </div>
            );
          })}

          <div className="digit-row" style={{ color: '#ff8c00', paddingLeft: 10, paddingRight: 10, position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>i</span>
              invalid
            </span>
            <Handle type="source" position={Position.Right} id="d-i" style={{ background: '#ff8c00' }} />
          </div>

          <div className="digit-row" style={{ color: '#ff8c00', paddingLeft: 10, paddingRight: 10, position: 'relative' }}>
            <span>
              <span className="badge" style={{ borderColor: '#ff8c00', color: '#ff8c00', marginRight: 6 }}>t</span>
              timeout
            </span>
            <Handle type="source" position={Position.Right} id="d-t" style={{ background: '#ff8c00' }} />
          </div>
        </div>
      </div>
    </div>
  );
});

MenuNode.displayName = 'MenuNode';
export default MenuNode;
