/**
 * CommentedNode — representa uma linha Asterisk comentada (;exten => ...).
 * Visual: borda dashed amarelo neon, opacidade reduzida.
 * O nó não gera nenhuma linha no .conf exportado.
 * O usuário pode reativá-lo convertendo para o nó correspondente.
 */
import React, { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { cls } from '../../utils/common';
import { useActiveSelection } from '../../contexts/ActiveSelectionContext';

const CommentedNode = memo(({ id, data, selected }) => {
  const { setNodes } = useReactFlow();
  const { activeNodeIds } = useActiveSelection();
  const isConnectedActive = activeNodeIds.has(id);

  const handleReactivate = useCallback(() => {
    // Tenta converter o comando original para um nó ativo
    if (!data.onReactivate) return;
    data.onReactivate(id, data.originalLine);
  }, [id, data]);

  return (
    <div
      className={cls('rcx-node', selected && 'selected', isConnectedActive && 'node-connected-active')}
      style={{
        borderColor: '#ffcc0099',
        borderStyle: 'dashed',
        opacity: 0.7,
        minWidth: 200,
        ...(isConnectedActive && { '--node-active-color': '#ffcc00', '--node-active-glow': 'rgba(255,204,0,0.65)' }),
      }}
    >
      <Handle type="target" position={Position.Top}    id="in"       style={{ background: '#ffcc00' }} />
      <Handle type="target" position={Position.Left}   id="in-left"  style={{ background: '#ffcc00' }} />
      <Handle type="source" position={Position.Bottom} id="out"      style={{ background: '#ffcc00' }} />
      <Handle type="source" position={Position.Right}  id="out-right" style={{ background: '#ffcc00' }} />

      <div className="rcx-node-header" style={{
        background: 'linear-gradient(180deg, #ffcc0022 0%, #ffcc0008 100%)',
        borderColor: '#ffcc0066',
        color: '#ffcc00',
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, opacity: 0.8 }}>// COMENTADO</span>
        {data.onReactivate && (
          <button
            style={{
              background: 'transparent',
              border: '1px solid #ffcc0066',
              color: '#ffcc00',
              fontFamily: 'inherit',
              fontSize: 9,
              padding: '1px 6px',
              cursor: 'pointer',
              borderRadius: 2,
              letterSpacing: 0.5,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#ffcc0022'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={handleReactivate}
          >
            REATIVAR
          </button>
        )}
      </div>

      <div className="rcx-node-body">
        <div style={{
          fontSize: 9,
          color: '#ffcc00',
          opacity: 0.65,
          wordBreak: 'break-all',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          padding: '2px 0',
        }}>
          {data.originalLine || data.text || ''}
        </div>
        {data.reactivateError && (
          <div style={{ fontSize: 8, color: '#ff5050', marginTop: 4 }}>
            ⚠ {data.reactivateError}
          </div>
        )}
      </div>
    </div>
  );
});

CommentedNode.displayName = 'CommentedNode';
export default CommentedNode;
