/**
 * confImporter.js — orquestrador do pipeline de importação .conf de 5 fases.
 *
 * Fases:
 *  1. lex()             → Token[]
 *  2. map()             → RawContext[]
 *  3. resolve()         → ResolvedGraph
 *  4. calculateLayout() → LayoutResult
 *  5. build()           → { nodes, edges }
 *
 * Após o build, realiza round-trip validation: gera .conf a partir dos nós/edges
 * e compara com o original para calcular a fidelidade da importação.
 *
 * @typedef {Object} ImportResult
 * @property {{ nodes: Object[], edges: Object[] }} flowState   pronto para abrir no canvas
 * @property {Object} graph                                      ResolvedGraph (debug)
 * @property {Object} validation                                 métricas de round-trip
 * @property {import('./confLexer.js').Token[]} tokens           tokens da fase 1 (debug)
 * @property {import('./confMapper.js').RawContext[]} rawContexts contextos mapeados (debug)
 * @property {string} suggestedName                              nome sugerido para o projeto
 * @property {Object} stats                                      estatísticas para o modal
 */

import { lex }             from './confLexer.js';
import { map }             from './confMapper.js';
import { resolve }         from './confResolver.js';
import { calculateLayout } from './confLayout.js';
import { build, validateImportedState } from './confBuilder.js';
import { expandDtmfOptions } from '../expandDtmfOptions.js';
import { generateDialplan } from '../asteriskExporter.js';
import { resetUnknownCommands, getUnknownCommands } from './unknownCommandsLog.js';

/**
 * Importa um arquivo .conf de Asterisk e produz o estado completo do canvas.
 *
 * @param {string} rawContent  conteúdo bruto do arquivo .conf
 * @returns {ImportResult}
 */
export function importConf(rawContent) {
  // Limpa log de comandos desconhecidos antes de cada importação
  resetUnknownCommands();

  // ── Fase 1: Lexer ──────────────────────────────────────────────────────────
  const tokens = lex(rawContent);

  // ── Fase 2: Mapper ─────────────────────────────────────────────────────────
  const rawContexts = map(tokens);

  // ── Fase 3: Resolver ───────────────────────────────────────────────────────
  const graph = resolve(rawContexts);

  // ── Fase 4: Layout ─────────────────────────────────────────────────────────
  const layout = calculateLayout(graph);

  // ── Fase 5: Builder ────────────────────────────────────────────────────────
  const {
    nodes: builtNodes,
    edges: builtEdges,
    contextNameRenames = [],
    orphanCount: builderOrphans = 0,
  } = build(graph, layout);

  // ── Fase 6: Expansão DTMF ─────────────────────────────────────────────────
  const { nodes, edges } = expandDtmfOptions(builtNodes, builtEdges);
  const flowState = { nodes, edges };

  // ── Fase 7: Validação de integridade final ────────────────────────────────
  // Inclui os nós criados pela Fase 6 (virtual contexts e seus filhos).
  const integrityResult = validateImportedState(nodes);
  const orphanCount      = integrityResult.orphanCount;
  if (orphanCount > 0) {
    console.error('[confImporter] nós órfãos detectados após Fase 6:', integrityResult.orphanIds);
  }

  // ── Round-trip validation ──────────────────────────────────────────────────
  const validation = roundTrip(flowState, rawContent);

  const baseStats = graph.stats || {
    contexts: rawContexts.length,
    nodesByType: {},
    commented: [],
    raw: [],
    unresolvedRefs: [],
  };

  return {
    flowState,
    graph,
    validation,
    tokens,
    rawContexts,
    suggestedName: graph.suggestedName || 'projeto-importado',
    stats: {
      ...baseStats,
      contextNameRenames,
      unknownCommands: getUnknownCommands(),
      orphanCount,          // ← exibido no modal de resumo se > 0
    },
  };
}

// ── Round-trip validation ─────────────────────────────────────────────────────

/**
 * Generates .conf from imported nodes/edges and compares with the original.
 * Returns fidelity metrics for display in the import modal.
 *
 * @param {{ nodes: Object[], edges: Object[] }} flowState
 * @param {string} originalContent
 * @returns {{ fidelity: number, preserved: number, lost: string[], added: string[], total: number }}
 */
function roundTrip(flowState, originalContent) {
  let generated = '';
  try {
    generated = generateDialplan(flowState.nodes, flowState.edges);
  } catch (e) {
    // If generation fails, return zero fidelity
    return { fidelity: 0, preserved: 0, lost: [], added: [], total: 0, error: String(e) };
  }

  // Normalize both sides: trim, remove blanks, skip section headers (;;) and timestamps
  const normalize = (text) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (l.startsWith(';;')) return false;
        return true;
      });

  const originalLines  = normalize(originalContent);
  const generatedLines = normalize(generated);

  const origSet = new Set(originalLines);
  const genSet  = new Set(generatedLines);

  const preserved = originalLines.filter((l) => genSet.has(l));
  const lost      = originalLines.filter((l) => !genSet.has(l));
  const added     = generatedLines.filter((l) => !origSet.has(l));

  const total    = originalLines.length;
  const fidelity = total > 0 ? Math.round((preserved.length / total) * 100) : 100;

  return {
    fidelity,
    preserved: preserved.length,
    lost,
    added,
    total,
  };
}
