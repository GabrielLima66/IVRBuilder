/**
 * confLexer.js — fase 1 do pipeline de importação .conf.
 * Converte texto bruto em tokens tipados, um por linha.
 *
 * @typedef {'1'|'n'} Priority
 *
 * @typedef {Object} TokenContextHeader
 * @property {'context_header'} type
 * @property {string} name
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenExtensionS
 * @property {'extension_s'} type
 * @property {Priority} priority
 * @property {string|null} label
 * @property {string} application
 * @property {string} args
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenExtensionDtmf
 * @property {'extension_dtmf'} type
 * @property {string} digit
 * @property {Priority} priority
 * @property {string} application
 * @property {string} args
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenExtensionCommented
 * @property {'extension_commented'} type
 * @property {string} raw
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenDirective
 * @property {'directive'} type
 * @property {string} name
 * @property {string} value
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenCommentSection
 * @property {'comment_section'} type
 * @property {string} text
 * @property {boolean} double  true para ;; (seção), false para ; (comentário de linha)
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenBlank
 * @property {'blank'} type
 * @property {number} lineNumber
 *
 * @typedef {Object} TokenUnknown
 * @property {'unknown'} type
 * @property {string} raw
 * @property {number} lineNumber
 *
 * @typedef {TokenContextHeader|TokenExtensionS|TokenExtensionDtmf|TokenExtensionCommented|TokenDirective|TokenCommentSection|TokenBlank|TokenUnknown} Token
 */

/**
 * Parses one application call string into { application, args, hasParens }.
 * hasParens: false quando a chamada não tinha parênteses (ex: bare "Hangup").
 * @param {string} cmdFull
 * @returns {{ application: string, args: string, hasParens: boolean }}
 */
function parseApplication(cmdFull) {
  const s = cmdFull.trim();
  const parenIdx = s.indexOf('(');
  if (parenIdx < 0) return { application: s, args: '', hasParens: false };
  const application = s.slice(0, parenIdx).trim();
  // Remove outer parens — strip trailing )
  const inner = s.slice(parenIdx + 1);
  const args = inner.endsWith(')') ? inner.slice(0, inner.length - 1) : inner;
  return { application, args, hasParens: true };
}

/**
 * Lex a raw .conf string into an array of typed tokens.
 * One token per source line — preserves line numbers for diagnostics.
 * @param {string} content
 * @returns {Token[]}
 */
export function lex(content) {
  const tokens = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const line = raw.trim();

    // Blank line
    if (!line) {
      tokens.push({ type: 'blank', lineNumber });
      continue;
    }

    // Context header: [name]
    const ctxMatch = line.match(/^\[([^\]]+)\]$/);
    if (ctxMatch) {
      tokens.push({ type: 'context_header', name: ctxMatch[1].trim(), lineNumber });
      continue;
    }

    // Commented extension: ;exten => ...  (one or more semicolons)
    const commentedExtenMatch = line.match(/^;+\s*(exten\s*=>.+)$/i);
    if (commentedExtenMatch) {
      tokens.push({ type: 'extension_commented', raw: commentedExtenMatch[1].trim(), lineNumber });
      continue;
    }

    // Double-semicolon section comment: ;; text
    if (line.startsWith(';;')) {
      tokens.push({ type: 'comment_section', text: line.slice(2).trim(), double: true, lineNumber });
      continue;
    }

    // Single-line comment — pode ser rótulo de opção DTMF (;Texto da opção)
    if (line.startsWith(';')) {
      tokens.push({ type: 'comment_section', text: line.slice(1).trim(), double: false, lineNumber });
      continue;
    }

    // Extension line: exten => ext,priority,App(args)
    const extenMatch = line.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
    if (extenMatch) {
      const extension = extenMatch[1].trim();
      const priorityRaw = extenMatch[2].trim();
      let cmdFull = extenMatch[3].trim();

      // Strip trailing ;; inline comments from cmdFull
      const commentIdx = cmdFull.indexOf(';;');
      if (commentIdx >= 0) cmdFull = cmdFull.slice(0, commentIdx).trim();

      // Extract label from priority like n(label)
      let priority = priorityRaw;
      let label = null;
      const labelMatch = priorityRaw.match(/^n\(([^)]+)\)$/);
      if (labelMatch) {
        priority = 'n';
        label = labelMatch[1];
      } else if (priorityRaw === '1') {
        priority = '1';
      } else {
        // 'n', numeric like '2','3',... — treat all as 'n'
        priority = 'n';
      }

      const { application, args, hasParens } = parseApplication(cmdFull);
      const isDtmf = /^[0-9]$/.test(extension) || extension === 'i' || extension === 't';
      const isS    = extension.toLowerCase() === 's';

      if (isS) {
        tokens.push({
          type: 'extension_s',
          priority: /** @type {Priority} */ (priority),
          label,
          application,
          args,
          hasParens,
          lineNumber,
        });
      } else if (isDtmf) {
        tokens.push({
          type: 'extension_dtmf',
          digit: extension,
          priority: /** @type {Priority} */ (priority),
          application,
          args,
          hasParens,
          lineNumber,
        });
      } else {
        // Named extension other than 's' — emit as unknown (not standard IVR pattern)
        tokens.push({ type: 'unknown', raw: line, lineNumber });
      }
      continue;
    }

    // Directive: word => value  (include =>, same =>, etc.)
    // Must NOT be 'exten' — already handled above
    const directiveMatch = line.match(/^(\w+)\s*=>\s*(.+)$/);
    if (directiveMatch && directiveMatch[1].toLowerCase() !== 'exten') {
      tokens.push({
        type: 'directive',
        name: directiveMatch[1].toLowerCase(),
        value: directiveMatch[2].trim(),
        lineNumber,
      });
      continue;
    }

    // Fallback
    tokens.push({ type: 'unknown', raw: line, lineNumber });
  }

  return tokens;
}
