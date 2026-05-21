import React, { memo, useCallback, useRef } from 'react';
import { Handle, Position, useReactFlow, useStore } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import { FolderTree } from 'lucide-react';
import { cls } from '../../utils/common';
import { applyContextRename } from '../../utils/renamePropagator';

const ContextNode = memo(({ id, data, selected }) => {
  const { setNodes } = useReactFlow();

  const nameOnFocus = useRef('');

  // Detecta se existe alguma edge apontando para este ContextNode.
  // Reativo: recalculado automaticamente quando edges mudam.
  const hasIncoming = useStore((s) => s.edges.some((e) => e.target === id));

  // Contexto sem edges de entrada (exceto macros, que são chamados implicitamente)
  const isOrphan = !hasIncoming && !data.isMacro;

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

  // Cor de acento: ciano para macros, neon para contextos normais
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
      <NodeResizer
        isVisible={selected}
        minWidth={260}
        minHeight={180}
        lineClassName="line"
        handleClassName="handle"
      />

      {/* ctx-in: recebe edges externas */}
      <Handle
        type="target"
        position={Position.Top}
        id="ctx-in"
        style={{ background: accent, width: 14, height: 14, top: -7, border: '2px solid #000' }}
      />

      {/* ctx-start: origina edge para o 1º nó do fluxo interno */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="ctx-start"
        style={{
          bottom: 'auto',
          top: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: '#ffcc00',
          width: 10, height: 10,
          border: '1px solid #000',
          boxShadow: '0 0 6px #ffcc0088',
        }}
      />

      {/* Header: nome do contexto */}
      <div
        className="ctx-header"
        style={data.isMacro
          ? { background: 'rgba(0,212,255,0.15)', borderBottomColor: '#00d4ff' }
          : {}}
      >
        <FolderTree size={13} style={data.isMacro ? { color: '#00d4ff' } : {}} />

        {/* Badge MACRO */}
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

        {/* Badge SEM CONEXÃO — visível apenas quando isOrphan */}
        {isOrphan && (
          <span
            className="ctx-orphan-badge"
            data-tooltip="Este contexto não está conectado ao fluxo principal e não será exportado"
          >
            SEM CONEXÃO
          </span>
        )}
      </div>

      {/* Faixa START */}
      <div
        style={{
          position: 'relative',
          height: 20,
          flexShrink: 0,
          borderBottom: '1px dashed var(--line)',
          background: 'rgba(255,204,0,0.04)',
          cursor: 'default',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span style={{
          position: 'absolute',
          top: '50%',
          left: 'calc(50% + 10px)',
          transform: 'translateY(-50%)',
          fontSize: 8,
          color: '#ffcc00',
          letterSpacing: 1,
          opacity: 0.85,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          START
        </span>
      </div>

      <div className="ctx-body-hint">// ARRASTE NÓS AQUI DENTRO //</div>
    </div>
  );
});

ContextNode.displayName = 'ContextNode';
export default ContextNode;
