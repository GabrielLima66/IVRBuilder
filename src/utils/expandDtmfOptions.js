/**
 * expandDtmfOptions.js — Fase 6 do pipeline de importação.
 *
 * Aplica a regra seletiva de 3 níveis para cada opção DTMF:
 *
 *  INLINE (opção simples) — 0 ações reais:
 *    Só Goto / Queue / Dial / Hangup / Macro de fallback → mantém finalDestination
 *    no MenuNode e deixa o compilador emitir diretamente.
 *
 *  MINI-EDITOR (opção intermediária) — 1 ação real:
 *    A ação fica em actions[] no MenuNode; o usuário pode editar via ✏.
 *    O compilador emite via hasStoredData path sem criar ContextNode.
 *
 *  CONTEXTNODE (opção complexa) — 2+ ações reais:
 *    Set, AGI, Playback, Background, ExecIfTime, GotoIfTime, SIPAddHeader → cria
 *    um ContextNode virtual com data.expandedFrom = menuNodeId.
 *    O compilador injeta as linhas desse contexto inline no bloco do pai.
 *
 * Macro(sayDigit) e Macro(logIvr,ENTER_CONTEXT) NÃO chegam aqui —
 * já foram filtrados pelo confResolver.processOptionLines.
 */

import { uid }                     from './common.js';
import { generateUniqueContextName } from './contextUtils.js';
import { buildNode }               from './buildNode.js';

/** Prefixo fixo para contextos virtuais gerados automaticamente na importação */
const DTMF_CTX_PREFIX = 'rcx-ivr';

/** Estilo visual das edges geradas (verde neon padrão) */
const EDGE_GREEN = {
  style:     { stroke: '#00ff41', strokeWidth: 1.5 },
  markerEnd: { type: 'arrowclosed', color: '#00ff41' },
};

/** Largura dos nós filhos dentro dos virtual contexts */
const CHILD_W = 280;

/**
 * Tipos de ação que tornam uma opção DTMF "complexa", exigindo ContextNode.
 * Macros de boilerplate (sayDigit, logIvr) já foram filtrados pelo resolver.
 * Ações de roteamento puro (route/hangup/dial/macro-de-fallback) NÃO contam.
 */
const REAL_ACTION_TYPES = new Set([
  'set', 'agi', 'playback', 'background', 'execiftime', 'time', 'sipaddheader',
]);

/**
 * Conta as ações "reais" (transformativas) de uma opção.
 * 0 → inline | 1 → mini-editor | 2+ → ContextNode
 *
 * @param {Array<{type: string}>} actions
 * @returns {number}
 */
function countRealActions(actions) {
  return (actions || []).filter((a) => REAL_ACTION_TYPES.has(a.type)).length;
}

/**
 * Retorna true se a opção deve virar ContextNode (2+ ações reais).
 * Opções com 1 ação real ficam no mini-editor (actions[] no MenuNode).
 */
function isComplexOption(actions) {
  return countRealActions(actions) >= 2;
}

// ── Helpers de construção de nós filhos ──────────────────────────────────────

function buildChildNodeFromAction(action, ctxId) {
  const childId  = `n_${uid()}`;
  const defaults = buildNode(action.type, { x: 20, y: 0 });
  return {
    ...defaults,
    id:         childId,
    data:       { ...(defaults.data || {}), ...(action.data || {}) },
    parentNode: ctxId,
    extent:     'parent',
    draggable:  false,
    position:   { x: 20, y: 0 },
    style:      { width: CHILD_W },
  };
}

function buildChildNodeFromFinalDest(fd, ctxId) {
  if (!fd) return null;
  const childId = `n_${uid()}`;

  if (fd.type === 'hangup') {
    return {
      ...buildNode('hangup', { x: 20, y: 0 }),
      id: childId, data: { causeCode: fd.causeCode || '' },
      parentNode: ctxId, extent: 'parent', expandParent: true, draggable: false,
      position: { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'queue') {
    return {
      ...buildNode('route', { x: 20, y: 0 }),
      id: childId,
      data: { routeMode: 'fila', queue: fd.ext || fd.ctx || '', queueOptions: '', context: '', extension: 's', priority: '1' },
      parentNode: ctxId, extent: 'parent', expandParent: true, draggable: false,
      position: { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'context') {
    return {
      ...buildNode('route', { x: 20, y: 0 }),
      id: childId,
      data: {
        routeMode: 'context', queue: '', queueOptions: '',
        context:   fd.contextName || '',
        extension: fd.ext || 's',
        priority:  fd.pri || '1',
        _argCount: fd.argCount || 3,
      },
      parentNode: ctxId, extent: 'parent', expandParent: true, draggable: false,
      position: { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'dial') {
    return {
      ...buildNode('dial', { x: 20, y: 0 }),
      id: childId,
      data: { destination: fd.target || '', timeout: fd.timeout || '30', options: '' },
      parentNode: ctxId, extent: 'parent', expandParent: true, draggable: false,
      position: { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'playback_only') {
    return {
      ...buildNode('playback', { x: 20, y: 0 }),
      id: childId,
      data: { filename: fd.filename || '', label: '' },
      parentNode: ctxId, extent: 'parent', expandParent: true, draggable: false,
      position: { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  return null;
}

// ── Criação de um virtual context ─────────────────────────────────────────────

function createVirtualCtx(menuNodeId, extId, actions, finalDest, logIvrLabel, parentCtxName, existingCtxNames, exportOrder) {
  const cleanParent = (parentCtxName || 'menu').replace(/^(orpen-ivr-|rcx-ivr-)/, '');
  const lbl         = logIvrLabel || `${cleanParent}-op-${extId}`;
  const baseName    = `${DTMF_CTX_PREFIX}-${lbl}`;
  const uniqueName  = generateUniqueContextName(baseName, existingCtxNames);
  existingCtxNames.push(uniqueName);

  const ctxId      = `n_${uid()}`;
  const childOrder = [];
  const childNodes = [];

  for (const action of (actions || [])) {
    const child = buildChildNodeFromAction(action, ctxId);
    childOrder.push(child.id);
    childNodes.push(child);
  }

  const destChild = buildChildNodeFromFinalDest(finalDest, ctxId);
  if (destChild) {
    childOrder.push(destChild.id);
    childNodes.push(destChild);
  }

  const ctxNode = {
    id:       ctxId,
    type:     'context',
    position: { x: 0, y: 0 }, // arrangeContextNodes reposiciona via expandedFrom
    data: {
      contextName:   uniqueName,
      childOrder,
      exportOrder,
      isDraft:       false,
      expandedFrom:  menuNodeId,
      expandedDigit: extId,
    },
    style:  { width: 320, height: 54 },
    zIndex: -1,
  };

  return { ctxNode, childNodes, uniqueName };
}

// ── Sanitização de segurança ──────────────────────────────────────────────────

/**
 * Garante que todo nó filho (não-context, não-config) tenha um parentNode
 * válido apontando para um ContextNode existente no array.
 * Se algum nó estiver órfão, cria um ContextNode placeholder (isDraft: true)
 * e agrupa os órfãos dentro dele — nenhum nó é descartado.
 *
 * @param {import('reactflow').Node[]} nodes
 * @returns {import('reactflow').Node[]}
 */
function sanitizeOrphanNodes(nodes) {
  const ctxIds = new Set(nodes.filter((n) => n.type === 'context').map((n) => n.id));

  const orphans = nodes.filter(
    (n) => n.type !== 'context' && n.type !== 'config' && (!n.parentNode || !ctxIds.has(n.parentNode))
  );

  if (orphans.length === 0) return nodes;

  console.warn('[expandDtmfOptions] corrigindo', orphans.length, 'nó(s) órfão(s):', orphans.map((n) => `${n.id}(${n.type})`));

  const placeholderId = `n_orphan_${uid()}`;
  const maxOrder = nodes
    .filter((n) => n.type === 'context')
    .reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);

  const placeholderCtx = {
    id:       placeholderId,
    type:     'context',
    position: { x: 40, y: 40 },
    data: {
      contextName: `_orfaos`,
      childOrder:  orphans.map((n) => n.id),
      exportOrder: maxOrder + 1,
      isDraft:     true,  // não exportado pelo compilador
    },
    style:  { width: 320, height: 54 },
    zIndex: -1,
  };

  const orphanSet = new Set(orphans.map((n) => n.id));
  const fixedNodes = nodes.map((n) => {
    if (!orphanSet.has(n.id)) return n;
    return {
      ...n,
      parentNode: placeholderId,
      extent:     'parent',
      draggable:  false,
      position:   { x: 20, y: 34 + orphans.indexOf(n) * 80 },
    };
  });

  return [placeholderCtx, ...fixedNodes];
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Aplica a regra seletiva de 3 níveis para todas as opções DTMF e sanitiza
 * nós órfãos que possam ter sido criados em fases anteriores.
 *
 * Chamada após a Fase 5 (build) do pipeline de importação.
 *
 * @param {import('reactflow').Node[]} nodes
 * @param {import('reactflow').Edge[]} edges
 * @returns {{ nodes: import('reactflow').Node[], edges: import('reactflow').Edge[] }}
 */
export function expandDtmfOptions(nodes, edges) {
  const resNodes = [...nodes];
  const resEdges = [...edges];

  const existingCtxNames = nodes
    .filter((n) => n.type === 'context')
    .map((n) => n.data?.contextName || '');

  const menuNodes = nodes.filter((n) => n.type === 'menu');

  for (const menuNode of menuNodes) {
    const parentCtxName = menuNode.data?.contextName || '';
    let optIdx = 0;

    const maxOrderBase = () => resNodes
      .filter((n) => n.type === 'context')
      .reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);

    // ── Expande cada dígito numérico (somente se complexo) ────────────────────
    const newDigits = (menuNode.data?.digits || []).map((d) => {
      if (d.expandedToContextId) return d; // já expandido (sessão anterior)

      const complex = isComplexOption(d.actions);
      if (!complex) return d; // opção simples → fica inline, preserva finalDestination

      const { ctxNode, childNodes, uniqueName } = createVirtualCtx(
        menuNode.id, d.id, d.actions, d.finalDestination, d.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrderBase() + ++optIdx,
      );

      // Remove cross-ref existente para este handle (substituído pela edge ao virtual ctx)
      const oldIdx = resEdges.findIndex((e) => e.source === menuNode.id && e.sourceHandle === `d-${d.id}`);
      if (oldIdx >= 0) resEdges.splice(oldIdx, 1);

      resEdges.push({
        id:           `e-ref-${uid()}`,
        source:       menuNode.id,
        sourceHandle: `d-${d.id}`,
        target:       ctxNode.id,
        targetHandle: 'ctx-in',
        type:         'floating',
        data:         { offsetX: 0, offsetY: 0 },
        animated:     false,
        ...EDGE_GREEN,
      });

      resNodes.push(ctxNode);
      for (const child of childNodes) resNodes.push(child);

      return {
        ...d,
        actions:               [],
        finalDestination:      null,
        expandedToContextId:   ctxNode.id,
        expandedToContextName: uniqueName,
        expandedChildCount:    childNodes.length,
      };
    });

    // ── invalidOption → d-i (somente se complexa) ────────────────────────────
    let newInvalidOption = menuNode.data?.invalidOption ?? null;
    const iOpt = menuNode.data?.invalidOption;
    if (iOpt && isComplexOption(iOpt.actions)) {
      const { ctxNode, childNodes } = createVirtualCtx(
        menuNode.id, 'i', iOpt.actions, iOpt.finalDestination, iOpt.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrderBase() + ++optIdx,
      );
      const oldIdx = resEdges.findIndex((e) => e.source === menuNode.id && e.sourceHandle === 'd-i');
      if (oldIdx >= 0) resEdges.splice(oldIdx, 1);
      resEdges.push({
        id: `e-ref-${uid()}`, source: menuNode.id, sourceHandle: 'd-i',
        target: ctxNode.id, targetHandle: 'ctx-in',
        type: 'floating', data: { offsetX: 0, offsetY: 0 }, animated: false, ...EDGE_GREEN,
      });
      resNodes.push(ctxNode);
      for (const child of childNodes) resNodes.push(child);
      newInvalidOption = { ...iOpt, actions: [], finalDestination: null };
    }

    // ── timeoutOption → d-t (somente se complexa) ────────────────────────────
    let newTimeoutOption = menuNode.data?.timeoutOption ?? null;
    const tOpt = menuNode.data?.timeoutOption;
    if (tOpt && isComplexOption(tOpt.actions)) {
      const { ctxNode, childNodes } = createVirtualCtx(
        menuNode.id, 't', tOpt.actions, tOpt.finalDestination, tOpt.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrderBase() + ++optIdx,
      );
      const oldIdx = resEdges.findIndex((e) => e.source === menuNode.id && e.sourceHandle === 'd-t');
      if (oldIdx >= 0) resEdges.splice(oldIdx, 1);
      resEdges.push({
        id: `e-ref-${uid()}`, source: menuNode.id, sourceHandle: 'd-t',
        target: ctxNode.id, targetHandle: 'ctx-in',
        type: 'floating', data: { offsetX: 0, offsetY: 0 }, animated: false, ...EDGE_GREEN,
      });
      resNodes.push(ctxNode);
      for (const child of childNodes) resNodes.push(child);
      newTimeoutOption = { ...tOpt, actions: [], finalDestination: null };
    }

    // ── Atualiza o MenuNode no array ──────────────────────────────────────────
    const menuIdx = resNodes.findIndex((n) => n.id === menuNode.id);
    if (menuIdx >= 0) {
      resNodes[menuIdx] = {
        ...resNodes[menuIdx],
        data: {
          ...resNodes[menuIdx].data,
          digits:        newDigits,
          invalidOption: newInvalidOption,
          timeoutOption: newTimeoutOption,
        },
      };
    }
  }

  // Sanitização final: garante que não existam nós órfãos no estado retornado
  return { nodes: sanitizeOrphanNodes(resNodes), edges: resEdges };
}
