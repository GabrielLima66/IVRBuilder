/**
 * ContextNavPanel — painel de navegação de contextos.
 *
 * Exibido na barra lateral direita quando nenhum nó está selecionado.
 * Lista todos os ContextNodes ordenados por exportOrder, com:
 *   - GlobalConfigNode fixo no topo
 *   - Busca inline em tempo real
 *   - Item ativo destacado (contexto mais próximo do centro do viewport)
 *   - Clique anima o viewport até o contexto e dispara borda pulsante
 *
 * Requer estar dentro de um ReactFlowProvider (usa useReactFlow + useActiveContext).
 */

import React, { useState, useCallback, memo } from 'react';
import { useReactFlow } from 'reactflow';
import { useActiveContext } from '../../hooks/useActiveContext';

// ─────────────────────────────────────────────────────────────────────────────
// CtxItem — um item da lista de contextos
// ─────────────────────────────────────────────────────────────────────────────
const CtxItem = memo(function CtxItem({
  label, childCount, isActive, isConfig, index, isDraft, onClick,
}) {
  const [hov, setHov] = useState(false);
  const hasNoChildren = !isConfig && childCount === 0;
  const active = isActive && !isConfig;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        5,
        width:      '100%',
        padding:    '5px 6px',
        background: active ? 'var(--neon-glow-faint)' : hov ? 'var(--hover-bg)' : 'transparent',
        border:         'none',
        borderLeft:     active
          ? '2px solid var(--neon)'
          : hov
            ? '2px solid var(--neon-dim)'
            : '2px solid transparent',
        borderRadius:   2,
        cursor:         'pointer',
        fontFamily:     "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        textAlign:      'left',
        transition:     'background 0.12s, border-color 0.12s',
        marginBottom:   1,
        boxSizing:      'border-box',
      }}
    >
      {/* Número de ordem / ícone config */}
      <span style={{
        fontSize:   '0.69rem',
        color:      'var(--neon)',
        opacity:    0.5,
        minWidth:   14,
        textAlign:  'right',
        flexShrink: 0,
        letterSpacing: 0.5,
      }}>
        {isConfig ? '★' : index}
      </span>

      {/* Nome do contexto */}
      <span style={{
        flex:         1,
        fontSize:     '0.85rem',
        color:        'var(--neon)',
        letterSpacing: 0.5,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        opacity:      isDraft ? 0.55 : 1,
      }}>
        {label}
      </span>

      {/* Badges + contador de filhos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {isDraft && (
          <span style={{
            fontSize:     '0.62rem',
            letterSpacing: 1,
            color:        '#888',
            border:       '1px solid #444',
            borderRadius: 2,
            padding:      '0 3px',
            lineHeight:   '14px',
          }}>
            RASCUNHO
          </span>
        )}
        {hasNoChildren && (
          <span style={{
            fontSize:     '0.62rem',
            letterSpacing: 1,
            color:        '#ffcc00',
            border:       '1px solid rgba(255,204,0,0.35)',
            borderRadius: 2,
            padding:      '0 3px',
            lineHeight:   '14px',
          }}>
            SEM NÓS
          </span>
        )}
        {!isConfig && (
          <span style={{
            fontSize:     '0.69rem',
            color:        'var(--neon)',
            opacity:      0.4,
            letterSpacing: 0.3,
            whiteSpace:   'nowrap',
          }}>
            {childCount} nó{childCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ContextNavPanel — componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ContextNavPanel({ nodes, onNavigate }) {
  const [query, setQuery] = useState('');
  const rfInstance       = useReactFlow();
  const activeContextId  = useActiveContext(nodes);

  // ── Derivação de dados ──────────────────────────────────────────────────────
  const configNode = nodes.find((n) => n.type === 'config') || null;

  const contextNodes = nodes
    .filter((n) => n.type === 'context')
    .slice()
    .sort((a, b) => {
      const oa = a.data?.exportOrder ?? 9999;
      const ob = b.data?.exportOrder ?? 9999;
      if (oa !== ob) return oa - ob;
      return (a.data?.contextName || '').localeCompare(b.data?.contextName || '');
    });

  // Contagem de filhos por nó pai
  const getChildCount = useCallback(
    (parentId) => nodes.filter((n) => n.parentNode === parentId).length,
    [nodes]
  );

  // Filtragem por busca
  const q               = query.toLowerCase().trim();
  const filteredContexts = q
    ? contextNodes.filter((n) => (n.data?.contextName || '').toLowerCase().includes(q))
    : contextNodes;

  // Totais para o rodapé
  const totalCtx   = contextNodes.length;
  const totalNodes = contextNodes.reduce((acc, n) => acc + getChildCount(n.id), 0);

  // ── Navegação ───────────────────────────────────────────────────────────────
  const navigateTo = useCallback((node) => {
    if (!node) return;

    const w = node.style?.width  || node.width  || 320;
    const h = node.style?.height || node.height || 100;

    // Anima viewport para centralizar o ContextNode com padding
    rfInstance.fitBounds(
      { x: node.position.x, y: node.position.y, width: w, height: h },
      { duration: 600, padding: 0.2 }
    );

    // Dispara o destaque pulsante via callback ao Canvas
    onNavigate?.(node.id);
  }, [rfInstance, onNavigate]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <div style={{
          fontSize:      '0.85rem',
          color:         'var(--neon-dim)',
          letterSpacing: 1,
          marginBottom:  10,
        }}>
          // CONTEXTOS
        </div>

        {/* Campo de busca */}
        <input
          type="text"
          className="term-input"
          placeholder="// filtrar..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width:      '100%',
            fontSize:   '0.77rem',
            padding:    '4px 8px',
            boxSizing:  'border-box',
          }}
          autoComplete="off"
          spellCheck={false}
          aria-label="Filtrar contextos"
        />
      </div>

      {/* ── Lista com scroll ────────────────────────────────────────────────── */}
      <div style={{
        flex:       1,
        overflowY:  'auto',
        overflowX:  'hidden',
        marginRight: -4, // compensa scrollbar
        paddingRight: 4,
      }}>

        {/* GlobalConfigNode — fixo no topo */}
        {configNode && (
          <>
            <CtxItem
              label="CONFIG/START"
              childCount={getChildCount(configNode.id)}
              isActive={false}
              isConfig
              onClick={() => navigateTo(configNode)}
            />
            {/* Separador entre config e contextos */}
            <div style={{
              height:     1,
              background: 'var(--neon-glow-soft)',
              margin:     '5px 2px 5px',
            }} />
          </>
        )}

        {/* ContextNodes */}
        {filteredContexts.length === 0 && q && (
          <div style={{
            fontSize:   '0.77rem',
            color:      'var(--panel-hint-color)',
            padding:    '14px 0',
            textAlign:  'center',
            letterSpacing: 0.5,
          }}>
            // sem resultados
          </div>
        )}

        {filteredContexts.length === 0 && !q && (
          <div style={{
            fontSize:   '0.77rem',
            color:      'var(--panel-hint-color)',
            padding:    '14px 0',
            textAlign:  'center',
            letterSpacing: 0.5,
          }}>
            // nenhum contexto no canvas
          </div>
        )}

        {filteredContexts.map((n) => {
          // Índice real na lista completa ordenada (para a numeração)
          const realIndex = contextNodes.indexOf(n) + 1;
          return (
            <CtxItem
              key={n.id}
              label={n.data?.contextName || '(sem nome)'}
              childCount={getChildCount(n.id)}
              isActive={n.id === activeContextId}
              index={realIndex}
              isDraft={!!n.data?.isDraft}
              onClick={() => navigateTo(n)}
            />
          );
        })}
      </div>

      {/* ── Rodapé de status ────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:    0,
        borderTop:     '1px solid var(--line)',
        paddingTop:    8,
        marginTop:     6,
        fontSize:      '0.69rem',
        color:         'var(--neon)',
        opacity:       0.4,
        letterSpacing: 0.5,
        lineHeight:    1.6,
      }}>
        // {totalCtx} contexto{totalCtx !== 1 ? 's' : ''} · {totalNodes} nó{totalNodes !== 1 ? 's' : ''} no total
      </div>
    </div>
  );
}
