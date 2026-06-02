/**
 * HomeScreen — tela inicial de gerenciamento de projetos.
 * Projetos persistidos no IndexedDB (via App.jsx).
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { VERSION_STRING } from '../version.js';
import ChangelogModal from '../components/canvas/ChangelogModal.jsx';

// ── Log de sessão de importação (acumulado enquanto a página está aberta) ─────
const sessionImportLog = [];

// ── Utilitários ───────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

function formatDate(iso) {
  if (!iso) return '—';
  return DATE_FMT.format(new Date(iso));
}

const NAME_RE = /^[a-z0-9-]+$/;

// ── Modal genérico reutilizável ───────────────────────────────────────────────

function Modal({ title, onClose, children, maxWidth = 420 }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth, width: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="neon-text" style={{ letterSpacing: 2, fontSize: 12 }}>▌ {title}</div>
          <button className="btn-neon btn-danger" style={{ padding: '4px 10px' }} onClick={onClose} aria-label="Fechar">X</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Modais ────────────────────────────────────────────────────────────────────

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const isValidChars  = name.length === 0 || NAME_RE.test(name);
  const isValidLength = name.length >= 3;
  const isValid       = isValidChars && isValidLength && name.length > 0;
  const errorMsg = !isValidChars ? 'apenas letras minúsculas, números e hífen'
    : name.length > 0 && !isValidLength ? 'mínimo 3 caracteres' : null;

  return (
    <Modal title="NOVO PROJETO" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (isValid) onCreate(name.trim()); }} style={{ padding: 20 }}>
        <div style={{ marginBottom: 18 }}>
          <label className="term-label">NOME DO PROJETO</label>
          <input className="term-input" value={name} placeholder="ex: orpen-ivr-suporte" autoFocus
            name="project-name" autoComplete="off"
            style={{ borderColor: errorMsg ? '#ff5050' : undefined }}
            onChange={(e) => setName(e.target.value.toLowerCase())} />
          {errorMsg && <div style={{ fontSize: 9, color: '#ff5050', marginTop: 4 }}>⚠ {errorMsg}</div>}
          {isValid && <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginTop: 4 }}>arquivo: {name}.json</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-neon" onClick={onClose} style={{ padding: '8px 18px' }}>CANCELAR</button>
          <button type="submit" className="btn-neon" disabled={!isValid}
            style={{ padding: '8px 18px', opacity: isValid ? 1 : 0.4, cursor: isValid ? 'pointer' : 'not-allowed' }}>
            CRIAR
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmOpenModal({ projectName, onClose, onConfirm }) {
  return (
    <Modal title="ABRIR PROJETO" onClose={onClose} maxWidth={380}>
      <div style={{ padding: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--neon-dim)', marginBottom: 20, lineHeight: 1.7 }}>
          Abrir <span style={{ color: 'var(--neon)' }}>{projectName}</span>?<br />O projeto atual será substituído.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-neon" onClick={onClose} style={{ padding: '8px 16px' }}>CANCELAR</button>
          <button className="btn-neon" onClick={onConfirm} style={{ padding: '8px 16px' }}>CONFIRMAR</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ projectName, onClose, onConfirm }) {
  return (
    <Modal title="EXCLUIR PROJETO" onClose={onClose} maxWidth={380}>
      <div style={{ padding: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--neon-dim)', marginBottom: 20, lineHeight: 1.7 }}>
          Excluir <span style={{ color: '#ff5050' }}>{projectName}</span>?<br />Esta ação não pode ser desfeita.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-neon" onClick={onClose} style={{ padding: '8px 16px' }}>CANCELAR</button>
          <button className="btn-neon btn-danger" onClick={onConfirm} style={{ padding: '8px 16px' }}>EXCLUIR</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal de resumo da importação .conf ───────────────────────────────────────

function FidelityBar({ fidelity }) {
  const color = fidelity >= 80 ? '#00ff41' : fidelity >= 50 ? '#ffcc00' : '#ff5050';
  return (
    <div style={{ margin: '8px 0', lineHeight: 1 }}>
      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${fidelity}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 10, color, marginTop: 4, letterSpacing: 1 }}>
        {fidelity}% fidelidade
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--neon)', letterSpacing: 2, marginBottom: 10, marginTop: 16, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
      ▌ {label}
    </div>
  );
}

function ConfImportModal({ data, onClose, onConfirm, onReview }) {
  const [name, setName] = useState(data.suggestedName || 'projeto-importado');
  const { rawOnUnknown, reviewModeOnImport } = useConfig();

  const isValid    = name.length >= 3 && NAME_RE.test(name);
  const { stats }  = data;
  const validation = data.validation || null;
  const totalNodes = Object.values(stats.nodesByType || {}).reduce((a, b) => a + b, 0);

  // naoReconhecidos: prioriza campo rico, cai de volta para stats.raw (strings)
  const naoReconhecidos = [...(stats.naoReconhecidos || [])].sort((a, b) => b.ocorrencias - a.ocorrencias);
  const hasUnknowns = naoReconhecidos.length > 0 || (stats.raw || []).length > 0;

  // Modo tolerante OFF com comandos não reconhecidos → exige confirmação extra
  const [unknownsConfirmed, setUnknownsConfirmed] = useState(rawOnUnknown || !hasUnknowns);

  // Acumula no log de sessão ao montar o modal
  useEffect(() => {
    if (naoReconhecidos.length > 0) {
      sessionImportLog.push({
        arquivo:        data.suggestedName || 'desconhecido',
        data:           new Date().toISOString().slice(0, 10),
        naoReconhecidos: naoReconhecidos.map((x) => ({
          comando:     x.comando,
          ocorrencias: x.ocorrencias,
          exemplo:     x.exemplo || x.args,
        })),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportLog = useCallback(() => {
    if (!sessionImportLog.length) return;
    const blob = new Blob([JSON.stringify(sessionImportLog, null, 2)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `ura-import-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, []);

  return (
    <Modal title="IMPORTAR .CONF" onClose={onClose} maxWidth={620}>
      <div style={{ padding: '16px 20px', overflow: 'auto', maxHeight: '78vh' }}>

        <SectionHeader label="SEÇÃO 1 — MAPEAMENTO" />

        {/* Status da detecção automática de layout */}
        <div style={{ marginBottom: 14, fontSize: 10, letterSpacing: 0.5 }}>
          {data.layoutApplied ? (
            <div style={{ color: 'var(--neon)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✓</span>
              <span>layout restaurado — posições do canvas preservadas</span>
            </div>
          ) : (
            <div style={{ color: 'var(--neon)', opacity: 0.5 }}>
              // layout não encontrado — usando posicionamento automático
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14, fontSize: 11, lineHeight: 2, color: 'var(--neon-dim)' }}>
          <div><span style={{ color: 'var(--neon)' }}>{stats.contexts || 0}</span> contexto(s) importado(s)</div>
          <div><span style={{ color: 'var(--neon)' }}>{totalNodes}</span> nó(s) criado(s)</div>
          {Object.entries(stats.nodesByType || {}).map(([t, n]) => (
            <div key={t} style={{ marginLeft: 12, fontSize: 10 }}>
              {t}: <span style={{ color: 'var(--neon-value)' }}>{n}</span>
            </div>
          ))}
        </div>

        {(stats.commented || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ffcc00', letterSpacing: 1, marginBottom: 6 }}>
              LINHAS COMENTADAS ({stats.commented.length})
            </div>
            {stats.commented.map((l, i) => (
              <div key={i} style={{ fontSize: 9, color: '#ffcc00', opacity: 0.65, padding: '2px 0', wordBreak: 'break-all' }}>; {l}</div>
            ))}
          </div>
        )}

        {/* ── Comandos não reconhecidos — exibição rica ordenada por frequência ── */}
        {naoReconhecidos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#ff8c00', letterSpacing: 1 }}>
                COMANDOS NÃO RECONHECIDOS ({naoReconhecidos.length} tipo{naoReconhecidos.length !== 1 ? 's' : ''}, {stats.raw.length} ocorrência{stats.raw.length !== 1 ? 's' : ''})
              </div>
              {sessionImportLog.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportLog}
                  style={{
                    background: 'transparent', border: '1px solid #ff8c0066', color: '#ff8c00',
                    fontFamily: 'inherit', fontSize: 9, letterSpacing: 1, padding: '2px 8px',
                    cursor: 'pointer', borderRadius: 2,
                  }}
                  title="Baixar log JSON da sessão completa"
                >
                  ⤓ EXPORTAR LOG
                </button>
              )}
            </div>
            {!rawOnUnknown && !unknownsConfirmed && (
              <div style={{
                background: 'rgba(255,140,0,0.08)', border: '1px solid #ff8c00',
                borderRadius: 3, padding: '8px 10px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 10, color: '#ff8c00', marginBottom: 6, letterSpacing: 0.5 }}>
                  ⚠ MODO TOLERANTE DESATIVADO — os comandos abaixo foram importados como NóRaw.
                </div>
                <button
                  type="button"
                  onClick={() => setUnknownsConfirmed(true)}
                  style={{
                    background: '#ff8c00', border: 'none', color: '#000',
                    fontFamily: 'inherit', fontSize: 9, letterSpacing: 1.5,
                    padding: '4px 12px', cursor: 'pointer', borderRadius: 2, fontWeight: 700,
                  }}
                >
                  CONFIRMAR E CONTINUAR
                </button>
              </div>
            )}
            <div style={{ maxHeight: 160, overflow: 'auto', background: 'var(--bg)', padding: '4px 6px', borderRadius: 3, border: '1px solid var(--line)' }}>
              {naoReconhecidos.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: i < naoReconhecidos.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: '#ff8c00', fontWeight: 700, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>×{item.ocorrencias}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: '#ffb347', letterSpacing: 0.5 }}>{item.comando}</span>
                    {item.exemplo && (
                      <div style={{ fontSize: 9, color: '#ff8c00', opacity: 0.6, wordBreak: 'break-all', marginTop: 1 }}>
                        {item.exemplo.length > 80 ? item.exemplo.slice(0, 80) + '…' : item.exemplo}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fallback: stats.raw sem info rica */}
        {naoReconhecidos.length === 0 && (stats.raw || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ff8c00', letterSpacing: 1, marginBottom: 6 }}>
              // COMANDOS NÃO RECONHECIDOS ({stats.unknownCommands.length})
            </div>
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginBottom: 6, opacity: 0.7 }}>
              // comandos que viraram NóRaw — candidatos ao dicionário
            </div>
            {stats.unknownCommands.map(({ cmd, count }, i) => (
              <div key={i} style={{ fontSize: 9, color: '#ff8c00', opacity: 0.85, padding: '2px 0' }}>
                {cmd} — <span style={{ color: '#fff' }}>{count}</span> ocorrência(s)
              </div>
            ))}
          </div>
        )}
        {/* Lista bruta de linhas não reconhecidas (debug) — oculta quando há unknownCommands resumido */}
        {(stats.unknownCommands || []).length === 0 && (stats.raw || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ff8c00', letterSpacing: 1, marginBottom: 6 }}>
              NÓS RAW ({stats.raw.length})
            </div>
            {stats.raw.map((l, i) => (
              <div key={i} style={{ fontSize: 9, color: '#ff8c00', opacity: 0.75, padding: '2px 0', wordBreak: 'break-all' }}>{l}</div>
            ))}
          </div>
        )}

        {/* ── Aviso de nós órfãos ────────────────────────────────────────── */}
        {(stats.orphanCount || 0) > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ff5050', letterSpacing: 1, marginBottom: 6 }}>
              ⚠ {stats.orphanCount} NÓ(S) SEM CONTEXTO PAI DETECTADO(S)
            </div>
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', lineHeight: 1.5, opacity: 0.8 }}>
              // nós sem ContextNode pai foram agrupados em um contexto rascunho.
              // Verifique o canvas e mova-os para o contexto correto.
            </div>
          </div>
        )}

        {(stats.contextNameRenames || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ff8c00', letterSpacing: 1, marginBottom: 6 }}>
              NOMES DUPLICADOS RENOMEADOS ({stats.contextNameRenames.length})
            </div>
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginBottom: 6, opacity: 0.7 }}>
              // contextos com nome duplicado foram renomeados automaticamente
            </div>
            {stats.contextNameRenames.map((r, i) => (
              <div key={i} style={{ fontSize: 9, color: '#ff8c00', opacity: 0.85, padding: '2px 0', wordBreak: 'break-all' }}>
                {r.from} → <span style={{ color: '#fff' }}>{r.to}</span>
              </div>
            ))}
          </div>
        )}

        {(stats.unresolvedRefs || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#00d4ff', letterSpacing: 1, marginBottom: 6 }}>
              REFERÊNCIAS EXTERNAS NÃO VINCULADAS ({stats.unresolvedRefs.length})
            </div>
            <div style={{ fontSize: 9, color: 'var(--neon-dim)', marginBottom: 6, opacity: 0.7 }}>
              // contextos referenciados que não existem no arquivo importado
            </div>
            {stats.unresolvedRefs.map((ref, i) => (
              <div key={i} style={{ fontSize: 9, color: '#00d4ff', opacity: 0.8, padding: '2px 0', wordBreak: 'break-all' }}>
                → {ref}
              </div>
            ))}
          </div>
        )}

        {validation && (
          <>
            <SectionHeader label="SEÇÃO 2 — VALIDAÇÃO ROUND-TRIP" />

            <div style={{ fontSize: 11, color: 'var(--neon-dim)', lineHeight: 2, marginBottom: 8 }}>
              <div>
                <span style={{ color: 'var(--neon)' }}>{validation.preserved}</span>
                {' / '}
                <span>{validation.total}</span>
                {' linhas preservadas'}
              </div>
            </div>

            <FidelityBar fidelity={validation.fidelity} />

            {validation.lost && validation.lost.length > 0 && (
              <div style={{ marginTop: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#ff5050', letterSpacing: 1, marginBottom: 6 }}>
                  LINHAS PERDIDAS ({validation.lost.length})
                </div>
                <div style={{ maxHeight: 120, overflow: 'auto', background: 'var(--bg)', padding: '6px 8px', borderRadius: 3, border: '1px solid var(--line)' }}>
                  {validation.lost.map((l, i) => (
                    <div key={i} style={{ fontSize: 9, color: '#ff5050', opacity: 0.8, padding: '1px 0', wordBreak: 'break-all', fontFamily: 'inherit' }}>
                      - {l}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validation.added && validation.added.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#a78bfa', letterSpacing: 1, marginBottom: 6 }}>
                  LINHAS ADICIONADAS PELO COMPILADOR ({validation.added.length})
                </div>
                <div style={{ maxHeight: 100, overflow: 'auto', background: 'var(--bg)', padding: '6px 8px', borderRadius: 3, border: '1px solid var(--line)' }}>
                  {validation.added.map((l, i) => (
                    <div key={i} style={{ fontSize: 9, color: '#a78bfa', opacity: 0.8, padding: '1px 0', wordBreak: 'break-all', fontFamily: 'inherit' }}>
                      + {l}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validation.error && (
              <div style={{ fontSize: 9, color: '#ff5050', marginTop: 6, opacity: 0.75 }}>
                // erro no round-trip: {validation.error}
              </div>
            )}
          </>
        )}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 16 }}>
          <label className="term-label">NOME DO PROJETO</label>
          <input className="term-input" value={name} placeholder="nome-do-projeto"
            name="project-name" autoComplete="off"
            style={{ borderColor: !isValid ? '#ff5050' : undefined, marginBottom: 4 }}
            onChange={(e) => setName(e.target.value.toLowerCase())} />
          {!isValid && name.length > 0 && (
            <div style={{ fontSize: 9, color: '#ff5050' }}>⚠ apenas letras minúsculas, números e hífen (mín. 3)</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-neon" onClick={onClose} style={{ padding: '8px 16px' }}>CANCELAR</button>
          {reviewModeOnImport ? (
            <>
              <button
                className="btn-neon"
                onClick={() => isValid && unknownsConfirmed && onConfirm(name)}
                disabled={!isValid || !unknownsConfirmed}
                style={{ padding: '8px 16px', opacity: (isValid && unknownsConfirmed) ? 1 : 0.4, cursor: (isValid && unknownsConfirmed) ? 'pointer' : 'not-allowed', borderColor: 'var(--neon-dim)', color: 'var(--neon-dim)' }}
                title="Abre direto para edição sem modo de revisão"
              >
                ABRIR DIRETO
              </button>
              <button
                className="btn-neon"
                onClick={() => isValid && unknownsConfirmed && onReview?.(name)}
                disabled={!isValid || !unknownsConfirmed}
                style={{ padding: '8px 16px', opacity: (isValid && unknownsConfirmed) ? 1 : 0.4, cursor: (isValid && unknownsConfirmed) ? 'pointer' : 'not-allowed' }}
                title="Abre em modo de revisão — inspecione antes de confirmar"
              >
                ▶ REVISAR NO CANVAS
              </button>
            </>
          ) : (
            <button className="btn-neon" onClick={() => isValid && unknownsConfirmed && onConfirm(name)}
              disabled={!isValid || !unknownsConfirmed}
              style={{ padding: '8px 16px', opacity: (isValid && unknownsConfirmed) ? 1 : 0.4, cursor: (isValid && unknownsConfirmed) ? 'pointer' : 'not-allowed' }}>
              ABRIR NO CANVAS
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Card de projeto ───────────────────────────────────────────────────────────

function ProjectCard({ project, onOpen, onExport, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="project-card"
      style={{
        boxShadow: hovered ? '0 4px 24px var(--neon-glow-soft), 0 0 0 1px var(--neon)' : 'none',
        borderColor: hovered ? 'var(--neon)' : 'var(--neon-dim)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontSize: '1.08rem', color: 'var(--neon)', letterSpacing: 1, wordBreak: 'break-all', fontWeight: 500 }}>
        {project.name}
      </div>
      <div style={{ fontSize: '0.77rem', color: 'var(--neon-dim)', lineHeight: 1.9 }}>
        <div>criado em {formatDate(project.dataCriacao)}</div>
        <div>modificado em {formatDate(project.dataModificacao)}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <button className="btn-neon" onClick={() => onOpen(project)}
          style={{ flex: 1, minWidth: 70, padding: '6px 8px', fontSize: '0.85rem', letterSpacing: 1 }}>
          ABRIR
        </button>
        <button className="btn-neon" onClick={() => onExport(project)} disabled={!project.flow}
          title={project.flow ? undefined : 'Salve o projeto primeiro'}
          style={{ flex: 1, minWidth: 90, padding: '6px 8px', fontSize: '0.77rem', letterSpacing: 0.5, opacity: project.flow ? 1 : 0.35, cursor: project.flow ? 'pointer' : 'not-allowed' }}>
          EXP .JSON
        </button>
        <button className="btn-neon btn-danger" onClick={() => onDelete(project)}
          aria-label={`Excluir projeto ${project.name}`}
          style={{ flex: 0, padding: '6px 10px', fontSize: '0.85rem' }}>
          ⌫
        </button>
      </div>
    </div>
  );
}

// ── HomeScreen principal ──────────────────────────────────────────────────────

export default function HomeScreen({
  projects, onCreateProject, onOpenProject,
  onImportProject, onImportConf, onDeleteProject,
  importError, confImportData, onConfImportConfirm, onConfImportReview, onConfImportCancel,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmOpen,     setConfirmOpen]     = useState(null);
  const [confirmDelete,   setConfirmDelete]   = useState(null);
  const [showChangelog,   setShowChangelog]   = useState(false);
  const jsonRef = useRef(null);
  const confRef = useRef(null);

  const handleCreate = useCallback((name) => {
    setShowCreateModal(false);
    onCreateProject(name);
  }, [onCreateProject]);

  const handleExport = useCallback((project) => {
    if (!project.flow) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${project.name}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, []);

  const handleDelete = useCallback((project) => setConfirmDelete(project), []);

  const handleConfirmDelete = useCallback(() => {
    if (confirmDelete) onDeleteProject(confirmDelete.id);
    setConfirmDelete(null);
  }, [confirmDelete, onDeleteProject]);

  return (
    <div style={{
      height: '100vh', background: 'var(--bg)', color: 'var(--neon)',
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',ui-monospace,monospace",
      display: 'flex', flexDirection: 'column', overflow: 'auto',
      transition: 'background-color 0.3s, color 0.3s',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="home-header" style={{ padding: '28px 48px 20px', borderBottom: '1px solid var(--line)' }}>
        {/* Linha de gradiente no topo é adicionada pelo CSS .home-header::before */}

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: '2rem', letterSpacing: 3 }} className="neon-text">
              ▌Orpen // URA<span className="blink">_</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--neon-dim)', marginTop: 6, letterSpacing: 2, opacity: 0.8 }}>
              ASTERISK DIALPLAN BUILDER
            </div>
          </div>

        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 48px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <button className="btn-neon" onClick={() => setShowCreateModal(true)}
          style={{ padding: '9px 20px', fontSize: '0.92rem', letterSpacing: 2 }}>
          + NOVO PROJETO
        </button>

        {/* Importar JSON */}
        <button className="btn-neon" onClick={() => jsonRef.current?.click()}
          style={{
            padding: '9px 18px', fontSize: 12, letterSpacing: 1.5,
            borderColor: 'var(--neon-dim)', color: 'var(--neon-dim)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon)'; e.currentTarget.style.color = 'var(--neon)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--neon-dim)'; e.currentTarget.style.color = 'var(--neon-dim)'; }}>
          IMPORTAR .JSON
        </button>
        <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportProject(f); e.target.value = ''; }} />

        {/* Importar CONF — aceita múltiplos arquivos para detecção automática do .layout.json */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn-neon" onClick={() => confRef.current?.click()}
            style={{ padding: '9px 18px', fontSize: 12, letterSpacing: 1.5, borderColor: '#ffcc0077', color: '#ffcc00' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ffcc00'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ffcc0077'; }}>
            IMPORTAR .CONF
          </button>
          {/* Instrução discreta: orienta o usuário a selecionar os dois arquivos juntos */}
          <div style={{ fontSize: 9, color: 'var(--neon)', opacity: 0.5, letterSpacing: 0.3, lineHeight: 1.5 }}>
            // selecione o .conf para importar<br />
            dica: selecione também o .layout.json para restaurar posições
          </div>
        </div>
        <input
          ref={confRef}
          type="file"
          accept=".conf,.json,.txt"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files    = Array.from(e.target.files || []);
            const confFile = files.find((f) => /\.(conf|txt)$/i.test(f.name));
            if (!confFile) return;
            const baseName   = confFile.name.replace(/\.(conf|txt)$/i, '');
            const layoutFile = files.find((f) => f.name === `${baseName}.layout.json`) || null;
            onImportConf(confFile, layoutFile);
            e.target.value = '';
          }}
        />

        {importError && (
          <div role="alert" aria-live="polite" style={{ fontSize: 11, color: '#ff5050', letterSpacing: 1 }}>// {importError}</div>
        )}
      </div>

      {/* ── Lista de projetos ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '28px 48px' }}>
        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '90px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--neon)', opacity: 0.6, letterSpacing: 1, lineHeight: 2.2 }}>
              // nenhum projeto encontrado<br />— crie ou importe sua primeira URA
            </div>
            <div style={{ marginTop: 32, display: 'inline-block' }}>
              <button className="btn-neon" onClick={() => setShowCreateModal(true)}
                style={{ padding: '10px 28px', fontSize: 12, letterSpacing: 2, opacity: 0.5 }}>
                + NOVO PROJETO
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p}
                onOpen={() => setConfirmOpen(p)}
                onExport={handleExport}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Rodapé com versão ─────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 12, right: 18, zIndex: 2,
        pointerEvents: 'auto',
      }}>
        <button
          type="button"
          onClick={() => setShowChangelog(true)}
          title="Ver changelog"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, letterSpacing: 0.5,
            color: 'var(--neon)', opacity: 0.4,
            transition: 'opacity 0.15s',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
        >
          Orpen URA Builder · v{VERSION_STRING}
        </button>
      </div>

      {/* ── Modais ────────────────────────────────────────────────────────── */}
      {showCreateModal  && <CreateProjectModal    onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />}
      {confirmOpen      && <ConfirmOpenModal       projectName={confirmOpen.name}   onClose={() => setConfirmOpen(null)}   onConfirm={() => { onOpenProject(confirmOpen); setConfirmOpen(null); }} />}
      {confirmDelete    && <ConfirmDeleteModal     projectName={confirmDelete.name} onClose={() => setConfirmDelete(null)} onConfirm={handleConfirmDelete} />}
      {confImportData   && <ConfImportModal        data={confImportData}            onClose={onConfImportCancel}           onConfirm={onConfImportConfirm} onReview={onConfImportReview} />}
      {showChangelog    && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </div>
  );
}
