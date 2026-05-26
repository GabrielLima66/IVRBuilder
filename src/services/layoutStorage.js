/**
 * layoutStorage.js — separação entre dados de dialplan e dados de layout.
 *
 * RESPONSABILIDADE:
 *   - extractLayout()     : extrai apenas dados visuais do estado React Flow
 *   - applyLayout()       : aplica posições de um URALayout sobre nós/edges gerados pelo parser
 *   - exportLayoutFile()  : gera e baixa o arquivo .layout.json
 *   - importLayoutFile()  : lê e valida um arquivo .layout.json
 *
 * ADAPTER PATTERN:
 *   LayoutStorageAdapter define a interface de persistência.
 *   IndexedDBLayoutAdapter é a implementação padrão (localStorage do browser).
 *   Para integração futura com servidor Asterisk, implemente AsteriskServerLayoutAdapter
 *   com os mesmos métodos save/load — sem alterar o restante do código.
 *
 * CHAVE DE LIGAÇÃO CONF ↔ LAYOUT:
 *   contextName: nome do contexto Asterisk (ex: "orpen-ivr-2900").
 *   Nós filhos: índice dentro do childOrder do contexto.
 *   Nós livres (config, etc.): nodeType (config é único por projeto).
 *   Edges com offset: chave semântica sourceKey+targetKey+handles.
 */

import { openDB } from './projectStorage';

export const LAYOUT_VERSION = '1.0';
const LAYOUT_STORE = 'layouts';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Lê width/height do nó a partir de style, measured ou campo direto. */
function getNodeDimensions(node) {
  return {
    width:  Number(node.style?.width  || node.measured?.width  || node.width  || 220),
    height: Number(node.style?.height || node.measured?.height || node.height || 60),
  };
}

/**
 * Constrói chave semântica para um nó — estável entre sessões (independe do id interno).
 *   ctx:{contextName}            — ContextNode
 *   free:{nodeType}              — nó sem parentNode e não-context (ex: config)
 *   child:{contextName}:{index}  — filho dentro de um ContextNode
 */
function buildNodeKey(node, nodes) {
  if (node.type === 'context') return `ctx:${node.data?.contextName || node.id}`;
  if (!node.parentNode)        return `free:${node.type}`;

  const parent = nodes.find((n) => n.id === node.parentNode);
  if (!parent) return `unknown:${node.id}`;

  const idx = (parent.data?.childOrder || []).indexOf(node.id);
  return `child:${parent.data?.contextName}:${idx}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai apenas os dados de layout do estado atual do React Flow.
 * Não inclui nenhum dado de dialplan (comandos, parâmetros, etc.).
 *
 * @param {import('reactflow').Node[]} nodes
 * @param {import('reactflow').Edge[]} edges
 * @param {{ x: number, y: number, zoom: number }} viewport
 * @param {string} confFileName — ex: "rcx-ivr-2900.conf"
 * @returns {URALayout}
 */
export function extractLayout(nodes, edges, viewport, confFileName = '') {
  const contextNodes = nodes.filter((n) => n.type === 'context');
  const freeNodes    = nodes.filter((n) => !n.parentNode && n.type !== 'context');

  const contexts = contextNodes.map((ctx) => {
    const { width, height } = getNodeDimensions(ctx);
    const childOrder        = ctx.data?.childOrder || [];
    const children          = childOrder
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean);

    return {
      contextName: ctx.data?.contextName || '',
      position:    { x: ctx.position.x, y: ctx.position.y },
      width,
      height,
      exportOrder: ctx.data?.exportOrder ?? 0,
      isDraft:     ctx.data?.isDraft     ?? false,
      childOrder,
      nodes: children.map((child) => {
        const dim = getNodeDimensions(child);
        return {
          internalId: child.id,
          nodeType:   child.type,
          position:   { x: child.position.x, y: child.position.y },
          width:      dim.width,
          height:     dim.height,
        };
      }),
    };
  });

  const freeNodeLayouts = freeNodes.map((n) => {
    const { width, height } = getNodeDimensions(n);
    return {
      internalId: n.id,
      nodeType:   n.type,
      position:   { x: n.position.x, y: n.position.y },
      width,
      height,
    };
  });

  // Somente edges com offset não-nulo são relevantes para o layout
  const edgeLayouts = edges
    .filter((e) => (e.data?.offsetX || 0) !== 0 || (e.data?.offsetY || 0) !== 0)
    .map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source);
      const tgtNode = nodes.find((n) => n.id === e.target);
      return {
        id:           e.id,
        sourceKey:    srcNode ? buildNodeKey(srcNode, nodes) : '',
        targetKey:    tgtNode ? buildNodeKey(tgtNode, nodes) : '',
        sourceHandle: e.sourceHandle || '',
        targetHandle: e.targetHandle || '',
        offsetX:      e.data?.offsetX || 0,
        offsetY:      e.data?.offsetY || 0,
      };
    });

  return {
    version:     LAYOUT_VERSION,
    confFile:    confFileName,
    generatedAt: new Date().toISOString(),
    viewport:    viewport || { x: 0, y: 0, zoom: 1 },
    contexts,
    freeNodes:   freeNodeLayouts,
    edges:       edgeLayouts,
  };
}

/**
 * Aplica as posições de um URALayout sobre um flowState gerado pelo parser.
 * A correspondência é feita por:
 *   - contextName          → ContextNodes
 *   - nodeType             → nós livres (config é único)
 *   - índice em childOrder → nós filhos dentro de cada contexto
 *
 * Nós sem correspondência no layout mantêm as posições do posicionamento automático.
 *
 * @param {import('reactflow').Node[]} nodes
 * @param {import('reactflow').Edge[]} edges
 * @param {URALayout} layout
 * @returns {{ nodes: Node[], edges: Edge[], viewport: object }}
 */
export function applyLayout(nodes, edges, layout) {
  if (!layout) return { nodes, edges };

  if (layout.version !== LAYOUT_VERSION) {
    console.warn(
      `[layoutStorage] versão ${layout.version} difere da esperada ${LAYOUT_VERSION} — aplicando mesmo assim`
    );
  }

  // Índices de lookup para performance
  const ctxByName  = {};
  const freeByType = {};
  for (const cl of (layout.contexts  || [])) ctxByName[cl.contextName] = cl;
  for (const fl of (layout.freeNodes || [])) freeByType[fl.nodeType]   = fl;

  // ── Primeira passagem: aplica posições ───────────────────────────────────
  const updatedNodes = nodes.map((n) => {
    // ContextNode: corresponde pelo contextName
    if (n.type === 'context') {
      const cl = ctxByName[n.data?.contextName];
      if (!cl) return n;
      return {
        ...n,
        position: { x: cl.position.x, y: cl.position.y },
        style: { ...(n.style || {}), width: cl.width, height: cl.height },
        data: {
          ...n.data,
          exportOrder: cl.exportOrder !== undefined ? cl.exportOrder : n.data?.exportOrder,
          isDraft:     cl.isDraft     !== undefined ? cl.isDraft     : n.data?.isDraft,
          // childOrder mantido do parser — possui os IDs corretos da sessão atual
        },
      };
    }

    // Nó livre (sem parentNode, não-context): corresponde pelo nodeType
    if (!n.parentNode) {
      const fl = freeByType[n.type];
      if (!fl) return n;
      return {
        ...n,
        position: { x: fl.position.x, y: fl.position.y },
      };
    }

    // Nó filho: corresponde pelo índice dentro do childOrder do contexto pai
    const parent = nodes.find((p) => p.id === n.parentNode);
    if (!parent) return n;
    const cl = ctxByName[parent.data?.contextName];
    if (!cl) return n;

    const childOrder = parent.data?.childOrder || [];
    const idx        = childOrder.indexOf(n.id);
    if (idx < 0 || idx >= cl.nodes.length) return n;

    const nl = cl.nodes[idx];
    // Sanity check: tipo deve bater (caso o .conf tenha sido modificado)
    if (!nl || nl.nodeType !== n.type) return n;

    return {
      ...n,
      position: { x: nl.position.x, y: nl.position.y },
    };
  });

  // ── Segunda passagem: aplica offsets de edges ────────────────────────────
  if (!(layout.edges || []).length) {
    return { nodes: updatedNodes, edges, viewport: layout.viewport };
  }

  const updatedEdges = edges.map((e) => {
    const srcNode = updatedNodes.find((n) => n.id === e.source);
    const tgtNode = updatedNodes.find((n) => n.id === e.target);
    if (!srcNode || !tgtNode) return e;

    const srcKey = buildNodeKey(srcNode, updatedNodes);
    const tgtKey = buildNodeKey(tgtNode, updatedNodes);

    const el = (layout.edges || []).find(
      (le) =>
        le.sourceKey    === srcKey &&
        le.targetKey    === tgtKey &&
        le.sourceHandle === (e.sourceHandle || '') &&
        le.targetHandle === (e.targetHandle || '')
    );

    if (!el) return e;
    return {
      ...e,
      data: { ...(e.data || {}), offsetX: el.offsetX, offsetY: el.offsetY },
    };
  });

  return { nodes: updatedNodes, edges: updatedEdges, viewport: layout.viewport };
}

/**
 * Gera e baixa o arquivo .layout.json.
 *
 * @param {URALayout} layout
 * @param {string} [baseName] — nome base sem extensão (sobrescreve layout.confFile)
 */
export function exportLayoutFile(layout, baseName) {
  const name    = baseName || layout.confFile?.replace(/\.conf$/, '') || 'ura-layout';
  const jsonStr = JSON.stringify(layout, null, 2);
  const blob    = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `${name}.layout.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Lê e valida um arquivo .layout.json.
 * Rejeita a Promise se o arquivo for inválido ou ilegível.
 *
 * @param {File} file
 * @returns {Promise<URALayout>}
 */
export function importLayoutFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.version || !Array.isArray(data.contexts)) {
          reject(new Error('arquivo .layout.json inválido ou incompatível'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('erro ao parsear arquivo .layout.json'));
      }
    };
    reader.onerror = () => reject(new Error('erro ao ler o arquivo'));
    reader.readAsText(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Pattern — ponto de extensão para integração futura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface de persistência de layout.
 *
 * Para integrar com o servidor Asterisk, implemente esta interface:
 *   class AsteriskServerLayoutAdapter extends LayoutStorageAdapter {
 *     async save(confFileName, layout) { await api.put(`/layouts/${confFileName}`, layout); }
 *     async load(confFileName) { return await api.get(`/layouts/${confFileName}`); }
 *   }
 *
 * Troque a instância padrão sem alterar nenhum outro arquivo:
 *   import { setLayoutAdapter } from './services/layoutStorage';
 *   setLayoutAdapter(new AsteriskServerLayoutAdapter());
 */
class LayoutStorageAdapter {
  /** @param {string} confFileName @param {URALayout} layout @returns {Promise<void>} */
  // eslint-disable-next-line no-unused-vars
  save(_confFileName, _layout) { throw new Error('não implementado'); }
  /** @param {string} confFileName @returns {Promise<URALayout|null>} */
  // eslint-disable-next-line no-unused-vars
  load(_confFileName) { throw new Error('não implementado'); }
}

// ── IndexedDBLayoutAdapter ────────────────────────────────────────────────────

class IndexedDBLayoutAdapter extends LayoutStorageAdapter {
  async save(confFileName, layout) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(LAYOUT_STORE, 'readwrite');
      const req = tx.objectStore(LAYOUT_STORE).put({ confFileName, ...layout });
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async load(confFileName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(LAYOUT_STORE, 'readonly');
      const req = tx.objectStore(LAYOUT_STORE).get(confFileName);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }
}

/** Instância padrão — substituível via setLayoutAdapter() para integração futura. */
export const defaultLayoutAdapter = new IndexedDBLayoutAdapter();

let _activeAdapter = defaultLayoutAdapter;

/** Substitui o adapter ativo. Útil para testes e integração com servidor Asterisk. */
export function setLayoutAdapter(adapter) { _activeAdapter = adapter; }

/** Salva layout via adapter ativo. */
export const saveLayout = (confFileName, layout) => _activeAdapter.save(confFileName, layout);

/** Carrega layout via adapter ativo. */
export const loadLayout = (confFileName) => _activeAdapter.load(confFileName);

// ─────────────────────────────────────────────────────────────────────────────
// JSDoc types (documentação de schema)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} URALayout
 * @property {string} version           — versão do schema (ex: "1.0")
 * @property {string} confFile          — nome do .conf correspondente
 * @property {string} generatedAt       — ISO timestamp
 * @property {{ x: number, y: number, zoom: number }} viewport
 * @property {ContextLayout[]} contexts
 * @property {FreeNodeLayout[]} freeNodes — nós fora de ContextNodes
 * @property {EdgeLayout[]} edges         — apenas edges com offsetX/Y não-nulo
 */

/**
 * @typedef {Object} ContextLayout
 * @property {string} contextName       — chave de ligação com o .conf
 * @property {{ x: number, y: number }} position
 * @property {number} width
 * @property {number} height
 * @property {number} exportOrder
 * @property {boolean} isDraft
 * @property {string[]} childOrder      — ids internos em ordem de execução
 * @property {NodeLayout[]} nodes
 */

/**
 * @typedef {Object} NodeLayout
 * @property {string} internalId
 * @property {string} nodeType
 * @property {{ x: number, y: number }} position — relativa ao ContextNode
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} FreeNodeLayout
 * @property {string} internalId
 * @property {string} nodeType
 * @property {{ x: number, y: number }} position — absoluta no canvas
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} EdgeLayout
 * @property {string} id
 * @property {string} sourceKey         — chave semântica do nó fonte
 * @property {string} targetKey         — chave semântica do nó destino
 * @property {string} sourceHandle
 * @property {string} targetHandle
 * @property {number} offsetX
 * @property {number} offsetY
 */
