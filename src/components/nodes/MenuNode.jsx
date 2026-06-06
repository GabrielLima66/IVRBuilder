import React, { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { useModeContext } from '../../contexts/ModeContext';
import { getNodeLabel } from '../../config/nodeModeConfig';
import { useMenuActions } from '../../contexts/MenuActionsContext';

/** Conta ações reais (exclui boilerplate sayDigit/logIvr — já filtrado pelo resolver) */
const REAL_ACTION_TYPES = new Set(['set','agi','playback','background','execiftime','time','sipaddheader','macro','noop','raw']);
function realActionCount(actions) {
  return (actions || []).filter((a) => REAL_ACTION_TYPES.has(a.type)).length;
}

function destLabel(fd) {
  if (!fd) return '';
  if (fd.type === 'context')        return fd.contextName || '';
  if (fd.type === 'queue')          return `fila ${fd.ext || fd.ctx || ''}`;
  if (fd.type === 'queue_direct')   return `Queue(${fd.queue || ''})`;
  if (fd.type === 'dial')           return `Dial(${fd.target || ''})`;
  if (fd.type === 'hangup')         return 'Hangup';
  if (fd.type === 'playback_final') return `▶${fd.filename || ''}`;
  return '';
}

const EDIT_BTN = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 9, color: 'var(--neon)', opacity: 0.5,
  fontFamily: 'inherit', padding: '0 2px', flexShrink: 0,
  transition: 'opacity 0.1s', lineHeight: 1,
};

const minBtnSty = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 9, padding: '0 2px', lineHeight: 1,
  opacity: 0.6, flexShrink: 0, fontFamily: 'inherit', color: 'inherit',
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
  const { setNodes }        = rfInstance;

  const toggleMinimize = useCallback(() => {
    setNodes((ns) => ns.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, minimized: !n.data.minimized } } : n
    ));
  }, [id, setNodes]);

  // Todos os hooks antes de qualquer early return — Rules of Hooks
  const [editingDigitId, setEditingDigitId] = useState(null);
  const [editingValue,   setEditingValue]   = useState('');
  const [hoveredDigitId, setHoveredDigitId] = useState(null);

  useEffect(() => {
    updateNodeInternals(id);
  }, [digits.length, id, updateNodeInternals]);

  // Navega para o ContextNode vinculado ao dígito
  const navigateToCtx = useCallback((ctxId) => {
    const nodes   = rfInstance.getNodes();
    const ctxNode = nodes.find((n) => n.id === ctxId);
    if (!ctxNode) return;
    const w = ctxNode.style?.width  || ctxNode.width  || 320;
    const h = ctxNode.style?.height || ctxNode.height || 100;
    rfInstance.fitBounds(
      { x: ctxNode.position.x, y: ctxNode.position.y, width: w, height: h },
      { duration: 600, padding: 0.25 }
    );
  }, [rfInstance]);

  // Edição inline do label do dígito (duplo clique no nome)
  const startEdit = (e, d) => {
    e.stopPropagation();
    setEditingDigitId(d.id);
    setEditingValue(d.label || d.comment || `Opcao ${d.id}`);
  };

  const commitEdit = useCallback((e) => {
    e.stopPropagation();
    if (editingDigitId === null) return;
    menuActions?.updateDigitLabel(id, editingDigitId, editingValue);
    setEditingDigitId(null);
  }, [editingDigitId, editingValue, id, menuActions]);

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
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="neon-text">
          <button type="button" aria-label={data.minimized ? 'Expandir nó' : 'Minimizar nó'}
            title={data.minimized ? 'Expandir' : 'Minimizar'}
            onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={minBtnSty}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          >
            {data.minimized ? '▶' : '▼'}
          </button>
          {displayTitle}
        </span>
        {modeCtx !== 'amigavel' && <span className="badge">(menu)</span>}
      </div>

      {!data.minimized && <div className="rcx-node-body">
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
            const isExpandedToCtx = !!d.expandedToContextId;
            const dLabel          = d.comment || d.label || `Opcao ${d.id}`;
            const dDest           = !isExpandedToCtx ? destLabel(d.finalDestination) : '';
            const isEditing       = editingDigitId === d.id;
            const isHovered       = hoveredDigitId === d.id;
            const actionCount     = realActionCount(d.actions);
            const hasActions      = actionCount > 0;

            return (
              <div key={d.id} style={{ position: 'relative' }}>
                <div
                  className="digit-row"
                  style={{
                    paddingLeft: 10, paddingRight: 40,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: 26,
                  }}
                  onMouseEnter={() => setHoveredDigitId(d.id)}
                  onMouseLeave={() => setHoveredDigitId(null)}
                >
                  {/* Esquerda: badge + label editável */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    <span className="badge" style={{ marginRight: 4, flexShrink: 0 }}>{d.id}</span>

                    {isEditing ? (
                      <input
                        autoFocus
                        className="term-input"
                        style={{ flex: 1, fontSize: 10, padding: '1px 4px' }}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(e); if (e.key === 'Escape') { e.stopPropagation(); setEditingDigitId(null); } }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        title="Duplo clique para editar nome"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1 }}
                        onDoubleClick={(e) => startEdit(e, d)}
                      >
                        {dLabel}
                      </span>
                    )}
                  </span>

                  {/* Direita: badge de ações, link/destino e botão de edição */}
                  {!isEditing && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, maxWidth: 130 }}>
                      {/* Badge ▼N quando há ações configuradas (sem ContextNode) */}
                      {hasActions && !isExpandedToCtx && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); menuActions?.openDigitEditor(id, d.id); }}
                          title={`${actionCount} ação(ões) — clique para editar`}
                          style={{
                            ...EDIT_BTN, opacity: 0.7,
                            background: 'var(--neon-glow-bg)',
                            border: '1px solid var(--neon-dim)',
                            borderRadius: 2,
                            padding: '0 4px',
                            fontSize: 8,
                          }}
                        >
                          ▼{actionCount}
                        </button>
                      )}

                      {isExpandedToCtx ? (
                        /* Link para ContextNode */
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigateToCtx(d.expandedToContextId); }}
                          title={`Ir para ${d.expandedToContextName}`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 9, color: 'var(--neon)', fontFamily: 'inherit',
                            letterSpacing: 0.3, padding: 0,
                            display: 'flex', alignItems: 'center', gap: 2,
                            maxWidth: 95, overflow: 'hidden',
                          }}
                        >
                          <span style={{ color: 'var(--neon-dim)', flexShrink: 0 }}>→</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.expandedToContextName}
                          </span>
                          <span style={{ flexShrink: 0 }}>⤢</span>
                        </button>
                      ) : dDest ? (
                        <span style={{ fontSize: 9, color: 'var(--neon-dim)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          →{dDest}
                        </span>
                      ) : null}

                      {/* Botão ✏ de edição — visível no hover para opções não expandidas */}
                      {!isExpandedToCtx && (
                        <button
                          type="button"
                          aria-label={`Editar ações da opção ${d.id}`}
                          title="Editar ações desta opção"
                          onClick={(e) => { e.stopPropagation(); menuActions?.openDigitEditor(id, d.id); }}
                          style={{
                            ...EDIT_BTN,
                            opacity: isHovered ? 0.8 : 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = isHovered ? '0.8' : '0'; }}
                        >
                          ✏
                        </button>
                      )}
                    </span>
                  )}
                </div>

                {/* Sugestão de expansão quando 2+ ações reais */}
                {!isExpandedToCtx && actionCount >= 2 && (
                  <div
                    style={{
                      paddingLeft: 10, paddingRight: 40,
                      fontSize: 8, color: 'var(--neon)', opacity: 0.4,
                      paddingBottom: 2, lineHeight: 1.4,
                    }}
                  >
                    // {actionCount} ações — considere expandir para contexto{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); menuActions?.expandDigitToContext(id, d.id); }}
                      style={{ ...EDIT_BTN, fontSize: 8, opacity: 1 }}
                      title="Expandir para ContextNode"
                    >
                      ⤢
                    </button>
                  </div>
                )}

                <Handle type="source" position={Position.Right} id={`d-${d.id}`} />
              </div>
            );
          })}

          {/* Handles fixos: invalid e timeout */}
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
      </div>}
    </div>
  );
});

MenuNode.displayName = 'MenuNode';
export default MenuNode;
