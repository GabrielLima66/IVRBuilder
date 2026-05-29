import React, { memo, useRef, useState } from 'react';
import { ACTION_META } from '../../utils/actionMeta';
import {
  formatDayRange, WEEKDAY_ORDER, MONTH_ORDER, getMaxDay, buildTimeExport,
} from '../../utils/timeUtils';
import { useModeContext } from '../../contexts/ModeContext';
import { NODE_MODE_CONFIG, getFieldLabel, getNodeLabel } from '../../config/nodeModeConfig';
import { isContextNameDuplicate } from '../../utils/contextUtils';
import ContextNavPanel from './ContextNavPanel';

// ─── Inputs estáveis (fora do componente pai para não recriar a cada render) ─

const Field = memo(function Field({ d, set, label, k, type = 'text', placeholder, options }) {
  if (options) {
    return (
      <div style={{ marginBottom: 10 }}>
        <label className="term-label">{label}</label>
        <select className="term-select" value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="term-label">{label}</label>
      <input
        className="term-input"
        type={type}
        value={d[k] ?? ''}
        placeholder={placeholder || ''}
        onChange={(e) => set(k, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
});

const Toggle = memo(function Toggle({ d, set, label, k }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={!!d[k]}
        onChange={(e) => set(k, e.target.checked)}
        style={{ accentColor: 'var(--neon)' }}
      />
      <span style={{ fontSize: 11, letterSpacing: 1, color: 'var(--neon)' }}>{label}</span>
    </label>
  );
});

// ─── Sub-componentes para o TimeConditionNode ────────────────────────────────

const SECTION_HDR = {
  fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1, marginBottom: 6,
};

const MINI_BTN = {
  background: 'transparent', border: '1px solid var(--line)', color: 'var(--neon)',
  padding: '1px 6px', fontSize: 9, cursor: 'pointer', borderRadius: 2,
  letterSpacing: 1, fontFamily: 'inherit',
};

const WEEKDAYS = [
  { key: 'sun', label: 'DOM' }, { key: 'mon', label: 'SEG' },
  { key: 'tue', label: 'TER' }, { key: 'wed', label: 'QUA' },
  { key: 'thu', label: 'QUI' }, { key: 'fri', label: 'SEX' },
  { key: 'sat', label: 'SÁB' },
];

const MONTHS_LIST = [
  { key: 'jan', label: 'JAN' }, { key: 'feb', label: 'FEV' },
  { key: 'mar', label: 'MAR' }, { key: 'apr', label: 'ABR' },
  { key: 'may', label: 'MAI' }, { key: 'jun', label: 'JUN' },
  { key: 'jul', label: 'JUL' }, { key: 'aug', label: 'AGO' },
  { key: 'sep', label: 'SET' }, { key: 'oct', label: 'OUT' },
  { key: 'nov', label: 'NOV' }, { key: 'dec', label: 'DEZ' },
];

const DayCheckbox = memo(function DayCheckbox({ id, label, checked, accent, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(id, e.target.checked)}
        style={{ accentColor: accent || 'var(--neon)', margin: 0 }}
      />
      <span style={{ fontSize: 8, letterSpacing: 0.5, color: checked ? (accent || 'var(--neon)') : '#555' }}>
        {label}
      </span>
    </label>
  );
});

const WeekdayPicker = memo(function WeekdayPicker({ selected, onChange }) {
  const toggle = (key, checked) =>
    onChange(checked ? [...selected, key] : selected.filter((k) => k !== key));
  const allSelected = WEEKDAYS.every((d) => selected.includes(d.key));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={SECTION_HDR}>▌ DIAS DA SEMANA</div>
        <button
          style={{ ...MINI_BTN, color: allSelected ? '#ff5050' : 'var(--neon)' }}
          onClick={() => onChange(allSelected ? [] : WEEKDAYS.map((d) => d.key))}
        >
          {allSelected ? 'LIMPAR' : 'TODOS'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        {WEEKDAYS.map((d) => (
          <DayCheckbox
            key={d.key} id={d.key} label={d.label}
            checked={selected.includes(d.key)}
            accent={d.key === 'sun' || d.key === 'sat' ? '#ff8c00' : 'var(--neon)'}
            onChange={toggle}
          />
        ))}
      </div>
      <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 4 }}>
        → <code style={{ color: '#a7ffba' }}>{formatDayRange(selected, WEEKDAY_ORDER)}</code>
      </div>
    </div>
  );
});

const MonthPicker = memo(function MonthPicker({ selected, onChange }) {
  const toggle = (key, checked) =>
    onChange(checked ? [...selected, key] : selected.filter((k) => k !== key));
  const allSelected = MONTHS_LIST.every((m) => selected.includes(m.key));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={SECTION_HDR}>▌ MESES</div>
        <button
          style={{ ...MINI_BTN, color: allSelected ? '#ff5050' : 'var(--neon)' }}
          onClick={() => onChange(allSelected ? [] : MONTHS_LIST.map((m) => m.key))}
        >
          {allSelected ? 'LIMPAR' : 'TODOS'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {MONTHS_LIST.map((m) => (
          <DayCheckbox
            key={m.key} id={m.key} label={m.label}
            checked={selected.includes(m.key)}
            onChange={toggle}
          />
        ))}
      </div>
      <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 4 }}>
        → <code style={{ color: '#a7ffba' }}>{formatDayRange(selected, MONTH_ORDER)}</code>
      </div>
    </div>
  );
});

// ─── MenuPropertiesPanel ─────────────────────────────────────────────────────
// Extraído do PropertiesPanel para que useRef seja chamado incondicionalmente
// (Rules of Hooks — não pode ficar dentro de IIFE condicional).

const MenuPropertiesPanel = memo(function MenuPropertiesPanel({ d, set, fl, onAudioFilesChange }) {
  // dragRef DEVE ficar aqui (nível do componente), nunca dentro de condicional
  const dragRef = useRef(null);

  const audioFiles = Array.isArray(d.audioFiles) && d.audioFiles.length > 0
    ? d.audioFiles
    : [d.greeting || '1-bem-vindo'];

  // onAudioFilesChange faz uma única chamada atômica a updateNodeData,
  // evitando o bug de stale closure que ocorre ao chamar set() duas vezes
  // em sequência (a segunda sobrescrevia a primeira com os dados antigos).
  const setAudioFiles = onAudioFilesChange ?? ((newFiles) => {
    set('audioFiles', newFiles);
    set('greeting', newFiles[0] || '');
  });

  const handleAudioDragStart = (e, idx) => {
    dragRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleAudioDrop = (e, idx) => {
    e.preventDefault();
    const from = dragRef.current;
    if (from == null || from === idx) return;
    const arr = [...audioFiles];
    const [item] = arr.splice(from, 1);
    arr.splice(idx, 0, item);
    setAudioFiles(arr);
    dragRef.current = null;
  };

  return (
    <>
      <Field d={d} set={set} label={fl('Contexto Asterisk', 'contextName')} k="contextName" placeholder="orpen-ivr-home" />
      <Field d={d} set={set} label={fl('WaitExten (seg)', 'waitExten')} k="waitExten" type="number" />

      {/* ── Áudios do menu (Background em sequência) ── */}
      <div style={{ margin: '14px 0 6px', fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1 }}>
        ▌ÁUDIOS DO MENU (em sequência)
      </div>
      {audioFiles.map((fname, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={(e) => handleAudioDragStart(e, idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleAudioDrop(e, idx)}
          style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center', cursor: 'grab' }}
        >
          <span style={{ fontSize: 12, color: 'var(--neon-dim)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>
          <span style={{ fontSize: 10, color: 'var(--neon-dim)', width: 14, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
          <input
            className="term-input"
            style={{ flex: 1 }}
            value={fname}
            placeholder="nome-do-audio"
            onChange={(e) => {
              const arr = [...audioFiles];
              arr[idx] = e.target.value;
              setAudioFiles(arr);
            }}
          />
          <button
            type="button"
            className="btn-neon btn-danger"
            style={{ padding: '3px 7px', flexShrink: 0 }}
            aria-label={`Remover áudio ${idx + 1}`}
            onClick={() => setAudioFiles(audioFiles.filter((_, i) => i !== idx))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-neon"
        style={{ width: '100%', padding: '4px 8px', marginTop: 2, marginBottom: 8 }}
        onClick={() => setAudioFiles([...audioFiles, ''])}
      >
        + adicionar áudio
      </button>

      {/* ── Dígitos DTMF ── */}
      <div style={{ margin: '14px 0 6px', fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1 }}>
        ▌DÍGITOS (DTMF)
      </div>
      {(d.digits || []).map((dig, idx) => {
        const hasActions = Array.isArray(dig.actions) && dig.actions.length > 0;
        return (
          <div key={dig.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="term-input" style={{ width: 46, textAlign: 'center' }}
                value={dig.id}
                onChange={(e) => {
                  const nd = [...d.digits];
                  nd[idx] = { ...dig, id: e.target.value };
                  set('digits', nd);
                }}
              />
              <input className="term-input" style={{ flex: 1 }}
                value={dig.label}
                onChange={(e) => {
                  const nd = [...d.digits];
                  nd[idx] = { ...dig, label: e.target.value };
                  set('digits', nd);
                }}
              />
              <button type="button" className="btn-neon btn-danger" style={{ padding: '4px 8px' }}
                aria-label={`Remover dígito ${dig.id}`}
                onClick={() => set('digits', d.digits.filter((_, i) => i !== idx))}>
                ×
              </button>
            </div>
            {hasActions && (
              <div style={{ marginTop: 4, paddingLeft: 52, fontSize: 9, color: 'var(--neon-dim)', lineHeight: 1.7 }}>
                {dig.actions.map((a, ai) => (
                  <div key={ai} style={{ display: 'flex', gap: 4 }}>
                    <span style={{ color: 'var(--neon)' }}>{ai + 1}.</span>
                    <span style={{ color: '#fff' }}>{a.type}</span>
                    <span style={{ opacity: 0.6 }}>
                      {Object.values(a.data || {}).filter(Boolean).join(' ').slice(0, 40)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn-neon" style={{ width: '100%', padding: '4px 8px', marginTop: 4 }}
        onClick={() => set('digits', [...(d.digits || []), {
          id: String((d.digits || []).length + 1),
          label: 'Nova opção',
          comment: null,
          actions: [],
          finalDestination: null,
        }])}>
        + ADICIONAR DÍGITO
      </button>

      <div style={{ margin: '14px 0 6px', fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1 }}>
        ▌FALLBACK (i / t)
      </div>
      <Field d={d} set={set} label="Nome macro invalid"      k="invalidMacroName" placeholder="ex: menu-invalid-sac-2502" />
      <Field d={d} set={set} label="Nome macro timeout"      k="timeoutMacroName" placeholder="ex: menu-timeout-sac-2502" />
      <Field d={d} set={set} label="Macro Invalid (legado)"  k="invalidMacro"     placeholder="macro-menu-invalid-orpen-home" />
      <Field d={d} set={set} label="Macro Timeout (legado)"  k="timeoutMacro"     placeholder="macro-menu-timeout-orpen-home" />
      <Field d={d} set={set} label="Áudio invalid"           k="invalidSound" />
      <Field d={d} set={set} label="Max tentativas"          k="maxRetry"  type="number" />
      <Field d={d} set={set} label="Goto após retry"         k="retryGoto" />
    </>
  );
});

// ─── Painel principal ─────────────────────────────────────────────────────────

export default function PropertiesPanel({ node, updateNodeData, deleteNode, toggleComment, patchNodeStyle, syncTrueContext, propagateContextRename, nodes = [], onContextNavigate }) {
  // Armazena o nome do contexto no momento do foco (para detectar rename via painel)
  const ctxNameOnFocus = useRef('');
  const [ctxNameDup, setCtxNameDup] = useState(false);
  const mode = useModeContext();
  const panelStyle = {
    width: 320, height: '100%',
    background: 'var(--panel)',
    borderLeft: '1px solid var(--line)',
    padding: '14px 12px',
    overflow: 'auto',
    boxSizing: 'border-box',
  };

  if (!node) {
    return (
      <aside style={{ ...panelStyle, padding: '14px 12px 12px' }}>
        <ContextNavPanel nodes={nodes} onNavigate={onContextNavigate} />
      </aside>
    );
  }

  const d = node.data;
  const set = (key, val) => updateNodeData(node.id, { ...d, [key]: val });

  /** Retorna o label amigável do campo se estiver no modo AMIGÁVEL. */
  const fl = (defaultLabel, fieldKey) => getFieldLabel(node.type, fieldKey, defaultLabel, mode);

  return (
    <aside style={panelStyle}>
      <div style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 1, marginBottom: 6 }}>
        ▌PROPRIEDADES
      </div>
      <div style={{ fontSize: 13, color: '#fff', letterSpacing: 1, marginBottom: mode === 'amigavel' ? 8 : 12, textTransform: 'uppercase' }}>
        {mode === 'amigavel'
          ? `◆ ${getNodeLabel(node.type, 'amigavel')}`
          : (
            <>
              {node.type === 'context' && '◆ Contexto (Container)'}
              {node.type === 'config'  && '◆ Config / Start'}
              {node.type === 'menu'    && '◆ Menu DTMF'}
              {node.type === 'time'    && '◆ Condição de Tempo'}
              {node.type === 'route'   && '◆ Destino / Roteamento'}
              {ACTION_META[node.type]  && '◆ ' + ACTION_META[node.type].title}
            </>
          )
        }
      </div>

      {/* ── Card de ajuda (apenas modo AMIGÁVEL) ─────────────────────────── */}
      {mode === 'amigavel' && NODE_MODE_CONFIG[node.type] && (() => {
        const cfg = NODE_MODE_CONFIG[node.type];
        return (
          <div style={{
            border: '1px dashed var(--neon)',
            borderRadius: 3,
            padding: '10px 12px',
            marginBottom: 14,
            background: 'var(--neon-glow-bg)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--node-description-color)', marginBottom: 6, letterSpacing: 0.5, lineHeight: 1.5 }}>
              {cfg.desc}
            </div>
            {cfg.dica && (
              <div style={{ fontSize: 10, color: 'var(--panel-hint-color)', fontStyle: 'italic', lineHeight: 1.5, borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 4 }}>
                💡 {cfg.dica}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── CONTEXT ── */}
      {node.type === 'context' && (
        <>
          {/* contextName com propagação de rename silenciosa no onBlur */}
          <div style={{ marginBottom: ctxNameDup ? 4 : 10 }}>
            <label className="term-label">Nome do Contexto Asterisk</label>
            <input
              className="term-input"
              value={d.contextName || ''}
              placeholder="orpen-ivr-exemplo"
              onFocus={() => {
                ctxNameOnFocus.current = d.contextName || '';
                setCtxNameDup(false);
              }}
              onChange={(e) => {
                const v = e.target.value;
                set('contextName', v);
                setCtxNameDup(isContextNameDuplicate(v, nodes, node.id));
              }}
              onBlur={(e) => {
                const newName = e.target.value || '';
                if (!ctxNameDup && propagateContextRename && ctxNameOnFocus.current !== newName) {
                  propagateContextRename(ctxNameOnFocus.current, newName);
                }
              }}
              style={ctxNameDup ? { borderColor: '#ff4444', color: '#ff4444' } : undefined}
            />
            {ctxNameDup && (
              <div style={{ fontSize: 9, color: '#ff4444', letterSpacing: 0.5, marginTop: 3, marginBottom: 6 }}>
                // nome já existe — escolha outro
              </div>
            )}
          </div>
          <Field d={d} set={set} label="Ordem de exportação" k="order" type="number" placeholder="ex: 1, 2, 3..." />
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: -6, marginBottom: 10, lineHeight: 1.5 }}>
            Opcional. Contextos com este campo preenchido são exportados primeiro (ordem crescente).
            Contextos sem ordem vêm depois, na sequência do traversal.
          </div>
          <div style={{ fontSize: 10, color: 'var(--neon-dim)', marginBottom: 10, lineHeight: 1.5 }}>
            Use o cabeçalho do nó também para renomear. O nome aparecerá entre colchetes no{' '}
            <code style={{ color: '#fff' }}>.conf</code>:
            <code style={{ color: '#fff', display: 'block', marginTop: 4 }}>
              [{node.data.contextName || '...'}]
            </code>
          </div>
          <div style={{ fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1, margin: '10px 0 6px' }}>
            ▌DIMENSÕES
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="term-label">largura</label>
              <input className="term-input" type="number"
                value={(node.style && node.style.width) || 480}
                onChange={(e) => patchNodeStyle && patchNodeStyle(node.id, { width: Number(e.target.value) || 260 })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="term-label">altura</label>
              <input className="term-input" type="number"
                value={(node.style && node.style.height) || 320}
                onChange={(e) => patchNodeStyle && patchNodeStyle(node.id, { height: Number(e.target.value) || 180 })}
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#ffcc00', marginTop: 10, lineHeight: 1.5 }}>
            ⓘ Você também pode arrastar a borda inferior-direita do container para redimensionar.
          </div>
        </>
      )}

      {/* ── CONFIG ── */}
      {node.type === 'config' && (
        <>
          <Field d={d} set={set} label={fl('__IVR (número do IVR)', 'ivr')} k="ivr" placeholder="0000" />
          <Field d={d} set={set} label={fl('SOUND_PATH', 'soundPath')} k="soundPath" />
          <Field d={d} set={set} label={fl('AGI_PATH', 'agiPath')} k="agiPath" />
          <Field d={d} set={set} label={fl('Language (CHANNEL)', 'language')} k="language" />
          <Field d={d} set={set} label={fl('Comentário (Noop)', 'comment')} k="comment" />
          <Toggle d={d} set={set} label={fl('Set __NUMBER_DIALED', 'numberDialed')} k="numberDialed" />
          <Toggle d={d} set={set} label={fl('Macro(logIvr, ENTER_IVR)', 'logIvr')} k="logIvr" />
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 6, border: '1px dashed var(--line)', padding: 8, borderRadius: 3, lineHeight: 1.6 }}>
            Para emitir <code style={{ color: '#fff' }}>Agi(customerDataInboundCall_v4.php,...)</code>,
            adicione um nó <span style={{ color: '#a78bfa' }}>AGI</span> explícito no canvas após este nó.
          </div>
        </>
      )}

      {/* ── MENU ── */}
      {node.type === 'menu' && (
        <MenuPropertiesPanel
          d={d}
          set={set}
          fl={fl}
          onAudioFilesChange={(newFiles) =>
            updateNodeData(node.id, { ...d, audioFiles: newFiles, greeting: newFiles[0] || '' })
          }
        />
      )}

      {/* ── TIME ── */}
      {node.type === 'time' && (() => {
        const weekdays = Array.isArray(d.weekdays) ? d.weekdays : [];
        const months   = Array.isArray(d.months)   ? d.months   : [];
        const maxDay   = getMaxDay(months);
        const monthLabel = months.includes('feb') && !months.some((m) => !['feb'].includes(m))
          ? 'fevereiro selecionado → max 29'
          : months.some((m) => ['apr','jun','sep','nov'].includes(m)) && !months.some((m) => ['jan','mar','may','jul','aug','oct','dec'].includes(m))
          ? 'mês de 30 dias selecionado'
          : null;

        return (
          <>
            {/* Horários */}
            <div style={{ marginBottom: 14 }}>
              <div style={SECTION_HDR}>▌ HORÁRIO (vazio em ambos = *)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="term-label">INÍCIO</label>
                  <input
                    type="time"
                    className="term-input"
                    value={d.timeStart || ''}
                    onChange={(e) => set('timeStart', e.target.value)}
                  />
                </div>
                <span style={{ color: 'var(--neon-dim)', paddingBottom: 8, fontSize: 14 }}>—</span>
                <div style={{ flex: 1 }}>
                  <label className="term-label">FIM (max 23:59)</label>
                  <input
                    type="time"
                    className="term-input"
                    max="23:59"
                    value={d.timeEnd || ''}
                    onChange={(e) => set('timeEnd', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Dias da semana */}
            <WeekdayPicker
              selected={weekdays}
              onChange={(v) => set('weekdays', v)}
            />

            {/* Meses */}
            <MonthPicker
              selected={months}
              onChange={(v) => {
                // Clamp mday se necessário ao mudar meses
                const newMax = getMaxDay(v);
                if (d.mday && Number(d.mday) > newMax) set('mday', newMax);
                set('months', v);
              }}
            />

            {/* Dia do mês */}
            <div style={{ marginBottom: 14 }}>
              <div style={SECTION_HDR}>▌ DIA DO MÊS (vazio = *)</div>
              <input
                type="number"
                className="term-input"
                min={1}
                max={maxDay}
                value={d.mday ?? ''}
                placeholder={`1 – ${maxDay}`}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { set('mday', ''); return; }
                  set('mday', Math.min(Math.max(1, Number(raw)), maxDay));
                }}
              />
              {monthLabel && (
                <div style={{ fontSize: 9, color: '#ffcc00', marginTop: 4 }}>
                  ⚠ {monthLabel}
                </div>
              )}
            </div>

            {/* Destino quando condição é VERDADEIRA */}
            <div style={{ marginBottom: 10 }}>
              <div style={SECTION_HDR}>▌ DESTINO SE VERDADEIRO</div>
              <input
                className="term-input"
                value={d.trueContext || ''}
                placeholder="ex: orpen-ivr-fora-horario"
                onChange={(e) => set('trueContext', e.target.value.replace(/\s+/g, ''))}
                onBlur={(e) => syncTrueContext && syncTrueContext(node.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    syncTrueContext && syncTrueContext(node.id, e.target.value);
                  }
                }}
              />
              <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 4, lineHeight: 1.5 }}>
                Contexto para onde o fluxo vai quando a condição <span style={{ color: '#ffcc00' }}>BATER</span>.<br />
                Quando <span style={{ color: 'var(--neon)' }}>NÃO bater</span>, segue pelo handle de saída ↓.
              </div>
              {!d.trueContext && (
                <div style={{ fontSize: 9, color: '#ff5050', marginTop: 4 }}>
                  ⚠ Campo obrigatório — linha será omitida do .conf se vazio.
                </div>
              )}
            </div>

            {/* Extensão e prioridade do destino (para destinos não-padrão como fila) */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label className="term-label">Extensão destino</label>
                <input
                  className="term-input"
                  value={d.trueExtension || ''}
                  placeholder="s"
                  onChange={(e) => set('trueExtension', e.target.value.trim())}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="term-label">Prioridade destino</label>
                <input
                  className="term-input"
                  value={d.truePriority || ''}
                  placeholder="1"
                  onChange={(e) => set('truePriority', e.target.value.trim())}
                />
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: -10, marginBottom: 14, lineHeight: 1.5 }}>
              Deixe em branco para usar os padrões <code>s,1</code>.<br />
              Use quando o destino é uma fila, ex: <code>rcx-queue,7310,1</code>.
            </div>

            <Field d={d} set={set} label="Label / descrição" k="label" />

            {/* Preview do Asterisk */}
            <div style={{
              marginTop: 6, padding: 8,
              border: '1px dashed var(--line)', borderRadius: 3,
              fontSize: 9,
            }}>
              <div style={{ color: 'var(--neon)', marginBottom: 4, letterSpacing: 1 }}>
                // PREVIEW ASTERISK
              </div>
              {d.trueContext ? (
                <code style={{ color: '#a7ffba', wordBreak: 'break-all' }}>
                  GotoIfTime({buildTimeExport(d)}?{d.trueContext},{d.trueExtension || 's'},{d.truePriority || '1'})
                </code>
              ) : (
                <span style={{ color: '#ff5050', fontStyle: 'italic' }}>
                  ;; ⚠ linha omitida — "Destino se verdadeiro" vazio
                </span>
              )}
            </div>
          </>
        );
      })()}

      {/* ── ROUTE ── */}
      {node.type === 'route' && (() => {
        const mode = d.routeMode || 'macro';
        const modeColor = mode === 'contexto' ? '#00d4ff' : mode === 'fila' ? '#ff8c00' : '#a78bfa';
        return (
          <>
            <Field d={d} set={set} label="Modo de Roteamento" k="routeMode"
              options={['macro', 'fila', 'contexto']} />

            {mode === 'contexto' && (
              <>
                <Field d={d} set={set} label="Contexto de Destino" k="context"   placeholder="orpen-ivr-home" />
                <Field d={d} set={set} label="Extensão"            k="extension" placeholder="s" />
                <Field d={d} set={set} label="Prioridade"          k="priority"  placeholder="1" />
                <div style={{ fontSize: 9, color: '#00d4ff', marginTop: 6, border: '1px dashed #00d4ff33', padding: 6, borderRadius: 3 }}>
                  <code>Goto({d.context || '...'},{d.extension || 's'},{d.priority || '1'})</code>
                </div>
              </>
            )}

            {mode === 'fila' && (
              <>
                <Field d={d} set={set} label="Número / Nome da Fila" k="queue"        placeholder="7000" />
                <Field d={d} set={set} label="Opções (ex: t)"        k="queueOptions" placeholder="t" />
                <div style={{ fontSize: 9, color: '#ff8c00', marginTop: 6, border: '1px dashed #ff8c0033', padding: 6, borderRadius: 3 }}>
                  <code>Queue({d.queue || '...'}{d.queueOptions ? ',' + d.queueOptions : ''})</code>
                </div>
              </>
            )}

            {mode === 'macro' && (
              <>
                <Field d={d} set={set} label="Número / Nome da Fila" k="queue" placeholder="7000" />
                <div style={{ fontSize: 9, color: '#a78bfa', marginTop: 6, border: '1px dashed #a78bfa33', padding: 8, borderRadius: 3, lineHeight: 1.7 }}>
                  <div style={{ color: 'var(--neon-dim)', marginBottom: 4 }}>// MACRO PADRÃO ORPEN</div>
                  <code>Set(DESTINY_TRANFER={d.queue || '...'})</code><br />
                  <code>Set(TYPE_TRANSFER=QUEUE)</code><br />
                  <code>Goto(orpen-ivr-transfer,s,1)</code>
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* ── LABEL (compartilhado por todos os nós que suportam label) ─────── */}
      {ACTION_META[node.type]?.supportsLabel && (() => {
        const labelVal = (d.label || '').trim();
        const isValidFmt = !labelVal || /^[a-z0-9-]+$/.test(labelVal);

        // Verifica duplicatas no mesmo ContextNode pai
        const isDuplicate = labelVal && nodes.some(
          (n) => n.id !== node.id &&
                 n.parentNode === node.parentNode &&
                 ACTION_META[n.type]?.supportsLabel &&
                 (n.data.label || '').trim() === labelVal
        );

        const borderColor = !isValidFmt ? '#ff5050' : isDuplicate ? '#ff8c00' : undefined;
        const errorMsg = !isValidFmt
          ? 'label inválido — use apenas letras minúsculas, números e hífen'
          : isDuplicate ? 'label duplicado neste contexto' : null;

        return (
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px dashed var(--line)' }}>
            <label className="term-label">Label (opcional)</label>
            <input
              className="term-input"
              value={d.label || ''}
              placeholder="ex: menu"
              style={{ borderColor: borderColor || undefined }}
              onChange={(e) => {
                // Normaliza automaticamente: minúsculas, apenas letras/números/hífen
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                set('label', v);
              }}
            />
            {errorMsg && (
              <div style={{ fontSize: 9, color: borderColor, marginTop: 3 }}>⚠ {errorMsg}</div>
            )}
            {!errorMsg && labelVal && (
              <div style={{ fontSize: 9, color: '#ffcc00', marginTop: 3, fontFamily: 'inherit' }}>
                Gera: <code style={{ color: '#ffcc00' }}>exten =&gt; s,n({labelVal}),Cmd()</code>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── NÓS DE AÇÃO AVANÇADOS ── */}
      {node.type === 'gosub' && (
        <>
          <Field d={d} set={set} label="Contexto"   k="context"   placeholder="sub-rotina" />
          <Field d={d} set={set} label="Extensão"   k="extension" placeholder="s" />
          <Field d={d} set={set} label="Prioridade" k="priority"  placeholder="1" />
        </>
      )}
      {node.type === 'return' && (
        <Field d={d} set={set} label="Valor de Retorno (opcional)" k="value" placeholder="0" />
      )}
      {node.type === 'hangup' && (
        <Field d={d} set={set} label="Código de Causa SIP (opcional)" k="causeCode" placeholder="17 = busy / 21 = rejected" />
      )}
      {node.type === 'gotoif' && (() => {
        const errs = ACTION_META.gotoif?.validate ? ACTION_META.gotoif.validate(d) : [];

        // Autocomplete: coleta todos os labels do canvas por contexto
        const labelSuggestions = nodes
          .filter((n) => ACTION_META[n.type]?.supportsLabel && (n.data.label || '').trim())
          .map((n) => {
            const ctxNode = nodes.find((c) => c.type === 'context' && c.id === n.parentNode);
            return ctxNode ? `${ctxNode.data.contextName},s,${n.data.label.trim()}` : null;
          })
          .filter(Boolean);

        return (
          <>
            <div style={{ marginBottom: 10 }}>
              <label className="term-label">Expressão Lógica (sem $[ ])</label>
              <input className="term-input" value={d.expression || ''} placeholder='"${VAR}"="1"'
                style={{ borderColor: errs.length ? '#ff5050' : undefined }}
                onChange={(e) => set('expression', e.target.value)} />
              {errs.length > 0 && <div style={{ fontSize: 9, color: '#ff5050', marginTop: 3 }}>⚠ {errs[0]}</div>}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label className="term-label">Destino Verdadeiro (ctx,ext,label)</label>
              <input
                className="term-input"
                list={`gotoif-true-${node.id}`}
                value={d.trueDestination || ''}
                placeholder="orpen-ivr-home,s,menu"
                onChange={(e) => set('trueDestination', e.target.value)}
              />
              <datalist id={`gotoif-true-${node.id}`}>
                {labelSuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label className="term-label">Destino Falso (ctx,ext,label)</label>
              <input
                className="term-input"
                list={`gotoif-false-${node.id}`}
                value={d.falseDestination || ''}
                placeholder="orpen-ivr-home,s,reentrada"
                onChange={(e) => set('falseDestination', e.target.value)}
              />
              <datalist id={`gotoif-false-${node.id}`}>
                {labelSuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div style={{ fontSize: 9, color: '#00d4ff', marginTop: 6, lineHeight: 1.5, border: '1px dashed #00d4ff33', padding: 6, borderRadius: 3 }}>
              Destinos vazios são válidos (fall-through no Asterisk).<br />
              <code style={{ color: '#fff' }}>GotoIf($[expr]?{d.trueDestination || '...'}:{d.falseDestination || '...'})</code>
              {labelSuggestions.length > 0 && (
                <div style={{ marginTop: 4, color: '#ffcc00' }}>
                  ⌨ Labels disponíveis: {labelSuggestions.join(' · ')}
                </div>
              )}
            </div>
          </>
        );
      })()}
      {node.type === 'set' && (() => {
        const errs = ACTION_META.set?.validate ? ACTION_META.set.validate(d) : [];
        return (
          <>
            <div style={{ marginBottom: 10 }}>
              <label className="term-label">Atribuição (VARIAVEL=valor)</label>
              <input className="term-input" value={d.assignment || ''}
                placeholder="__IVR=0000 ou CALLID=${CALLERID(num)}"
                style={{ borderColor: errs.length ? '#ff5050' : undefined }}
                onChange={(e) => set('assignment', e.target.value)} />
              {errs.length > 0 && <div style={{ fontSize: 9, color: '#ff5050', marginTop: 3 }}>⚠ {errs[0]}</div>}
            </div>
            <div style={{ fontSize: 9, color: '#a78bfa', lineHeight: 1.6, border: '1px dashed #a78bfa33', padding: 6, borderRadius: 3 }}>
              Prefixo <code>__</code> para variável herdável (channel inheritance).<br />
              <code style={{ color: '#fff' }}>Set({d.assignment || 'VAR=valor'})</code>
            </div>
          </>
        );
      })()}
      {node.type === 'agi' && (() => {
        const params = Array.isArray(d.params) ? d.params : [];
        return (
          <>
            <Field d={d} set={set} label="Script AGI" k="script" placeholder="meuScript.php" />
            <div style={{ margin: '10px 0 6px', fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1 }}>
              ▌ PARÂMETROS VARIÁDICOS
            </div>
            {params.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="term-input" style={{ flex: 1 }} value={p}
                  placeholder={`parâmetro ${idx + 1}`}
                  onChange={(e) => { const ps = [...params]; ps[idx] = e.target.value; set('params', ps); }} />
                <button className="btn-neon btn-danger" style={{ padding: '4px 8px' }}
                  onClick={() => set('params', params.filter((_, i) => i !== idx))}>×</button>
              </div>
            ))}
            <button className="btn-neon" style={{ width: '100%', padding: '4px 8px', marginTop: 4 }}
              onClick={() => set('params', [...params, ''])}>+ PARÂMETRO</button>
            <div style={{ fontSize: 9, color: '#a78bfa', marginTop: 6 }}>
              <code>Agi({'${AGI_PATH}/'}{d.script || 'script'}{params.length ? ',' + params.join(',') : ''})</code>
            </div>
          </>
        );
      })()}
      {node.type === 'macro' && (() => {
        const params = Array.isArray(d.params) ? d.params : [];
        return (
          <>
            <Field d={d} set={set} label="Nome da Macro" k="name" placeholder="minha-macro" />
            <div style={{ margin: '10px 0 6px', fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1 }}>
              ▌ PARÂMETROS VARIÁDICOS
            </div>
            {params.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="term-input" style={{ flex: 1 }} value={p}
                  placeholder={`parâmetro ${idx + 1}`}
                  onChange={(e) => { const ps = [...params]; ps[idx] = e.target.value; set('params', ps); }} />
                <button className="btn-neon btn-danger" style={{ padding: '4px 8px' }}
                  onClick={() => set('params', params.filter((_, i) => i !== idx))}>×</button>
              </div>
            ))}
            <button className="btn-neon" style={{ width: '100%', padding: '4px 8px', marginTop: 4 }}
              onClick={() => set('params', [...params, ''])}>+ PARÂMETRO</button>
          </>
        );
      })()}
      {node.type === 'execif' && (
        <>
          <Field d={d} set={set} label='Expressão Lógica (sem $[ ])' k="expression" placeholder='"${VAR}"="1"' />
          <Field d={d} set={set} label="Aplicação se VERDADEIRO"     k="action"     placeholder="Playback(${SOUND_PATH}/saudacao)" />
          <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 6, lineHeight: 1.5 }}>
            Será exportado:<br />
            <code style={{ color: '#fff' }}>ExecIf($[expressão]?aplicação)</code>
          </div>
        </>
      )}
      {node.type === 'execiftime' && (
        <>
          <Field d={d} set={set} label="Horas (ex: 08:00-18:00)"       k="hours" />
          <Field d={d} set={set} label="Dias da semana (ex: mon-fri)"  k="days" />
          <Field d={d} set={set} label="Dias do mês"                   k="monthdays" placeholder="*" />
          <Field d={d} set={set} label="Meses"                         k="months"    placeholder="*" />
          <Field d={d} set={set} label="Aplicação"                     k="action"    placeholder="Goto(orpen-ivr-home,s,1)" />
          <div style={{ fontSize: 9, color: '#a78bfa', marginTop: 6, border: '1px dashed #a78bfa33', padding: 6, borderRadius: 3, lineHeight: 1.5 }}>
            <code>ExecIfTime({d.hours || '*'},{d.days || '*'},{d.monthdays || '*'},{d.months || '*'}?{d.action || 'App()'})</code>
          </div>
        </>
      )}
      {node.type === 'include' && (
        <>
          <Field d={d} set={set} label="Contexto incluído" k="contextName" placeholder="hangup-ivr" />
          <div style={{ fontSize: 9, color: '#00d4ff', marginTop: 6, border: '1px dashed #00d4ff33', padding: 6, borderRadius: 3 }}>
            <code>include =&gt; {d.contextName || '...'}</code>
          </div>
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 6, lineHeight: 1.5 }}>
            Diretiva de contexto Asterisk — inclui outro contexto.<br />
            Emitida <strong>sem</strong> prefixo <code>exten =&gt; s,n,</code>, sempre ao final do bloco.
          </div>
        </>
      )}
      {node.type === 'sipaddheader' && (
        <>
          <Field d={d} set={set} label="Nome do Header SIP"  k="headerName" placeholder="X-CPF" />
          <Field d={d} set={set} label="Valor (suporta vars)" k="value"      placeholder="${CPF_USER}" />
          <div style={{ fontSize: 9, color: '#00d4ff', marginTop: 6, border: '1px dashed #00d4ff33', padding: 6, borderRadius: 3 }}>
            <code>SIPAddHeader({d.headerName || 'X-Header'}: {d.value || '${VAR}'})</code>
          </div>
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 6, lineHeight: 1.5 }}>
            Adiciona header SIP customizado à chamada atual.<br />
            Exemplo: <code>SIPAddHeader(X-CPF: {'${CPF_USER}'})</code>
          </div>
        </>
      )}
      {node.type === 'noop' && (
        <Field d={d} set={set} label="Texto de Debug" k="text" placeholder="## DEBUG ##" />
      )}
      {node.type === 'verbose' && (
        <>
          <Field d={d} set={set} label="Nível (1-5)" k="level"   type="number" />
          <Field d={d} set={set} label="Mensagem"    k="message" placeholder="Entrando na URA principal" />
        </>
      )}
      {node.type === 'read' && (
        <>
          <Field d={d} set={set} label="Nome da Variável (destino)" k="variable"  placeholder="CPF" />
          <Field d={d} set={set} label="Arquivo de Áudio (prompt)"  k="audio"     placeholder="digite-cpf" />
          <Field d={d} set={set} label="Máximo de Dígitos"          k="maxDigits" type="number" />
          <Field d={d} set={set} label="Timeout (segundos)"         k="timeout"   type="number" />
          <div style={{ fontSize: 10, color: '#ffcc00', marginTop: 6, lineHeight: 1.5, border: '1px dashed #ffcc0055', padding: 6, borderRadius: 3 }}>
            Será exportado:<br />
            <code style={{ color: '#fff' }}>{'Read(VAR,${SOUND_PATH}/audio,max,,timeout)'}</code>
          </div>
        </>
      )}
      {node.type === 'saydigits' && (
        <Field d={d} set={set} label="Dígitos ou Variável" k="value" placeholder="${CPF}" />
      )}
      {node.type === 'saynumber' && (
        <>
          <Field d={d} set={set} label="Número ou Variável" k="value"  placeholder="${SALDO}" />
          <Field d={d} set={set} label="Gênero"             k="gender" options={['', 'm', 'f']} />
        </>
      )}
      {node.type === 'mixmonitor' && (
        <>
          <Field d={d} set={set} label="Nome do Arquivo (sem extensão)" k="filename"  placeholder="${UNIQUEID}-${CALLERID(num)}" />
          <Field d={d} set={set} label="Extensão"                       k="extension" options={['wav', 'wav49', 'gsm', 'ulaw', 'alaw']} />
        </>
      )}
      {node.type === 'stopmonitor' && (
        <div style={{ fontSize: 11, color: '#aaa', border: '1px dashed var(--line)', padding: 10, borderRadius: 3 }}>
          Este nó não possui parâmetros. Gera apenas: <code style={{ color: '#fff' }}>StopMonitor()</code>
        </div>
      )}
      {node.type === 'chanspy' && (
        <>
          <Field d={d} set={set} label="Ramal/Canal Alvo" k="target"  placeholder="2001" />
          <Field d={d} set={set} label="Opções"           k="options" placeholder="qw (sussurro) · b (barge) · g(grp)" />
          <div style={{ fontSize: 10, color: '#ff8c00', marginTop: 6, lineHeight: 1.5 }}>
            Atalhos comuns: <b>q</b> quieto · <b>w</b> sussurro · <b>b</b> barge · <b>x</b> exitexten
          </div>
        </>
      )}
      {node.type === 'answer' && (
        <div style={{ fontSize: 11, color: '#aaa', border: '1px dashed var(--line)', padding: 10, borderRadius: 3 }}>
          Este nó não possui parâmetros. Gera: <code style={{ color: '#fff' }}>Answer()</code>
        </div>
      )}
      {node.type === 'wait' && (
        <Field d={d} set={set} label="Segundos" k="seconds" type="number" />
      )}
      {node.type === 'waitexten' && (
        <>
          <Field d={d} set={set} label="Segundos" k="seconds" type="number" />
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 4 }}>
            Aguarda dígito DTMF. O roteamento é feito pelas extensões existentes no dialplan.
          </div>
        </>
      )}
      {node.type === 'dial' && (() => {
        const errs = ACTION_META.dial?.validate ? ACTION_META.dial.validate(d) : [];
        return (
          <>
            <div style={{ marginBottom: 10 }}>
              <label className="term-label">Destino (Tecnologia/Recurso)</label>
              <input className="term-input" value={d.destination || ''} placeholder="SIP/3885 ou PJSIP/ramal"
                style={{ borderColor: errs.length ? '#ff5050' : undefined }}
                onChange={(e) => set('destination', e.target.value.replace(/\s/g, ''))} />
              {errs.length > 0 && <div style={{ fontSize: 9, color: '#ff5050', marginTop: 3 }}>⚠ {errs[0]}</div>}
            </div>
            <Field d={d} set={set} label="Timeout (seg, opcional)" k="timeout" type="number" />
            <Field d={d} set={set} label="Opções (opcional)"        k="options" placeholder="Tg" />
            <div style={{ fontSize: 9, color: '#ff8c00', marginTop: 6, border: '1px dashed #ff8c0033', padding: 6, borderRadius: 3 }}>
              <code>Dial({d.destination || '...'}{d.timeout ? ',' + d.timeout : ''}{d.options ? ',' + d.options : ''})</code>
            </div>
          </>
        );
      })()}
      {node.type === 'background' && (
        <>
          <Field d={d} set={set} label="Arquivo de Áudio" k="filename" placeholder="nome-do-audio" />
          <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 6, lineHeight: 1.5, border: '1px dashed var(--line)', padding: 6, borderRadius: 3 }}>
            Aceita DTMF durante reprodução (sem travar o fluxo).<br />
            <code style={{ color: '#a7ffba' }}>Background({'${SOUND_PATH}/'}{d.filename || '...'})</code>
          </div>
        </>
      )}
      {node.type === 'playback' && (
        <>
          <Field d={d} set={set} label="Nome do Arquivo de Áudio" k="filename" placeholder="nome-do-audio" />
          <div style={{
            fontSize: 10, color: 'var(--neon-dim)', marginTop: 6, lineHeight: 1.6,
            border: '1px dashed var(--line)', padding: 8, borderRadius: 3,
          }}>
            <div style={{ color: 'var(--neon)', marginBottom: 4 }}>// COMPORTAMENTO</div>
            <span style={{ color: '#ffcc00' }}>Playback</span> trava a execução até o áudio terminar.
            Use <span style={{ color: '#ffcc00' }}>Background</span> (no nó Menu) se precisar receber dígitos enquanto o áudio toca.
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--neon-dim)' }}>// PREVIEW</div>
              <code style={{ color: '#a7ffba', fontSize: 9 }}>
                {'Playback(${SOUND_PATH}/'}{d.filename || '...'}{')'}
              </code>
            </div>
          </div>
        </>
      )}

      {node.type !== 'config' && node.type !== 'context' && (
        <button
          className="btn-neon"
          style={{
            width: '100%', marginTop: 14,
            borderColor: node.data._commented ? 'var(--neon)' : '#ffcc00',
            color: node.data._commented ? 'var(--neon)' : '#ffcc00',
          }}
          onClick={() => toggleComment(node.id)}
        >
          {node.data._commented ? '▶ ATIVAR NÓ' : '// DESATIVAR NÓ'}
        </button>
      )}

      {node.type !== 'config' && (
        <button className="btn-neon btn-danger" style={{ width: '100%', marginTop: 6 }}
          onClick={() => deleteNode(node.id)}>
          ⌫ EXCLUIR NÓ
        </button>
      )}
    </aside>
  );
}
