/**
 * DtmfActionEditorModal — mini-editor de ações inline para opções DTMF.
 *
 * Abre quando o usuário clica em ✏ em uma opção do MenuNode.
 * Permite adicionar/editar/remover ações intermediárias e configurar o
 * destino final sem precisar criar um ContextNode.
 */

import React, { useState, useRef, useCallback } from 'react';

// ── Constantes de estilo ─────────────────────────────────────────────────────

const LABEL_STYLE = {
  fontSize: 9, color: 'var(--neon-dim)', letterSpacing: 1,
  display: 'block', marginBottom: 3,
};
const INPUT_W = { flex: 1, minWidth: 0 };

// ── Tipos de ação disponíveis no dropdown ────────────────────────────────────

const ACTION_TYPES = [
  { value: 'set',        label: 'Set' },
  { value: 'playback',   label: 'Playback' },
  { value: 'agi',        label: 'AGI' },
  { value: 'macro',      label: 'Macro' },
  { value: 'noop',       label: 'Noop' },
  { value: 'time',       label: 'GotoIfTime' },
  { value: 'execiftime', label: 'ExecIfTime' },
  { value: 'raw',        label: 'Raw' },
];

function defaultActionData(type) {
  switch (type) {
    case 'set':        return { assignment: 'VARIAVEL=valor' };
    case 'playback':   return { filename: '', label: '' };
    case 'agi':        return { script: '', params: [], label: '' };
    case 'macro':      return { name: '', params: [], label: '' };
    case 'noop':       return { text: '', label: '' };
    case 'time':       return { timeStart: '09:00', timeEnd: '18:00', weekdays: [], months: [], mday: '', trueContext: '', trueExtension: '', truePriority: '' };
    case 'execiftime': return { hours: '09:00-18:00', days: 'mon-fri', monthdays: '*', months: '*', action: '' };
    case 'raw':        return { rawLine: '' };
    default:           return {};
  }
}

// ── Campos dinâmicos por tipo de ação ────────────────────────────────────────

function ActionFields({ action, onUpdate }) {
  const d = action.data || {};
  const up = (patch) => onUpdate({ ...action, data: { ...d, ...patch } });

  switch (action.type) {
    case 'set':
      return (
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input
            className="term-input" style={INPUT_W}
            value={d.assignment || ''} placeholder="VARIAVEL=valor"
            onChange={(e) => up({ assignment: e.target.value })}
          />
        </div>
      );

    case 'playback':
      return (
        <input
          className="term-input" style={{ flex: 1 }}
          value={d.filename || ''} placeholder="arquivo-de-audio"
          onChange={(e) => up({ filename: e.target.value })}
        />
      );

    case 'agi':
      return (
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input
            className="term-input" style={{ flex: 2 }}
            value={d.script || ''} placeholder="script.php"
            onChange={(e) => up({ script: e.target.value })}
          />
          <input
            className="term-input" style={{ flex: 1 }}
            value={(d.params || []).join(',')} placeholder="param1,param2"
            onChange={(e) => up({ params: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      );

    case 'macro':
      return (
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input
            className="term-input" style={{ flex: 2 }}
            value={d.name || ''} placeholder="nome-da-macro"
            onChange={(e) => up({ name: e.target.value })}
          />
          <input
            className="term-input" style={{ flex: 1 }}
            value={(d.params || []).join(',')} placeholder="param1,param2"
            onChange={(e) => up({ params: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      );

    case 'noop':
      return (
        <input
          className="term-input" style={{ flex: 1 }}
          value={d.text || ''} placeholder="texto de debug"
          onChange={(e) => up({ text: e.target.value })}
        />
      );

    case 'time': {
      const wd  = Array.isArray(d.weekdays) ? d.weekdays.join('&') : (d.weekdays || '');
      const mon = Array.isArray(d.months)   ? d.months.join('&')   : (d.months   || '');
      return (
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          <input className="term-input" style={{ width: 90 }}
            value={`${d.timeStart || ''}${d.timeEnd ? '-' + d.timeEnd : ''}`}
            placeholder="09:00-18:00"
            onChange={(e) => {
              const [s, t] = e.target.value.split('-');
              up({ timeStart: s || '', timeEnd: t || '' });
            }} />
          <input className="term-input" style={{ width: 80 }}
            value={wd || '*'} placeholder="mon-fri"
            onChange={(e) => up({ weekdays: e.target.value === '*' ? [] : e.target.value.split('&') })} />
          <input className="term-input" style={{ width: 40 }}
            value={d.mday || '*'} placeholder="*"
            onChange={(e) => up({ mday: e.target.value })} />
          <input className="term-input" style={{ width: 60 }}
            value={mon || '*'} placeholder="jan-dec"
            onChange={(e) => up({ months: e.target.value === '*' ? [] : e.target.value.split('&') })} />
          <span style={{ color: 'var(--neon-dim)', alignSelf: 'center', fontSize: 9 }}>→</span>
          <input className="term-input" style={{ flex: 1, minWidth: 80 }}
            value={d.trueContext || ''} placeholder="ctx,s,1"
            onChange={(e) => {
              const parts = e.target.value.split(',');
              up({ trueContext: parts[0] || '', trueExtension: parts[1] || '', truePriority: parts[2] || '' });
            }} />
        </div>
      );
    }

    case 'execiftime':
      return (
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          <input className="term-input" style={{ width: 90 }} value={d.hours || '*'} placeholder="09:00-18:00"
            onChange={(e) => up({ hours: e.target.value })} />
          <input className="term-input" style={{ width: 80 }} value={d.days || '*'} placeholder="mon-fri"
            onChange={(e) => up({ days: e.target.value })} />
          <input className="term-input" style={{ width: 40 }} value={d.monthdays || '*'} placeholder="*"
            onChange={(e) => up({ monthdays: e.target.value })} />
          <input className="term-input" style={{ width: 60 }} value={d.months || '*'} placeholder="jan-dec"
            onChange={(e) => up({ months: e.target.value })} />
          <span style={{ color: 'var(--neon-dim)', alignSelf: 'center', fontSize: 9 }}>→</span>
          <input className="term-input" style={{ flex: 1, minWidth: 80 }} value={d.action || ''} placeholder="App(args)"
            onChange={(e) => up({ action: e.target.value })} />
        </div>
      );

    case 'raw':
      return (
        <input
          className="term-input" style={{ flex: 1, fontFamily: 'monospace' }}
          value={d.rawLine || ''} placeholder="Goto(ctx,s,1)"
          onChange={(e) => up({ rawLine: e.target.value })}
        />
      );

    default:
      return null;
  }
}

// ── Linha de uma ação na lista ────────────────────────────────────────────────

function ActionRow({ action, index, count, onUpdate, onRemove, onMoveUp, onMoveDown, dragRef }) {
  return (
    <div
      draggable
      onDragStart={() => { dragRef.current = index; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = dragRef.current;
        if (from == null || from === index) return;
        dragRef.current = null;
        onMoveUp(from, index);
      }}
      style={{
        display: 'flex', gap: 6, alignItems: 'center',
        marginBottom: 6, cursor: 'grab',
      }}
    >
      {/* Drag handle */}
      <span style={{ fontSize: 12, color: 'var(--neon-dim)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>

      {/* Type selector */}
      <select
        className="term-select"
        style={{ width: 108, flexShrink: 0 }}
        value={action.type}
        onChange={(e) => onUpdate({ ...action, type: e.target.value, data: defaultActionData(e.target.value) })}
      >
        {ACTION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Dynamic fields */}
      <ActionFields action={action} onUpdate={onUpdate} />

      {/* Remove button */}
      <button
        type="button"
        className="btn-neon btn-danger"
        style={{ padding: '3px 7px', flexShrink: 0 }}
        aria-label={`Remover ação ${index + 1}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

// ── Selector de destino final ─────────────────────────────────────────────────

const DEST_TYPES = [
  { value: 'none',           label: 'Nenhum' },
  { value: 'context',        label: 'Goto' },
  { value: 'queue_direct',   label: 'Fila' },
  { value: 'dial',           label: 'Dial' },
  { value: 'playback_final', label: 'Playback final' },
];

function getFdType(fd) {
  if (!fd) return 'none';
  if (fd.type === 'context')        return 'context';
  if (fd.type === 'queue_direct')   return 'queue_direct';
  if (fd.type === 'queue')          return 'queue_direct'; // compatibilidade
  if (fd.type === 'dial')           return 'dial';
  if (fd.type === 'playback_final') return 'playback_final';
  return 'none';
}

function defaultFd(type) {
  switch (type) {
    case 'context':        return { type: 'context', contextName: '', ext: 's', pri: '1', argCount: 3 };
    case 'queue_direct':   return { type: 'queue_direct', queue: '', queueOptions: '' };
    case 'dial':           return { type: 'dial', target: '', timeout: '30' };
    case 'playback_final': return { type: 'playback_final', filename: '' };
    default:               return null;
  }
}

function DestinationFields({ fd, onUpdate }) {
  if (!fd) return null;
  switch (getFdType(fd)) {
    case 'context':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="term-input" style={{ flex: 3 }}
            value={fd.contextName || ''} placeholder="nome-do-contexto"
            onChange={(e) => onUpdate({ ...fd, contextName: e.target.value })} />
          <input className="term-input" style={{ width: 36 }}
            value={fd.ext || 's'} placeholder="s"
            onChange={(e) => onUpdate({ ...fd, ext: e.target.value })} />
          <input className="term-input" style={{ width: 36 }}
            value={fd.pri || '1'} placeholder="1"
            onChange={(e) => onUpdate({ ...fd, pri: e.target.value })} />
        </div>
      );
    case 'queue_direct':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="term-input" style={{ flex: 1 }}
            value={fd.queue || ''} placeholder="7000"
            onChange={(e) => onUpdate({ ...fd, queue: e.target.value, type: 'queue_direct' })} />
          <input className="term-input" style={{ flex: 1 }}
            value={fd.queueOptions || ''} placeholder="opções (opcional)"
            onChange={(e) => onUpdate({ ...fd, queueOptions: e.target.value, type: 'queue_direct' })} />
        </div>
      );
    case 'dial':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="term-input" style={{ flex: 2 }}
            value={fd.target || ''} placeholder="SIP/ramal"
            onChange={(e) => onUpdate({ ...fd, target: e.target.value })} />
          <input className="term-input" style={{ width: 60 }}
            value={fd.timeout || '30'} placeholder="30"
            onChange={(e) => onUpdate({ ...fd, timeout: e.target.value })} />
        </div>
      );
    case 'playback_final':
      return (
        <input className="term-input" style={{ flex: 1 }}
          value={fd.filename || ''} placeholder="arquivo-de-audio"
          onChange={(e) => onUpdate({ ...fd, filename: e.target.value, type: 'playback_final' })} />
      );
    default:
      return null;
  }
}

// ── Modal principal ───────────────────────────────────────────────────────────

export default function DtmfActionEditorModal({ menuNode, digitId, onClose, onSave }) {
  const digit = (menuNode?.data?.digits || []).find((d) => d.id === digitId) || {};
  const dLabel = digit.comment || digit.label || `Opcao ${digitId}`;

  const [localActions, setLocalActions] = useState(() => {
    const acts = Array.isArray(digit.actions) ? digit.actions : [];
    return acts.map((a) => ({ ...a, data: { ...(a.data || {}) } }));
  });

  const [localFd, setLocalFd]         = useState(digit.finalDestination || null);
  const [fdType, setFdType]           = useState(getFdType(digit.finalDestination));
  const dragRef = useRef(null);

  // ── Handlers de ações ───────────────────────────────────────────────────────

  const addAction = useCallback(() => {
    const type = 'set';
    setLocalActions((prev) => [...prev, { type, data: defaultActionData(type) }]);
  }, []);

  const updateAction = useCallback((idx, updated) => {
    setLocalActions((prev) => prev.map((a, i) => (i === idx ? updated : a)));
  }, []);

  const removeAction = useCallback((idx) => {
    setLocalActions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const moveAction = useCallback((from, to) => {
    setLocalActions((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  // ── Handlers de destino final ────────────────────────────────────────────────

  const changeFdType = useCallback((newType) => {
    setFdType(newType);
    setLocalFd(defaultFd(newType));
  }, []);

  // ── Salvar ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    onSave(digitId, localActions, localFd);
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const sectionHdr = (label) => (
    <div style={{
      fontSize: 9, letterSpacing: 2, color: 'var(--neon-dim)',
      borderBottom: '1px solid var(--line)',
      paddingBottom: 6, marginBottom: 12, marginTop: 18,
    }}>
      ▌ {label}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620, width: '92vw', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div className="neon-text" style={{ fontSize: 12, letterSpacing: 1 }}>
            // OPÇÃO [{digitId}] — {dLabel}
          </div>
          <button
            type="button"
            className="btn-neon btn-danger"
            style={{ padding: '3px 10px' }}
            onClick={onClose}
            aria-label="Fechar"
          >
            X
          </button>
        </div>

        {/* ── Conteúdo scrollável ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 12px' }}>
          {sectionHdr('COMANDOS RÁPIDOS')}

          {localActions.length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--neon-dim)', opacity: 0.5, marginBottom: 8, letterSpacing: 0.5 }}>
              // nenhuma ação configurada — o fluxo vai direto ao destino final
            </div>
          )}

          {localActions.map((action, idx) => (
            <ActionRow
              key={idx}
              action={action}
              index={idx}
              count={localActions.length}
              onUpdate={(updated) => updateAction(idx, updated)}
              onRemove={() => removeAction(idx)}
              onMoveUp={(from, to) => moveAction(from, to)}
              onMoveDown={() => {}} // handled via drag
              dragRef={dragRef}
            />
          ))}

          <button
            type="button"
            className="btn-neon"
            style={{ width: '100%', padding: '4px 8px', marginTop: 4, fontSize: 11, letterSpacing: 1 }}
            onClick={addAction}
          >
            + ADICIONAR AÇÃO
          </button>

          {sectionHdr('DESTINO FINAL')}

          {/* Tipo de destino */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {DEST_TYPES.map((dt) => (
              <button
                key={dt.value}
                type="button"
                onClick={() => changeFdType(dt.value)}
                style={{
                  background: fdType === dt.value ? 'var(--neon-glow-faint)' : 'transparent',
                  border: `1px solid ${fdType === dt.value ? 'var(--neon)' : 'var(--line)'}`,
                  color: fdType === dt.value ? 'var(--neon)' : 'var(--neon-dim)',
                  fontFamily: 'inherit', fontSize: 10, letterSpacing: 0.5,
                  padding: '3px 10px', cursor: 'pointer', borderRadius: 2,
                  transition: 'all 0.1s',
                }}
              >
                {dt.label}
              </button>
            ))}
          </div>

          {/* Campos do destino */}
          {localFd && (
            <DestinationFields fd={localFd} onUpdate={setLocalFd} />
          )}
          {fdType === 'none' && (
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', opacity: 0.5, marginTop: 4 }}>
              // sem destino — o handle de saída do MenuNode fica disponível para conectar via edge
            </div>
          )}
        </div>

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--line)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button type="button" className="btn-neon" onClick={handleSave}
            style={{ padding: '6px 18px', fontSize: 11, letterSpacing: 1 }}>
            SALVAR
          </button>
          <button type="button" className="btn-neon" onClick={onClose}
            style={{ padding: '6px 14px', fontSize: 11, letterSpacing: 1, opacity: 0.6 }}>
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  );
}
