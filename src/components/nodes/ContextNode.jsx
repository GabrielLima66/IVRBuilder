import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow, useStore } from 'reactflow';
import { FolderTree } from 'lucide-react';
import { cls } from '../../utils/common';
import { applyContextRename } from '../../utils/renamePropagator';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';
import { CTX_CHILD_GAP } from '../../utils/contextDimensions';
import { isContextNameDuplicate } from '../../utils/contextUtils';

// Constantes de layout — fonte de verdade compartilhada com ContextOrderOverlay
export const CTX_HEADER_H  = 34;  // px — altura do cabeçalho
export const CTX_PAD_H     = 20;  // px — padding esquerdo dos filhos
export const CTX_PAD_BOTTOM = 20; // px — padding inferior
export const CTX_MIN_W     = 320; // px — largura mínima do contexto
export { CTX_CHILD_GAP };         // re-exportado de contextDimensions

// ── Categorias de nó para separadores visuais ─────────────────────────────────
const NODE_CATEGORY = {
  set: 'config', noop: 'config', answer: 'config', macro: 'config', config: 'config',
  playback: 'audio', background: 'audio', wait: 'audio', waitexten: 'audio',
  time: 'logic', gotoif: 'logic', gosub: 'logic', return: 'logic',
  execif: 'logic', execiftime: 'logic', verbose: 'logic',
  agi: 'integration',
  queue: 'destination', route: 'destination', dial: 'destination', hangup: 'destination',
  mixmonitor: 'monitor', stopmonitor: 'monitor', chanspy: 'monitor',
  read: 'data', saydigits: 'data', saynumber: 'data',
  menu: 'menu',
  raw: 'special', commented: 'special',
};
const getNodeCategory = (type) => NODE_CATEGORY[type] || 'other';

const ContextNode = memo(({ id, data, selected }) => {
  const { setNodes, getNodes } = useReactFlow();

  const childOrder = useMemo(() => data.childOrder || [], [data.childOrder]);
  const isDraft    = !!data.isDraft;

  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);

  const nameOnFocus   = useRef('');
  const lastLayoutKey = useRef(null);

  // Duplicate-name detection for the inline rename input
  const [isDup, setIsDup] = useState(false);

  // Dimensões e tipos dos filhos
  const childMeasures = useStore((s) => {
    const result = {};
    for (const cid of childOrder) {
      const n = s.nodeInternals.get(cid);
      if (n) result[cid] = { w: n.width || 220, h: n.height || 60, type: n.type };
    }
    return result;
  });

  // Layout: largura, altura, posições e separadores de categoria
  const layout = useMemo(() => {
    let maxW = CTX_MIN_W - 40;
    for (const cid of childOrder) {
      maxW = Math.max(maxW, childMeasures[cid]?.w || 220);
    }
    const ctxW   = maxW + 40;
    const childW = ctxW - 40;

    let y = CTX_HEADER_H;
    const positions  = {};
    const separators = [];

    for (let i = 0; i < childOrder.length; i++) {
      const cid = childOrder[i];
      if (i > 0) {
        const gapCenterY = y + CTX_CHILD_GAP / 2;
        const prevType   = childMeasures[childOrder[i - 1]]?.type;
        const currType   = childMeasures[cid]?.type;
        const showLine   = !!(prevType && currType &&
          getNodeCategory(prevType) !== getNodeCategory(currType));
        separators.push({ y: gapCenterY - 0.5, showLine });
        y += CTX_CHILD_GAP;
      }
      positions[cid] = { x: CTX_PAD_H, y };
      y += childMeasures[cid]?.h || 60;
    }

    const ctxH = y + CTX_PAD_BOTTOM;
    return { ctxW, ctxH, childW, positions, separators };
  }, [childOrder, childMeasures]);

  // Aplica posições, larguras e opacidade (isDraft) dos filhos via setNodes
  useEffect(() => {
    const layoutKey = `${layout.ctxW},${layout.ctxH},${isDraft ? '1' : '0'},${
      childOrder.map((cid) => `${cid}:${layout.positions[cid]?.x},${layout.positions[cid]?.y}`).join('|')
    }`;
    if (layoutKey === lastLayoutKey.current) return;
    lastLayoutKey.current = layoutKey;

    setNodes((ns) => {
      let changed = false;
      const updated = ns.map((n) => {
        if (n.id === id) {
          if (n.style?.width === layout.ctxW && n.style?.height === layout.ctxH) return n;
          changed = true;
          return { ...n, style: { ...n.style, width: layout.ctxW, height: layout.ctxH } };
        }
        if (n.parentNode === id) {
          const pos = layout.positions[n.id];
          if (!pos) return n;
          const targetOpacity = isDraft ? 0.45 : 1;
          const samePosW =
            n.position.x === pos.x &&
            n.position.y === pos.y &&
            n.style?.width === layout.childW &&
            (n.style?.opacity ?? 1) === targetOpacity;
          if (samePosW) return n;
          changed = true;
          return {
            ...n,
            position: pos,
            draggable: false,
            style: { ...n.style, width: layout.childW, opacity: targetOpacity },
          };
        }
        return n;
      });
      return changed ? updated : ns;
    });
  }); // sem deps — ref guard evita loops

  const onRename = useCallback(
    (v) => {
      const allNodes = getNodes();
      const dup = isContextNameDuplicate(v, allNodes, id);
      setIsDup(dup);
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, contextName: v } } : n))
      );
    },
    [id, setNodes, getNodes]
  );

  const propagateRename = useCallback(
    (oldName, newName) => {
      if (isDup) return; // Block propagation when name is duplicate
      setNodes((ns) => applyContextRename(ns, oldName, newName));
    },
    [setNodes, isDup]
  );

  const accent    = isDraft ? '#666666' : (data.isMacro ? '#00d4ff' : 'var(--neon)');
  const accentDim = isDraft ? '#555555' : (data.isMacro ? '#0099bb' : 'var(--neon-dim)');

  const accentActive     = data.isMacro ? '#00d4ff' : 'var(--neon)';
  const accentActiveGlow = data.isMacro ? 'rgba(0,212,255,0.65)' : 'rgba(0,255,65,0.65)';

  // Destaque de navegação: injetado transitoriamente via nodesWithSel (não persiste)
  const isNavHighlight  = !!data._navHighlight;
  // Indicador de colisão de drag: injetado transitoriamente via nodesWithSel
  const isDragConflict  = !!data._dragConflict;

  return (
    <div
      className={cls(
        'ctx-node',
        selected && 'selected',
        isDraft && 'ctx-node--draft',
        isConnectedActive && !isDraft && 'node-connected-active',
        isNavHighlight && 'ctx-node--nav-highlight'
      )}
      style={{
        ...(isDraft
          ? { borderColor: '#555', borderStyle: 'dashed', opacity: 0.85 }
          : data.isMacro
            ? { borderColor: '#00d4ff' }
            : {}),
        ...(isConnectedActive && !isDraft && {
          '--node-active-color': accentActive,
          '--node-active-glow': accentActiveGlow,
        }),
        // Borda laranja durante drag de colisão — sinal visual de "não pode largar aqui"
        ...(isDragConflict && {
          borderColor: '#ff8c00',
          boxShadow:   '0 0 10px rgba(255,140,0,0.55)',
        }),
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="ctx-in"
        style={{ background: accent, width: 14, height: 14, top: -7, border: '2px solid #000' }}
      />

      {/* Header */}
      <div
        className="ctx-header"
        style={isDraft
          ? { background: 'rgba(80,80,80,0.2)', borderBottomColor: '#555' }
          : data.isMacro
            ? { background: 'rgba(0,212,255,0.15)', borderBottomColor: '#00d4ff' }
            : {}}
      >
        <FolderTree size={13} style={{ color: accent }} />

        {/* Badge MACRO */}
        {data.isMacro && !isDraft && (
          <span style={{
            fontSize: 8, letterSpacing: 1.5, color: '#00d4ff',
            border: '1px solid #00d4ff44', borderRadius: 2,
            padding: '0 4px', lineHeight: '14px', flexShrink: 0, opacity: 0.9,
          }}>
            MACRO
          </span>
        )}

        {/* Badge RASCUNHO */}
        {isDraft && (
          <span style={{
            fontSize: 8, letterSpacing: 1.5, color: '#888',
            border: '1px solid #55555588', borderRadius: 2,
            padding: '0 4px', lineHeight: '14px', flexShrink: 0,
            fontFamily: 'inherit',
          }}>
            // RASCUNHO
          </span>
        )}

        <span style={{ color: accentDim, fontSize: 11, letterSpacing: 1 }}>[</span>
        <input
          className="ctx-name-input"
          value={data.contextName || ''}
          placeholder="nome-do-contexto"
          spellCheck={false}
          onFocus={() => {
            nameOnFocus.current = data.contextName || '';
            setIsDup(false);
          }}
          onChange={(e) => onRename(e.target.value.replace(/\s+/g, '-'))}
          onBlur={(e) => {
            propagateRename(nameOnFocus.current, (e.target.value || '').replace(/\s+/g, '-'));
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            color: isDup ? '#ff4444' : isDraft ? '#888' : data.isMacro ? '#00d4ff' : undefined,
            textDecoration: isDraft ? 'line-through' : 'none',
            outline: isDup ? '1px solid #ff4444' : undefined,
          }}
        />
        <span style={{ color: accentDim, fontSize: 11, letterSpacing: 1 }}>]</span>
      </div>

      {/* Error: duplicate name — rendered OUTSIDE the header so it overlays below it */}
      {isDup && (
        <div style={{
          position: 'absolute',
          top: 34, // CTX_HEADER_H
          left: 0,
          right: 0,
          fontSize: 9,
          color: '#ff4444',
          background: 'rgba(20,0,0,0.85)',
          letterSpacing: 0.5,
          padding: '2px 10px',
          pointerEvents: 'none',
          zIndex: 10,
          borderBottom: '1px solid #ff4444',
        }}>
          // nome já existe — escolha outro
        </div>
      )}

      {/* Hint quando vazio */}
      {childOrder.length === 0 && (
        <div className="ctx-body-hint">// ARRASTE NÓS AQUI DENTRO //</div>
      )}

      {/* Separadores de categoria entre nós filhos */}
      {layout.separators.map((sep, idx) =>
        sep.showLine ? (
          <div
            key={idx}
            aria-hidden="true"
            style={{
              position: 'absolute', left: CTX_PAD_H,
              top: sep.y, width: `calc(100% - ${CTX_PAD_H * 2}px)`,
              height: 1, background: isDraft ? '#555' : 'var(--neon)',
              opacity: 0.25, pointerEvents: 'none', borderRadius: 0.5,
            }}
          />
        ) : null
      )}
    </div>
  );
});

ContextNode.displayName = 'ContextNode';
export default ContextNode;
