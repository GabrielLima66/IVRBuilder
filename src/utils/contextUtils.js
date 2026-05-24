/**
 * contextUtils.js — utilitários para validação e geração de nomes de ContextNode.
 */

/**
 * Retorna um nome único baseado em `baseName`, garantindo que não colida com
 * nenhum nome já presente em `existingNames`.
 *
 * Estratégia: se o nome base está livre, retorna como está. Caso contrário,
 * sufixo numérico incremental: baseName-2, baseName-3, ...
 *
 * @param {string} baseName        — nome desejado (ex: 'orpen-ivr-novo-contexto')
 * @param {string[]} existingNames — lista de nomes já em uso no canvas
 * @returns {string} nome único pronto para uso
 */
export function generateUniqueContextName(baseName, existingNames) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const taken = existingNames.map(norm);
  if (!taken.includes(norm(baseName))) return baseName;
  let counter = 2;
  while (taken.includes(norm(`${baseName}-${counter}`))) counter++;
  return `${baseName}-${counter}`;
}

/**
 * Verifica se `name` já está em uso em `existingNames`, ignorando
 * o nó cujo id é `selfId` (para não bloquear o próprio nó ao re-validar).
 *
 * @param {string}   name          — nome a verificar
 * @param {Object[]} nodes         — lista de nós React Flow do canvas
 * @param {string}   [selfId]      — id do nó que está sendo renomeado (exclui ele da checagem)
 * @returns {boolean} true se o nome é duplicado
 */
export function isContextNameDuplicate(name, nodes, selfId) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const check = norm(name);
  if (!check) return false;
  return nodes.some(
    (n) => n.type === 'context' && n.id !== selfId && norm(n.data?.contextName) === check
  );
}
