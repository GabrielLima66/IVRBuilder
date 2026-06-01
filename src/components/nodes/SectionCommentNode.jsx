/**
 * SectionCommentNode — representa comentários decorativos de seção no .conf original.
 * Ex: ;;------ TITULO ------, ;----OPCAO 1----, ;; texto livre
 *
 * Quando showFormattingElements = false (padrão): renderiza com height 0, invisível.
 * Quando showFormattingElements = true: divisor visual com texto do comentário.
 *
 * style 'double' = começa com ;; (dois ponto-e-vírgula)
 * style 'single' = começa com ; (um ponto-e-vírgula)
 *
 * Não tem handles, não é conectável, não aparece na sidebar.
 */
import React, { memo } from 'react';
import { useConfig } from '../../contexts/ConfigContext';

const SectionCommentNode = memo(function SectionCommentNode({ data }) {
  const { showFormattingElements } = useConfig();

  if (!showFormattingElements) {
    return <div className="node-fmt-hidden" />;
  }

  const isDouble = data?.style === 'double';
  const text = data?.text || '';

  return (
    <div
      className={`node-sectioncomment ${isDouble ? 'node-sectioncomment--double' : 'node-sectioncomment--single'}`}
      title={text}
    >
      <span className="node-sectioncomment-text">{text}</span>
    </div>
  );
});

SectionCommentNode.displayName = 'SectionCommentNode';
export default SectionCommentNode;
