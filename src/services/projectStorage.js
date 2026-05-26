/**
 * projectStorage.js — camada de serviço para persistência de projetos no IndexedDB.
 *
 * Todos os métodos retornam Promises. O banco é criado automaticamente na primeira
 * utilização. Não há dependências externas.
 */

const DB_NAME    = 'orpen-ura-db';
const DB_VERSION = 2;           // v1 → v2: adicionada store 'layouts' para separação dialplan/layout
const STORE      = 'projects';
const LAYOUT_STORE = 'layouts'; // indexado por confFileName

// ── Abertura (singleton lazy) — compartilhado com layoutStorage.js ───────────
let _db = null;

/**
 * Abre (ou reaproveita) a conexão com o banco IndexedDB.
 * Exportado para que layoutStorage.js possa compartilhar o mesmo singleton
 * sem abrir o banco em versões conflitantes.
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // v1: store de projetos
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      // v2: store de layouts — indexado pelo nome do .conf
      if (!db.objectStoreNames.contains(LAYOUT_STORE)) {
        db.createObjectStore(LAYOUT_STORE, { keyPath: 'confFileName' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza um projeto.
 * @param {object} projeto — deve conter: id, nome, dataCriacao, dataModificacao, flowState
 */
export async function salvarProjeto(projeto) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(projeto);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Retorna todos os projetos, ordenados por dataModificacao decrescente.
 */
export async function listarProjetos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const sorted = (req.result || []).sort(
        (a, b) => new Date(b.dataModificacao) - new Date(a.dataModificacao)
      );
      resolve(sorted);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retorna um projeto completo pelo id, ou null se não existir.
 */
export async function carregarProjeto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Remove um projeto pelo id.
 */
export async function excluirProjeto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Verifica se um projeto com o id dado já existe.
 */
export async function projetoExiste(id) {
  const projeto = await carregarProjeto(id);
  return projeto !== null;
}
