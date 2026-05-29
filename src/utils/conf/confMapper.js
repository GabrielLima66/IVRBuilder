/**
 * confMapper.js — fase 2 do pipeline de importação .conf.
 * Agrupa tokens em RawContext[], estrutura intermediária antes da resolução semântica.
 *
 * @typedef {Object} RawExtension
 * @property {'1'|'n'} priority
 * @property {string|null} label
 * @property {string} application
 * @property {string} args
 * @property {number} lineNumber
 *
 * @typedef {Object} RawDtmfLine
 * @property {string} application
 * @property {string} args
 *
 * @typedef {Object} RawDtmfBlock
 * @property {string} digit
 * @property {RawDtmfLine[]} lines
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
      block = { digit, lines: [] };
      current.dtmfBlocks.push(block);
    }
    return block;
  };

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
        break;

      case 'extension_s':
        if (!current) break;
        current.extensions.push({
          priority: token.priority,
          label: token.label,
          application: token.application,
          args: token.args,
          inlineComment: token.inlineComment || null,
          lineNumber: token.lineNumber,
        });
        break;

      case 'extension_dtmf':
        if (!current) break;
        getDtmfBlock(token.digit).lines.push({
          priority:    token.priority,
          application: token.application,
          args:        token.args,
        });
        break;

      case 'extension_commented':
        if (!current) break;
        current.commentedLines.push(token.raw);
        break;

      case 'directive':
        if (!current) break;
        if (token.name === 'include') {
          current.directives.push(token.value);
        }
        break;

      case 'blank':
      case 'comment_section':
      case 'unknown':
        // Intentionally ignored at this phase
        break;

      default:
        break;
    }
  }

  return contexts;
}
