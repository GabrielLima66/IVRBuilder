/**
 * ConfigModal — modal centralizado de configurações do Orpen URA Builder.
 *
 * Estética terminal/hacker: fundo #0d0d0d, borda neon, fonte monospace.
 * Alterações são salvas automaticamente via ConfigContext (sem botão "Salvar").
 */

import React, { memo, useCallback } from 'react';
import { useConfig } from '../../contexts/ConfigContext';

// ── Componentes internos ──────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 2, color: 'var(--neon-dim)',
      borderBottom: '1px solid var(--line)',
      paddingBottom: 8, marginBottom: 16, marginTop: 24,
      fontFamily: 'inherit',
    }}>
      ▌ {label}
    </div>
  );
});

/** Toggle neon estilizado — substitui o checkbox nativo */
const NeonToggle = memo(function NeonToggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ position: 'relative', display: 'inline-block', width: 38, height: 20, flexShrink: 0, cursor: 'pointer' }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      {/* Track */}
      <span style={{
        position: 'absolute', inset: 0,
        background: checked ? 'var(--neon-glow-faint)' : '#111',
        border: `1px solid ${checked ? 'var(--neon)' : 'var(--line)'}`,
        borderRadius: 10,
        transition: 'background 0.2s, border-color 0.2s',
        boxShadow: checked ? '0 0 6px var(--neon-glow-soft)' : 'none',
      }} />
      {/* Knob */}
      <span style={{
        position: 'absolute',
        top: 3, left: checked ? 19 : 3,
        width: 12, height: 12,
        background: checked ? 'var(--neon)' : '#444',
        borderRadius: '50%',
        transition: 'left 0.2s, background 0.2s',
        boxShadow: checked ? '0 0 4px var(--neon)' : 'none',
      }} />
    </label>
  );
});

/** Linha de configuração com toggle */
const ToggleRow = memo(function ToggleRow({ configKey, label, hint }) {
  const { [configKey]: value, setConfig } = useConfig();
  const id = `cfg-${configKey}`;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--neon)', letterSpacing: 0.5, lineHeight: 1.4 }}>{label}</div>
        {hint && <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <NeonToggle id={id} checked={!!value} onChange={(v) => setConfig(configKey, v)} />
    </div>
  );
});

/** Linha de configuração com dropdown */
const SelectRow = memo(function SelectRow({ configKey, label, options, hint }) {
  const { [configKey]: value, setConfig } = useConfig();
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <select
        className="term-select"
        value={value}
        onChange={(e) => setConfig(configKey, e.target.value)}
        style={{ width: '100%', fontSize: 11 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
});

/** Linha de configuração com slider */
const SliderRow = memo(function SliderRow({ configKey, label, min, max, step = 1, format, hint }) {
  const { [configKey]: value, setConfig } = useConfig();
  const display = format ? format(value) : value;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5 }}>{label}</label>
        <span style={{ fontSize: 11, color: 'var(--neon)', fontFamily: 'inherit', letterSpacing: 1 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setConfig(configKey, step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        style={{ width: '100%', accentColor: 'var(--neon)', cursor: 'pointer' }}
      />
      {hint && <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
});

/** Linha de configuração com input numérico */
const NumberRow = memo(function NumberRow({ configKey, label, min, max, suffix, hint }) {
  const { [configKey]: value, setConfig } = useConfig();
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= min && v <= max) setConfig(configKey, v);
          }}
          className="term-input"
          style={{ width: 80, fontSize: 11 }}
        />
        {suffix && <span style={{ fontSize: 10, color: 'var(--panel-hint-color)' }}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
});

/** Linha de configuração com input de texto */
const TextRow = memo(function TextRow({ configKey, label, placeholder, hint }) {
  const { [configKey]: value, setConfig } = useConfig();
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setConfig(configKey, e.target.value)}
        className="term-input"
        style={{ width: '100%', fontSize: 11, boxSizing: 'border-box' }}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
});

/** Seletor de tema: Hacking · Orpen · Dark */
const ColorThemeRow = memo(function ColorThemeRow() {
  const { colorTheme, setConfig } = useConfig();

  // Cores de destaque por tema — usadas como borda e texto do botão ativo
  const THEME_ACCENT = { hacking: '#00ff41', orpen: '#c084fc', dark: '#4fc1ff' };

  const THEMES = [
    { key: 'hacking', label: 'HACKING', radius: '2px 0 0 2px', borderRight: 'none' },
    { key: 'orpen',   label: 'ORPEN',   radius: '0',           borderRight: 'none' },
    { key: 'dark',    label: 'DARK',    radius: '0 2px 2px 0', borderRight: undefined },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5, marginBottom: 8 }}>
        Tema de cores
      </div>
      <div style={{ display: 'flex', gap: 0, width: 'fit-content' }}>
        {THEMES.map(({ key, label, radius, borderRight }) => {
          const isActive = colorTheme === key;
          const accent   = THEME_ACCENT[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setConfig('colorTheme', key)}
              style={{
                background:   isActive ? accent : 'transparent',
                border:       `1px solid ${isActive ? accent : 'var(--line)'}`,
                borderRight:  borderRight !== undefined ? borderRight : `1px solid ${isActive ? accent : 'var(--line)'}`,
                color:        isActive ? '#000' : 'var(--neon-dim)',
                opacity:      isActive ? 1 : 0.65,
                fontFamily:   'inherit', fontSize: 10, letterSpacing: 1.5,
                padding:      '4px 14px',
                cursor:       isActive ? 'default' : 'pointer',
                borderRadius: radius,
                fontWeight:   isActive ? 700 : 400,
                transition:   'all 0.15s',
                whiteSpace:   'nowrap',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 5, lineHeight: 1.5 }}>
        Hacking = verde neon clássico · Orpen = roxo/violeta · Dark = paleta VS Code
      </div>
    </div>
  );
});

/** Toggle PRO / AMIGÁVEL sincronizado com o header */
const ModeToggleRow = memo(function ModeToggleRow() {
  const { mode, setConfig } = useConfig();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--neon-dim)', letterSpacing: 0.5, marginBottom: 8 }}>
        Modo de exibição
      </div>
      <div style={{ display: 'flex', gap: 0, width: 'fit-content' }}>
        <button
          type="button"
          onClick={() => setConfig('mode', 'pro')}
          style={{
            background: mode === 'pro' ? 'var(--neon)' : 'transparent',
            border: '1px solid var(--neon)',
            borderRight: 'none',
            color: mode === 'pro' ? '#000' : 'var(--neon)',
            opacity: mode === 'pro' ? 1 : 0.5,
            fontFamily: 'inherit', fontSize: 10, letterSpacing: 1.5,
            padding: '4px 14px', cursor: mode === 'pro' ? 'default' : 'pointer',
            borderRadius: '2px 0 0 2px',
            fontWeight: mode === 'pro' ? 700 : 400,
            transition: 'all 0.15s',
          }}
        >
          PRO
        </button>
        <button
          type="button"
          onClick={() => setConfig('mode', 'amigavel')}
          style={{
            background: mode === 'amigavel' ? 'var(--neon)' : 'transparent',
            border: '1px solid var(--neon)',
            color: mode === 'amigavel' ? '#000' : 'var(--neon)',
            opacity: mode === 'amigavel' ? 1 : 0.5,
            fontFamily: 'inherit', fontSize: 10, letterSpacing: 1.5,
            padding: '4px 14px', cursor: mode === 'amigavel' ? 'default' : 'pointer',
            borderRadius: '0 2px 2px 0',
            fontWeight: mode === 'amigavel' ? 700 : 400,
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          AMIGÁVEL
        </button>
      </div>
      <div style={{ fontSize: 9, color: 'var(--panel-hint-color)', marginTop: 5, lineHeight: 1.5 }}>
        Sincronizado com o toggle do header. PRO = interface técnica completa.
      </div>
    </div>
  );
});

// ── Modal principal ────────────────────────────────────────────────────────────

export default function ConfigModal({ onClose }) {
  const stopProp = useCallback((e) => e.stopPropagation(), []);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 10000 }}
    >
      <div
        onClick={stopProp}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--neon)',
          borderRadius: 4,
          width: 480,
          maxWidth: '92vw',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 30px var(--neon-glow-soft), 0 8px 32px rgba(0,0,0,0.7)',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--panel-2)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: 'var(--neon)', letterSpacing: 2 }}>
            // CONFIGURAÇÕES
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="btn-neon btn-danger"
            style={{ padding: '3px 10px', fontSize: 11 }}
          >
            X
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px' }}>

          {/* ── INTERFACE ── */}
          <SectionHeader label="INTERFACE" />
          <ModeToggleRow />
          <ColorThemeRow />

          {/* ── CANVAS ── */}
          <SectionHeader label="CANVAS" />
          <ToggleRow
            configKey="snapToGrid"
            label="Snap para grade"
            hint="Nós se alinham automaticamente aos pontos da grade ao soltar"
          />
          <NumberRow
            configKey="gridSize"
            label="Tamanho da grade"
            min={8} max={32}
            suffix="px"
            hint="Tamanho da célula da grade (padrão: 16px). Range: 8–32px"
          />
          <ToggleRow
            configKey="showGrid"
            label="Mostrar grade"
            hint="Exibe ou oculta o padrão de pontos no fundo do canvas"
          />
          <ToggleRow
            configKey="smartGuides"
            label="Alinhamento inteligente (smart guides)"
            hint="Linhas-guia de alinhamento estilo Figma + snap ao soltar"
          />

          {/* ── EDGES (CONEXÕES) ── */}
          <SectionHeader label="EDGES (CONEXÕES)" />
          <SelectRow
            configKey="edgeStyle"
            label="Estilo de edge"
            options={[
              { value: 'smooth', label: 'Suave (padrão)' },
              { value: 'straight', label: 'Reta' },
              { value: 'step', label: 'Step' },
            ]}
            hint="Tipo de curva das conexões no canvas"
          />
          <SliderRow
            configKey="edgeIdleOpacity"
            label="Opacidade em repouso"
            min={0.10} max={0.60} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="Opacidade das edges tracejadas quando nenhum nó está selecionado"
          />

          {/* ── EXPORTAÇÃO ── */}
          <SectionHeader label="EXPORTAÇÃO" />
          <TextRow
            configKey="contextPrefix"
            label="Prefixo de contexto"
            placeholder="orpen-ivr"
            hint="Prefixo usado ao gerar nomes de novos ContextNodes (ex: 'orpen-ivr-novo-contexto')"
          />
          <ToggleRow
            configKey="includeSectionComments"
            label="Incluir comentários de seção (;;)"
            hint="Se ON, o .conf exportado inclui separadores ;; entre os blocos"
          />
          <ToggleRow
            configKey="highFidelityMode"
            label="Modo de fidelidade máxima (recomendado)"
            hint="ON: nós importados não editados são emitidos literalmente (preserva formatação exata do original). OFF: reconstrói todas as linhas — útil para normalizar o arquivo"
          />
          <SelectRow
            configKey="lineEnding"
            label="Encoding de fim de linha"
            options={[
              { value: 'lf', label: 'LF (Unix, padrão)' },
              { value: 'crlf', label: 'CRLF (Windows)' },
            ]}
            hint="Define o caractere de fim de linha no .conf gerado"
          />

          {/* ── VISUALIZAÇÃO ── */}
          <SectionHeader label="VISUALIZAÇÃO" />
          <ToggleRow
            configKey="showFormattingElements"
            label="Mostrar elementos de formatação"
            hint="ON: exibe NóLinhaEmBranco e NóComentárioSeção no canvas. OFF: ocultos mas preservados na exportação"
          />

          {/* ── IMPORTAÇÃO ── */}
          <SectionHeader label="IMPORTAÇÃO" />
          <ToggleRow
            configKey="rawOnUnknown"
            label="Modo tolerante (recomendado)"
            hint="ON: comandos não reconhecidos viram NóRaw e a importação continua. OFF: a importação pausa e exige confirmação antes de continuar."
          />
          <ToggleRow
            configKey="preserveComments"
            label="Preservar comentários como NóComentado"
            hint="Se OFF, linhas comentadas (;exten =>) são ignoradas na importação"
          />
          <ToggleRow
            configKey="reviewModeOnImport"
            label="Modo de revisão ao importar .conf"
            hint="ON: abre o canvas em modo de revisão antes de salvar — permite inspecionar os nós importados. OFF: abre direto para edição."
          />

          {/* ── PROJETO ── */}
          <SectionHeader label="PROJETO" />
          <SliderRow
            configKey="autosaveDelay"
            label="Intervalo de autosave"
            min={1} max={10}
            format={(v) => `${v}s`}
            hint="Debounce do autosave no IndexedDB após última alteração"
          />
          <ToggleRow
            configKey="confirmBack"
            label="Confirmar antes de sair"
            hint="Exibe aviso ao clicar em ← VOLTAR com alterações não salvas"
          />

        </div>

        {/* Rodapé de status */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--line)',
          background: 'var(--panel-2)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 9, color: 'var(--neon)', opacity: 0.4, letterSpacing: 1 }}>
            // configurações salvas automaticamente
          </div>
        </div>
      </div>
    </div>
  );
}
