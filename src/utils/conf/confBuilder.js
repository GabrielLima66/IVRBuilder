/**
 * confBuilder.js — fase 5 do pipeline de importação .conf.
 * Constrói os arrays React Flow Node[] e Edge[] a partir do ResolvedGraph + LayoutResult.
 *
 * Regras de CLAUDE.md respeitadas:
 *  - DTMF handles (d-*) usam type: 'floating'
 *  - ctx-in como targetHandle para edges apontando a ContextNodes
 *  - Filho sempre depois do pai no array nodes
 *  - draggable: false em filhos de ContextNode
 *  - zIndex: -1 em ContextNodes
 */

import { uid } from '../common.js';
import { generateUniqueContextName } from '../contextUtils.js';

// ── Constantes de aparência de edges ─────────────────────────────────────────

const EDGE_GREEN  = { style: { stroke: '#00ff41', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#00ff41' } };
const EDGE_YELLOW = { style: { stroke: '#ffcc00', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#ffcc00' } };
const EDGE_ORANGE = { style: { stroke: '#ff8c00', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#ff8c00' } };

/**
 * Returns edge appearance for a given color key.
 * @param {'green'|'yellow'|'dtmf'|'orange'} color
 */
function edgeAppearance(color) {
  if (color === 'yellow') return EDGE_YELLOW;
  if (color === 'orange') return EDGE_ORANGE;
  return EDGE_GREEN; // 'green' and 'dtmf' both use green
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Builds React Flow nodes and edges from the resolved graph + calculated layout.
 *
 * @param {import('./confResolver.js').ResolvedGraph & { unresolvedRefs: string[], stats: Object }} graph
 * @param {import('./confLayout.js').LayoutResult} layout
 * @returns {{ nodes: Object[], edges: Object[] }}
 */
export function build(graph, layout) {
  const { globalConfig, contexts, crossRefs, isRealGlobalConfig } = graph;
  const { configPosition, contextLayouts }    = layout;

  /** @type {Object[]} */
  const nodes = [];
  /** @type {Object[]} */
  const edges = [];

  // ── Deduplicate context names ─────────────────────────────────────────────
  // Collect and rename any duplicate contextName before building nodes.
  // Renames are logged for display in the import modal.
  /** @type {{ from: string, to: string }[]} */
  const contextNameRenames = [];
  const seenNames = [];
  const deduplicatedContexts = contexts.map((ctx) => {
    const unique = generateUniqueContextName(ctx.name, seenNames);
    seenNames.push(unique);
    if (unique !== ctx.name) {
      contextNameRenames.push({ from: ctx.name, to: unique });
      return { ...ctx, name: unique };
    }
    return ctx;
  });

  // ── GlobalConfigNode ──────────────────────────────────────────────────────
  const configId = `n_${uid()}`;
  nodes.push({
    id:       configId,
    type:     'config',
    position: configPosition,
    data: {
      ivr:                 globalConfig.ivr          || '0000',
      soundPath:           globalConfig.soundPath     || '',
      agiPath:             globalConfig.agiPath       || '',
      language:            globalConfig.language      || 'pt_BR',
      comment:             globalConfig.comment       || '',
      numberDialed:        globalConfig.numberDialed  || false,
      logIvr:              globalConfig.logIvr        || false,
      customerAgi:         false,
      // false = primeiro contexto é real contexto IVR, não bloco de config.
      // O compilador usa isso para suprimir a emissão do bloco [rcx-ivr-XXXX].
      _isRealGlobalConfig: isRealGlobalConfig !== false,
    },
  });

  // ── ContextNodes + children ──────────────────────────────────────────────
  // Index: contextName → { ctxNodeId, childNodeIds[] }
  const ctxIndex = {};
  let firstCtxId = null;

  for (let ci = 0; ci < deduplicatedContexts.length; ci++) {
    const ctx           = deduplicatedContexts[ci];
    const ctxLayout     = contextLayouts[ci];
    const childNodeIds  = [];
    /** sequential ids (excludes macro-for-i/t nodes which are off the main chain) */
    const sequential    = [];
    /** map from nodeIdx → React Flow node id */
    const nodeIdByIdx   = {};

    // Push ContextNode first (parent before children per CLAUDE.md rule 6)
    nodes.push({
      id:       ctx.id,
      type:     'context',
      position: ctxLayout.position,
      data:     {
        // Garante que contextName nunca seja vazio — o cabeçalho sempre mostra algum texto
        contextName: ctx.name || `ctx-${ctx.id.slice(-6)}`,
        childOrder:  [], // will be filled after children are created
        exportOrder: ci + 1, // sequencial baseado na ordem do arquivo importado
        isDraft:     false,
        ...(ctx.isMacro ? { isMacro: true } : {}),
      },
      style:    { width: ctxLayout.width, height: ctxLayout.height },
      zIndex:   -1,
    });

    if (ci === 0) firstCtxId = ctx.id;

    // Push children
    // childWidth: largura calculada para os filhos = ctxWidth - 2×CTX_PAD_H
    // Definida no style para que o ContextNode.jsx não precise recalcular no
    // primeiro render (evita salto visual e sobreposição entre contextos).
    const childW = ctxLayout.childWidth ?? (ctxLayout.width - 40);

    for (let ni = 0; ni < ctx.childNodes.length; ni++) {
      const childSpec = ctx.childNodes[ni];
      // Fallback seguro: y mínimo = 60 (CTX_HEADER_H=34 + CTX_PAD_TOP=26) para nunca sobrepor o cabeçalho
      const pos       = ctxLayout.childPositions[ni] || { x: 20, y: 60 + ni * 80 };
      const nid       = `n_${uid()}`;
      nodeIdByIdx[ni] = nid;

      const nodeObj = {
        id:         nid,
        type:       childSpec.type,
        position:   { x: pos.x, y: pos.y },
        data:       childSpec.commented
          ? { ...childSpec.data, _commented: true, _origLine: childSpec.origLine || '' }
          : { ...childSpec.data },
        parentNode: ctx.id,
        extent:     'parent',
        draggable:  false,
        // Largura explícita para que o filho preencha o contexto imediatamente
        style:      { width: childW },
      };

      nodes.push(nodeObj);
      childNodeIds.push(nid);

      // Only include in sequential order if not a dtmf-linked stray node
      if (!childSpec._dtmfMacroFor && !childSpec._dtmfDirectFor) {
        sequential.push(nid);
      }
    }

    // Update childOrder on the ContextNode we already pushed
    const ctxNode = nodes.find((n) => n.id === ctx.id);
    if (ctxNode) ctxNode.data.childOrder = [...sequential];

    // Sequential edges between children inside this context
    for (let si = 0; si < sequential.length - 1; si++) {
      // Don't add sequential edge FROM a menu node's menu entry to the next child —
      // the next child after MenuNode is a macro node for i/t which doesn't have a sequential flow link
      const srcNode = nodes.find((n) => n.id === sequential[si]);
      if (srcNode?.type === 'menu') continue;

      edges.push({
        id:           `e-${sequential[si]}-${sequential[si + 1]}`,
        source:       sequential[si],
        sourceHandle: 'out',
        target:       sequential[si + 1],
        targetHandle: 'in',
        type:         'floating',
        data:         { offsetX: 0, offsetY: 0 },
        ...EDGE_GREEN,
      });
    }

    // Add edges from menu d-i/d-t/d-N to their linked child nodes (macros for i/t, routes for Queue digits)
    for (let ni = 0; ni < ctx.childNodes.length; ni++) {
      const childSpec = ctx.childNodes[ni];
      if (!childSpec._menuNodeMarker) continue;

      const menuNid = nodeIdByIdx[ni];

      for (let mi = ni + 1; mi < ctx.childNodes.length; mi++) {
        const macroSpec = ctx.childNodes[mi];
        if (!macroSpec._dtmfMacroFor && !macroSpec._dtmfDirectFor) continue;
        const macroNid  = nodeIdByIdx[mi];
        const digit     = macroSpec._dtmfMacroFor || macroSpec._dtmfDirectFor;
        const app       = macroSpec._dtmfMacroFor ? EDGE_ORANGE : EDGE_GREEN;

        edges.push({
          id:           `e-ref-${uid()}`,
          source:       menuNid,
          sourceHandle: `d-${digit}`,
          target:       macroNid,
          targetHandle: 'in',
          type:         'floating',
          data:         { offsetX: 0, offsetY: 0 },
          ...app,
        });
      }
    }

    ctxIndex[ctx.name] = { ctxNodeId: ctx.id, nodeIdByIdx };
  }

  // ── Edge GlobalConfig → first ContextNode ─────────────────────────────────
  // Criada apenas quando o primeiro contexto era realmente um GlobalConfig (tem SOUND_PATH/AGI_PATH).
  // Quando o arquivo não tem bloco de config separado (ex: [ura-principal-sac] é o próprio entry),
  // não criamos a edge — o compilador não deve emitir [rcx-ivr-XXXX] redundante.
  if (firstCtxId && isRealGlobalConfig !== false) {
    edges.push({
      id:           `e-cfg-${firstCtxId}`,
      source:       configId,
      sourceHandle: 'out',
      target:       firstCtxId,
      targetHandle: 'ctx-in',
      type:         'floating',
      data:         { offsetX: 0, offsetY: 0 },
      ...EDGE_GREEN,
    });
  }

  // ── Cross-context edges ───────────────────────────────────────────────────
  // Track already-created edges to avoid duplicates
  const edgeKeys = new Set(edges.map((e) => `${e.source}|${e.sourceHandle}|${e.target}`));

  for (const ref of crossRefs) {
    const ctxName = (ref.targetCtxName || '').trim();
    if (!ctxName || ctxName.length <= 1 || /^\d+$/.test(ctxName)) continue;

    const srcCtxEntry = ctxIndex[ref.sourceCtxName];
    if (!srcCtxEntry) continue;

    const srcNid = srcCtxEntry.nodeIdByIdx[Number(ref.sourceNodeIdx)];
    if (!srcNid) continue;

    const tgtCtxEntry = ctxIndex[ctxName];
    if (!tgtCtxEntry) continue; // unresolved — skip

    const tgtId = tgtCtxEntry.ctxNodeId;
    const key   = `${srcNid}|${ref.sourceHandle}|${tgtId}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);

    const app = edgeAppearance(ref.color);
    edges.push({
      id:           `e-ref-${uid()}`,
      source:       srcNid,
      sourceHandle: ref.sourceHandle,
      target:       tgtId,
      targetHandle: 'ctx-in',
      type:         'floating',
      data:         { offsetX: 0, offsetY: 0 },
      animated:     false,
      ...app,
    });
  }

  // ── Fase 5: Validação de integridade ─────────────────────────────────────
  const { orphanCount, orphanIds } = validateImportedState(nodes);
  if (orphanCount > 0) {
    console.error('[confBuilder] IMPORT VALIDATION: nós órfãos detectados', orphanIds);
  }

  return { nodes, edges, contextNameRenames, orphanCount, orphanIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO DE INTEGRIDADE
// Detecta nós que não são ContextNode nem ConfigNode mas não têm parentNode
// válido apontando para um ContextNode existente no array.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se todos os nós filho possuem parentNode válido.
 *
 * @param {import('reactflow').Node[]} nodes
 * @returns {{ valid: boolean, orphanCount: number, orphanIds: string[] }}
 */
export function validateImportedState(nodes) {
  const contextIds = new Set(
    nodes.filter((n) => n.type === 'context').map((n) => n.id)
  );

  const orphanNodes = nodes.filter(
    (n) =>
      n.type !== 'context' &&
      n.type !== 'config' &&
      (!n.parentNode || !contextIds.has(n.parentNode))
  );

  return {
    valid:       orphanNodes.length === 0,
    orphanCount: orphanNodes.length,
    orphanIds:   orphanNodes.map((n) => `${n.id}(${n.type})`),
  };
}
