/**
 * diffLines.js — algoritmo LCS (Longest Common Subsequence) para diff de linhas.
 *
 * Sem dependências externas. Adequado para arquivos .conf de centenas de linhas
 * (complexidade O(m×n) em tempo e espaço — 500×500 = 250.000 células: < 1ms).
 *
 * API:
 *   diffLines(originalText, exportedText) → DiffLine[]
 *   computeStats(diff) → DiffStats
 *
 * DiffLine: { type: 'equal'|'insert'|'delete', line: string, cosmetic: boolean }
 *   cosmetic = true quando a linha é em branco ou difere apenas em espaçamento.
 *
 * DiffStats: { equal, inserted, deleted, total, fidelity }
 */

// ── LCS table ────────────────────────────────────────────────────────────────

function buildLCS(a, b) {
  const m = a.length;
  const n = b.length;
  // Usa Uint32Array por performance (evita boxing de inteiros)
  const row = new Uint32Array(n + 1);
  // Guarda a tabela completa para backtracking
  const dp = new Array(m + 1);
  dp[0] = new Uint32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    dp[i] = row.slice();
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

// ── Backtrack ─────────────────────────────────────────────────────────────────

function isCosmetic(line) {
  return line.trim() === '';
}

function isCosmeticChange(lineA, lineB) {
  // Muda apenas espaçamento
  return lineA.trim() === lineB.trim();
}

function backtrack(dp, a, b) {
  const result = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'equal', line: a[i - 1], cosmetic: isCosmetic(a[i - 1]) });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'insert', line: b[j - 1], cosmetic: isCosmetic(b[j - 1]) });
      j--;
    } else {
      result.push({ type: 'delete', line: a[i - 1], cosmetic: isCosmetic(a[i - 1]) });
      i--;
    }
  }

  result.reverse();

  // Pós-processamento: pares delete+insert adjacentes onde o conteúdo trim() é
  // igual são marcados como cosmetic (mudança de espaçamento apenas)
  for (let k = 0; k < result.length - 1; k++) {
    if (result[k].type === 'delete' && result[k + 1].type === 'insert') {
      if (isCosmeticChange(result[k].line, result[k + 1].line)) {
        result[k].cosmetic = true;
        result[k + 1].cosmetic = true;
      }
    }
  }

  return result;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Compara dois textos linha-a-linha usando LCS.
 * Retorna array de DiffLine com type, line e cosmetic.
 */
export function diffLines(originalText, exportedText) {
  // Normaliza terminações de linha
  const a = originalText.replace(/\r\n/g, '\n').split('\n');
  const b = exportedText.replace(/\r\n/g, '\n').split('\n');

  if (originalText === exportedText) {
    return a.map((line) => ({ type: 'equal', line, cosmetic: isCosmetic(line) }));
  }

  const dp = buildLCS(a, b);
  return backtrack(dp, a, b);
}

/**
 * Calcula estatísticas do diff.
 * skipCosmetic = true → não conta diferenças cosméticas.
 */
export function computeStats(diff, skipCosmetic = false) {
  let equal    = 0;
  let inserted = 0;
  let deleted  = 0;

  for (const item of diff) {
    if (skipCosmetic && item.cosmetic && item.type !== 'equal') continue;
    if (item.type === 'equal')  equal++;
    if (item.type === 'insert') inserted++;
    if (item.type === 'delete') deleted++;
  }

  const total     = equal + Math.max(inserted, deleted);
  const fidelity  = total === 0 ? 100 : Math.round((equal / total) * 100);

  return { equal, inserted, deleted, total, fidelity };
}
