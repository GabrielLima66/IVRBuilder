/**
 * DiffModal — compara o .conf original importado com o arquivo que será exportado.
 *
 * Exibe diff unificado com destaque de linhas adicionadas (verde) e removidas
 * (vermelho). Resumo de estatísticas no topo. Filtro de diferenças cosméticas.
 *
 * Ações:
 *   ↓ EXPORTAR ASSIM    — confirma e baixa o arquivo
 *   ← VOLTAR AO CANVAS  — cancela para revisar
 *   ⟳ ATUALIZAR ORIGINAL — substitui originalConf pelo exportado atual
 */
import React, { useMemo, useState, memo, useCallback } from 'react';
import { diffLines, computeStats } from '../../utils/diffLines';

// ── Paleta de cores do diff ───────────────────────────────────────────────────
const COLOR = {
  insert: {
    bg:     'rgba(0, 255, 65, 0.10)',
    border: 'rgba(0, 255, 65, 0.30)',
    prefix: 'var(--neon)',
  },
  delete: {
    bg:     'rgba(255, 50, 50, 0.10)',
    border: 'rgba(255, 50, 50, 0.25)',
    prefix: '#ff5050',
  },
  equal: {
    bg:     'transparent',
    border: 'transparent',
    prefix: 'transparent',
  },
};

// ── DiffLine — uma linha do diff ──────────────────────────────────────────────
const DiffLine = memo(function DiffLine({ item, lineNo, skipCosmetic }) {
  const { type, line, cosmetic } = item;

  // Quando filtro ativo: oculta diferenças cosméticas
  if (skipCosmetic && cosmetic && type !== 'equal') return null;

  const c      = COLOR[type] || COLOR.equal;
  const prefix = type === 'insert' ? '+' : type === 'delete' ? '-' : ' ';
  const dimmed = type === 'equal';

  return (
    <div
      className="diff-line"
      data-type={type}
      style={{
        background:   c.bg,
        borderLeft:   `2px solid ${c.border}`,
        opacity:      dimmed ? 0.4 : 1,
      }}
    >
      <span className="diff-line-no">{lineNo}</span>
      <span className="diff-line-prefix" style={{ color: c.prefix }}>{prefix}</span>
      <span className="diff-line-text">{line || ' '}</span>
    </div>
  );
});

// ── Resumo ────────────────────────────────────────────────────────────────────
const DiffSummary = memo(function DiffSummary({ stats }) {
  const { equal, inserted, deleted, fidelity } = stats;
  const fidelityColor =
    fidelity === 100 ? 'var(--neon)' :
    fidelity >= 90   ? '#ffcc00'     : '#ff5050';

  return (
    <div className="diff-summary">
      <span style={{ color: 'var(--neon-dim)' }}>// </span>
      <span style={{ color: 'var(--neon-dim)' }}>{equal} idênticas</span>
      {inserted > 0 && (
        <><span style={{ color: 'var(--neon-dim)' }}> · </span>
        <span style={{ color: 'var(--neon)' }}>+{inserted} adicionadas</span></>
      )}
      {deleted > 0 && (
        <><span style={{ color: 'var(--neon-dim)' }}> · </span>
        <span style={{ color: '#ff5050' }}>-{deleted} removidas</span></>
      )}
      <span style={{ color: 'var(--neon-dim)' }}> · </span>
      <span style={{ color: fidelityColor, fontWeight: 700 }}>{fidelity}% fidelidade</span>
    </div>
  );
});

// ── DiffModal — componente principal ──────────────────────────────────────────
export default function DiffModal({
  originalText,
  exportedText,
  onExport,
  onBack,
  onUpdateOriginal,
}) {
  const [skipCosmetic, setSkipCosmetic] = useState(true);
  const [confirmed,    setConfirmed]    = useState(false);

  const diff  = useMemo(() => diffLines(originalText, exportedText), [originalText, exportedText]);
  const stats = useMemo(() => computeStats(diff, skipCosmetic), [diff, skipCosmetic]);

  const handleUpdateOriginal = useCallback(() => {
    onUpdateOriginal(exportedText);
    setConfirmed(true);
  }, [exportedText, onUpdateOriginal]);

  // Numera apenas as linhas não-deletadas (linha do arquivo exportado)
  let exportLineNo = 0;

  return (
    <div className="diff-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="diff-modal">

        {/* ── Cabeçalho ── */}
        <div className="diff-modal-header">
          <div style={{ fontSize: 11, color: 'var(--neon)', letterSpacing: 2 }}>
            // DIFF — ORIGINAL × EXPORTAÇÃO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Toggle cosméticos */}
            <label className="diff-cosmetic-toggle" title="Ignora linhas em branco e diferenças de espaçamento">
              <input
                type="checkbox"
                checked={skipCosmetic}
                onChange={(e) => setSkipCosmetic(e.target.checked)}
              />
              <span>Ignorar diferenças cosméticas</span>
            </label>
            <button
              type="button"
              aria-label="Fechar diff"
              onClick={onBack}
              className="btn-neon btn-danger"
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              X
            </button>
          </div>
        </div>

        {/* ── Sumário ── */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <DiffSummary stats={stats} />
        </div>

        {/* ── Legenda ── */}
        <div style={{
          display: 'flex', gap: 16, padding: '4px 16px',
          borderBottom: '1px solid var(--line)', flexShrink: 0,
          fontSize: 9, letterSpacing: 0.5,
        }}>
          <span style={{ color: 'var(--neon)' }}>+ adicionado</span>
          <span style={{ color: '#ff5050' }}>- removido</span>
          <span style={{ color: 'var(--neon-dim)', opacity: 0.5 }}>  sem alteração</span>
        </div>

        {/* ── Corpo do diff ── */}
        <div className="diff-body">
          {stats.equal === stats.total && stats.inserted === 0 && stats.deleted === 0 ? (
            <div className="diff-identical">
              <span style={{ fontSize: 24, marginBottom: 8 }}>✓</span>
              <span>Arquivos idênticos — 100% de fidelidade</span>
            </div>
          ) : (
            diff.map((item, idx) => {
              if (item.type !== 'delete') exportLineNo++;
              return (
                <DiffLine
                  key={idx}
                  item={item}
                  lineNo={item.type === 'delete' ? '' : exportLineNo}
                  skipCosmetic={skipCosmetic}
                />
              );
            })
          )}
        </div>

        {/* ── Ações ── */}
        <div className="diff-modal-footer">
          <button
            type="button"
            className="diff-btn diff-btn-export"
            onClick={onExport}
          >
            ↓ EXPORTAR ASSIM
          </button>
          <button
            type="button"
            className="diff-btn diff-btn-back"
            onClick={onBack}
          >
            ← VOLTAR AO CANVAS
          </button>
          <button
            type="button"
            className="diff-btn diff-btn-update"
            onClick={handleUpdateOriginal}
            disabled={confirmed}
            title="Substitui o original armazenado pelo conteúdo exportado atual"
          >
            {confirmed ? '✓ ORIGINAL ATUALIZADO' : '⟳ ATUALIZAR ORIGINAL'}
          </button>
        </div>
      </div>
    </div>
  );
}
