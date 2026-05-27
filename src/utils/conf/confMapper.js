/**
 * confMapper.js — fase 2 do pipeline de importação .conf.
 * Agrupa tokens em RawContext[], estrutura intermediária antes da resolução semântica.
 *
 * @typedef {Object} RawExtension
 * @property {'1'|'n'} priority
 * @property {string|null} label
 * @property {string} application
 * @property {string} args
 * @property {boolean} hasParens
 * @property {number} lineNumber
 *
 * @typedef {Object} RawDtmfLine
 * @property {string} application
 * @property {string} args
 * @property {boolean} hasParens
 *
 * @typedef {Object} RawDtmfBlock
 * @property {string} digit
 * @property {RawDtmfLine[]} lines
 * @property {string|null} comment  comentário ;Texto imediatamente antes da primeira linha do bloco
 *
 * @typedef {Object} RawContext
 * @property {string} name
 * @property {number} lineNumber
 * @property {RawExtension[]} extensions   extensões 's' sequenciais
 * @property {RawDtmfBlock[]} dtmfBlocks   blocos DTMF (0-9, i, t)
 * @property {string[]} directives         valores de "include => xxx"
 * @property {string[]} commentedLines     linhas ;exten => ... raw
 */

/**
 * Groups lexer tokens into RawContext[].
 * Tokens that don't belong to any context (before the first header) are discarded.
 *
 * @param {import('./confLexer.js').Token[]} tokens
 * @returns {RawContext[]}
 */
export function map(tokens) {
  /** @type {RawContext[]} */
  const contexts = [];
  /** @type {RawContext|null} */
  let current = null;

  /**
   * Returns the dtmfBlock for the given digit in the current context,
   * creating one if it doesn't exist yet.
   * @param {string} digit
   * @returns {RawDtmfBlock}
   */
  const getDtmfBlock = (digit) => {
    let block = current.dtmfBlocks.find((b) => b.digit === digit);
    if (!block) {
      block = { digit, lines: [], comment: null };
      current.dtmfBlocks.push(block);
    }
    return block;
  };

  // Rastrea o comentário de linha simples (;texto) imediatamente antes de um bloco DTMF
  let pendingComment = null;

  for (const token of tokens) {
    switch (token.type) {
      case 'context_header':
        current = {
          name: token.name,
          lineNumber: token.lineNumber,
          extensions: [],
          dtmfBlocks: [],
          directives: [],
          commentedLines: [],
        };
        contexts.push(current);
        pendingComment = null;
        break;

      case 'extension_s':
        if (!current) break;
        pendingComment = null; // não é DTMF, reseta
        current.extensions.push({
          priority:  token.priority,
          label:     token.label,
          application: token.application,
          args:      token.args,
          hasParens: token.hasParens ?? true,
          lineNumber: token.lineNumber,
        });
        break;

      case 'extension_dtmf': {
        if (!current) break;
        const block = getDtmfBlock(token.digit);
        // Associa o comentário de linha ao primeiro token do bloco
        if (block.lines.length === 0 && pendingComment !== null) {
          block.comment = pendingComment;
        }
        pendingComment = null;
        block.lines.push({
          application: token.application,
          args:        token.args,
          hasParens:   token.hasParens ?? true,
        });
        break;
      }

      case 'extension_commented':
        if (!current) break;
        pendingComment = null;
        current.commentedLines.push(token.raw);
        break;

      case 'directive':
        if (!current) break;
        pendingComment = null;
        if (token.name === 'include') {
          current.directives.push(token.value);
        }
        break;

      case 'comment_section':
        // Captura apenas comentários simples (;) — não duplos (;;) — como label de opção DTMF
        if (!current) break;
        if (token.double === false) {
          pendingComment = token.text;
        } else {
          // Comentário de seção (;;) limpa qualquer pendente
          pendingComment = null;
        }
        break;

      case 'blank':
        // Linha em branco NÃO limpa pendingComment — é comum ter blank entre o comentário e o bloco DTMF
        break;

      case 'unknown':
        pendingComment = null;
        break;

      default:
        break;
    }
  }

  return contexts;
}
