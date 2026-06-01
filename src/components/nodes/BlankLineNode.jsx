/**
 * BlankLineNode — representa uma ou mais linhas em branco consecutivas no .conf original.
 *
 * Quando showFormattingElements = false (padrão): renderiza com height 0, invisível.
 * Quando showFormattingElements = true: espaçador discreto com traço tracejado.
 *
 * Não tem handles, não é conectável, não aparece na sidebar.
 * Permanece no childOrder e é exportado como linha(s) em branco pelo compilador.
 */
import React, { memo } from 'react';
import { useConfig } from '../../contexts/ConfigContext';

const BlankLineNode = memo(function BlankLineNode({ data }) {
  const { showFormattingElements } = useConfig();
  const count = data?.count || 1;

  if (!showFormattingElements) {
    // Oculto mas presente no DOM para que ReactFlow meça height = 0
    return <div className="node-fmt-hidden" />;
  }

  return (
    <div
      className="node-blankline"
      title={`${count} linha${count !== 1 ? 's' : ''} em branco`}
      style={{ height: count * 8 }}
    >
      <div className="node-blankline-dash" />
    </div>
  );
});

BlankLineNode.displayName = 'BlankLineNode';
export default BlankLineNode;
