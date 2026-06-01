import React from 'react';
import { VERSION, VERSION_STRING } from '../../version.js';

const PREFIX_COLOR = {
  '+': 'var(--neon)',
  '-': '#ff5050',
  '~': '#ffcc00',
};

function ChangeLine({ text }) {
  const prefix = text[0];
  const color  = PREFIX_COLOR[prefix];
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', lineHeight: 1.6 }}>
      <span style={{ color: color || 'var(--neon-dim)', flexShrink: 0, fontWeight: 700 }}>
        {prefix || ' '}
      </span>
      <span style={{ color: color ? 'var(--neon-value)' : 'var(--neon-dim)', fontSize: 11 }}>
        {color ? text.slice(2) : text}
      </span>
    </div>
  );
}

export default function ChangelogModal({ onClose }) {
  // Ordena por versão decrescente (mais recente primeiro)
  const entries = [...(VERSION.changelog || [])].reverse();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 560, width: '92vw', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div className="neon-text" style={{ fontSize: 13, letterSpacing: 2 }}>
              // ORPEN URA BUILDER
            </div>
            <div style={{ fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 1, marginTop: 2 }}>
              // {VERSION_STRING} · {VERSION.buildDate}
            </div>
          </div>
          <button
            type="button"
            className="btn-neon btn-danger"
            style={{ padding: '4px 10px', flexShrink: 0 }}
            onClick={onClose}
            aria-label="Fechar changelog"
          >
            X
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {entries.map((entry, i) => (
            <div key={entry.version} style={{ marginBottom: i < entries.length - 1 ? 24 : 0 }}>
              {/* Título da versão */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              }}>
                <span style={{ fontSize: 12, color: 'var(--neon)', fontWeight: 700, letterSpacing: 1 }}>
                  v{entry.version}
                </span>
                {entry.label && (
                  <span style={{
                    fontSize: 9, color: '#ffcc00', border: '1px solid #ffcc0066',
                    borderRadius: 2, padding: '0 5px', lineHeight: '16px', letterSpacing: 1,
                  }}>
                    {entry.label}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--neon-dim)', letterSpacing: 0.5 }}>
                  · {entry.date}
                </span>
              </div>

              {/* Separador */}
              <div style={{ borderTop: '1px solid var(--line)', marginBottom: 8 }} />

              {/* Lista de mudanças */}
              <div style={{ fontFamily: 'inherit' }}>
                {(entry.changes || []).map((line, j) => (
                  <ChangeLine key={j} text={line} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--line)',
          display: 'flex', justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            type="button"
            className="btn-neon"
            style={{ padding: '6px 18px', fontSize: 11, letterSpacing: 1 }}
            onClick={onClose}
          >
            FECHAR
          </button>
        </div>
      </div>
    </div>
  );
}
