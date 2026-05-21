import React, { memo, useCallback, useRef, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow, useStore } from 'reactflow';
import { FolderTree } from 'lucide-react';
import { cls } from '../../utils/common';
import { applyContextRename } from '../../utils/renamePropagator';

// Constantes de layout — fonte de verdade compartilhada com ContextOrderOverlay
export const CTX_HEADER_H  = 34;  // px — altura do cabeçalho (padding 6px*2 + ícone + borda)
export const CTX_PAD_H     = 20;  // px — padding esquerdo dos filhos
export const CTX_PAD_BOTTOM = 20; // px — padding inferior
export const CTX_MIN_W     = 320; // px — largura mínima do contexto

const ContextNode = memo(({ id, data, selected }) => {
  const { setNodes } = useReactFlow();

  const childOrder = useMemo(() => data.childOrder || [], [data.childOrder]);

  const nameOnFocus   = useRef('');
  const lastLayoutKey = useRef(null); // evita chamadas redundantes a setNodes

  // Detecta edge de entrada → badge "SEM CONEXÃO"
  const hasIncoming = useStore((s) => s.edges.some((e) => e.target === id));
  const isOrphan    = !hasIncoming && !data.isMacro;

  // Dimensões medidas dos filhos (nodeInternals é atualizado pelo RF após DOM render)
  const childMeasures = useStore((s) => {
    const result = {};
    for (const cid of childOrder) {
      const n = s.nodeInternals.get(cid);
      if (n) result[cid] = { w: n.width || 220, h: n.height || 60 };
    }
    return result;
  });

  // Calcula layout: largura do contexto, altura e posição de cada filho
  const layout = useMemo(() => {
    let maxW = CTX_MIN_W - 40; // mínimo da área interna
    for (const cid of childOrder) {
      maxW = Math.max(maxW, childMeasures[cid]?.w || 220);
    }
    const ctxW   = maxW + 40;   // 20px padding cada lado
    const childW = ctxW - 40;   // largura forçada nos filhos

    let y = CTX_HEADER_H;
    const positions = {};
    for (const cid of childOrder) {
      positions[cid] = { x: CTX_PAD_H, y };
      y += childMeasures[cid]?.h || 60;
    }
    const ctxH = y + CTX_PAD_BOTTOM;

    return { ctxW, ctxH, childW, positions };
  }, [childOrder, childMeasures]);

  // Aplica posições dos filhos e dimensões do contexto via setNodes
  useEffect(() => {
    const layoutKey = `${layout.ctxW},${layout.ctxH},${
      childOrder.map((cid) => `${cid}:${layout.positions[cid]?.x},${layout.positions[cid]?.y}`).join('|')
    }`;
    if (layoutKey === lastLayoutKey.current) return;
    lastLayoutKey.current = layoutKey;

    setNodes((ns) => {
      let changed = false;
      const updated = ns.map((n) => {
        // Atualiza dimensão do próprio contexto
        if (n.id === id) {
          if (n.style?.width === layout.ctxW && n.style?.height === layout.ctxH) return n;
          changed = true;
          return { ...n, style: { ...n.style, width: layout.ctxW, height: layout.ctxH } };
        }
        // Atualiza posição e largura de cada filho
        if (n.parentNode === id) {
          const pos = layout.positions[n.id];
          if (!pos) return n;
          const samePosW =
            n.position.x === pos.x &&
            n.position.y === pos.y &&
            (n.style?.width === layout.childW || n.style?.width === undefined && layout.childW === 220);
          if (samePosW) return n;
          changed = true;
          return {
            ...n,
            position: pos,
            draggable: false, // filho gerenciado pelo contexto
            style: { ...n.style, width: layout.childW },
          };
        }
        return n;
      });
      return changed ? updated : ns;
    });
  }); // sem deps — ref guard evita loops

  // Rename handlers
  const onRename = useCallback(
    (v) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, contextName: v } } : n))
      );
    },
    [id, setNodes]
  );

  const propagateRename = useCallback(
    (oldName, newName) => {
      setNodes((ns) => applyContextRename(ns, oldName, newName));
    },
    [setNodes]
  );

  const accent    = data.isMacro ? '#00d4ff' : 'var(--neon)';
  const accentDim = data.isMacro ? '#0099bb' : 'var(--neon-dim)';

  return (
    <div
      className={cls(
        'ctx-node',
        selected && 'selected',
        isOrphan && 'ctx-node--orphan'
      )}
      style={data.isMacro ? { borderColor: '#00d4ff' } : {}}
    >
      {/* ctx-in: recebe edges externas de outros contextos */}
      <Handle
        type="target"
        position={Position.Top}
        id="ctx-in"
        style={{
          background: accent,
          width: 14, height: 14,
          top: -7,
          border: '2px solid #000',
        }}
      />

      {/* Header: nome do contexto */}
      <div
        className="ctx-header"
        style={
          data.isMacro
            ? { background: 'rgba(0,212,255,0.15)', borderBottomColor: '#00d4ff' }
            : {}
        }
      >
        <FolderTree size={13} style={data.isMacro ? { color: '#00d4ff' } : {}} />

        {data.isMacro && (
          <span style={{
            fontSize: 8, letterSpacing: 1.5, color: '#00d4ff',
            border: '1px solid #00d4ff44', borderRadius: 2,
            padding: '0 4px', lineHeight: '14px', flexShrink: 0,
            opacity: 0.9,
          }}>
            MACRO
          </span>
        )}

        <span style={{ color: accentDim, fontSize: 11, letterSpacing: 1 }}>[</span>
        <input
          className="ctx-name-input"
          value={data.contextName || ''}
          placeholder="nome-do-contexto"
          spellCheck={false}
          onFocus={() => { nameOnFocus.current = data.contextName || ''; }}
          onChange={(e) => onRename(e.target.value.replace(/\s+/g, '-'))}
          onBlur={(e) => {
            const newName = (e.target.value || '').replace(/\s+/g, '-');
            propagateRename(nameOnFocus.current, newName);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={data.isMacro ? { color: '#00d4ff' } : {}}
        />
        <span style={{ color: accentDim, fontSize: 11, letterSpacing: 1 }}>]</span>

        {isOrphan && (
          <span
            className="ctx-orphan-badge"
            data-tooltip="Este contexto não está conectado ao fluxo principal e não será exportado"
          >
            SEM CONEXÃO
          </span>
        )}
      </div>

      {/* Hint quando não há filhos */}
      {childOrder.length === 0 && (
        <div className="ctx-body-hint">// ARRASTE NÓS AQUI DENTRO //</div>
      )}
    </div>
  );
});

ContextNode.displayName = 'ContextNode';
export default ContextNode;
