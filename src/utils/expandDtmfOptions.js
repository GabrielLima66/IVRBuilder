/**
 * expandDtmfOptions.js — Fase 6 do pipeline de importação.
 *
 * Converte automaticamente cada opção DTMF de um MenuNode em um ContextNode
 * independente no canvas ("virtual context"). Esses contextos têm o campo
 * data.expandedFrom = menuNodeId, o que instrui o compilador a injetar suas
 * linhas inline no bloco do contexto pai, sem emitir um [bloco] próprio.
 *
 * A função é pura: recebe nodes + edges e retorna { nodes, edges } atualizados.
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
      id:         childId,
      data:       { causeCode: fd.causeCode || '' },
      parentNode: ctxId, extent: 'parent', draggable: false,
      position:   { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'queue') {
    return {
      ...buildNode('route', { x: 20, y: 0 }),
      id:         childId,
      data:       { routeMode: 'fila', queue: fd.ext || fd.ctx || '', queueOptions: '', context: '', extension: 's', priority: '1' },
      parentNode: ctxId, extent: 'parent', draggable: false,
      position:   { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'context') {
    // Preserva argCount para round-trip de fidelidade
    return {
      ...buildNode('route', { x: 20, y: 0 }),
      id:         childId,
      data:       {
        routeMode: 'context', queue: '', queueOptions: '',
        context:   fd.contextName || '',
        extension: fd.ext || 's',
        priority:  fd.pri || '1',
        _argCount: fd.argCount || 3,
      },
      parentNode: ctxId, extent: 'parent', draggable: false,
      position:   { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'dial') {
    return {
      ...buildNode('dial', { x: 20, y: 0 }),
      id:         childId,
      data:       { destination: fd.target || '', timeout: fd.timeout || '30', options: '' },
      parentNode: ctxId, extent: 'parent', draggable: false,
      position:   { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  if (fd.type === 'playback_only') {
    return {
      ...buildNode('playback', { x: 20, y: 0 }),
      id:         childId,
      data:       { filename: fd.filename || '', label: '' },
      parentNode: ctxId, extent: 'parent', draggable: false,
      position:   { x: 20, y: 0 }, style: { width: CHILD_W },
    };
  }

  return null;
}

// ── Criação de um virtual context ─────────────────────────────────────────────

function createVirtualCtx(menuNodeId, extId, actions, finalDest, logIvrLabel, parentCtxName, existingCtxNames, exportOrder) {
  // Nome derivado de logIvrLabel ou fallback ctxName-op-digit
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
      contextName: uniqueName,
      childOrder,
      exportOrder,
      isDraft:     false,
      expandedFrom:  menuNodeId,  // instrui o compilador a injetar inline
      expandedDigit: extId,       // dígito da opção ('1','2','i','t', etc.)
    },
    style:  { width: 320, height: 54 },
    zIndex: -1,
  };

  return { ctxNode, childNodes, uniqueName };
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Expande todas as opções DTMF de todos os MenuNodes em ContextNodes virtuais.
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

  // Nomes existentes — crescem a cada virtual context criado
  const existingCtxNames = nodes
    .filter((n) => n.type === 'context')
    .map((n) => n.data?.contextName || '');

  const menuNodes = nodes.filter((n) => n.type === 'menu');

  for (const menuNode of menuNodes) {
    const parentCtxName = menuNode.data?.contextName || '';
    let optIdx = 0;

    // exportOrder base para os novos virtual contexts
    const maxOrder = resNodes
      .filter((n) => n.type === 'context')
      .reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);

    // ── Expande cada dígito numérico ──────────────────────────────────────────
    const newDigits = (menuNode.data?.digits || []).map((d) => {
      const hasContent = (Array.isArray(d.actions) && d.actions.length > 0) || d.finalDestination != null;
      if (!hasContent || d.expandedToContextId) return d; // já expandido ou vazio

      const { ctxNode, childNodes, uniqueName } = createVirtualCtx(
        menuNode.id, d.id, d.actions, d.finalDestination, d.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrder + ++optIdx,
      );

      // Remove edge existente para este handle (cross-ref de _dtmfGotos)
      const oldIdx = resEdges.findIndex((e) => e.source === menuNode.id && e.sourceHandle === `d-${d.id}`);
      if (oldIdx >= 0) resEdges.splice(oldIdx, 1);

      // Nova edge: menu d-{digit} → virtual context ctx-in
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

      // Pai antes dos filhos (regra CLAUDE.md)
      resNodes.push(ctxNode);
      for (const child of childNodes) resNodes.push(child);

      return {
        ...d,
        actions:             [],
        finalDestination:    null,
        expandedToContextId:   ctxNode.id,
        expandedToContextName: uniqueName,
        expandedChildCount:    childNodes.length,
      };
    });

    // ── Expande invalidOption → d-i ───────────────────────────────────────────
    let newInvalidOption = menuNode.data?.invalidOption ?? null;
    const iOpt = menuNode.data?.invalidOption;
    if (iOpt && ((Array.isArray(iOpt.actions) && iOpt.actions.length > 0) || iOpt.finalDestination != null)) {
      const maxOrder2 = resNodes.filter((n) => n.type === 'context').reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);
      const { ctxNode, childNodes } = createVirtualCtx(
        menuNode.id, 'i', iOpt.actions, iOpt.finalDestination, iOpt.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrder2 + ++optIdx,
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

    // ── Expande timeoutOption → d-t ───────────────────────────────────────────
    let newTimeoutOption = menuNode.data?.timeoutOption ?? null;
    const tOpt = menuNode.data?.timeoutOption;
    if (tOpt && ((Array.isArray(tOpt.actions) && tOpt.actions.length > 0) || tOpt.finalDestination != null)) {
      const maxOrder3 = resNodes.filter((n) => n.type === 'context').reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);
      const { ctxNode, childNodes } = createVirtualCtx(
        menuNode.id, 't', tOpt.actions, tOpt.finalDestination, tOpt.logIvrLabel,
        parentCtxName, existingCtxNames, maxOrder3 + ++optIdx,
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

  return { nodes: resNodes, edges: resEdges };
}
