/**
 * Propaga rename de ContextNode para todos os nós que referenciam o nome antigo.
 *
 * Tipos afetados:
 *  - time    → data.trueContext     (destino quando condição bate)
 *  - route   → data.context         (apenas routeMode === 'contexto')
 *  - gosub   → data.context         (destino do Gosub)
 *
 * Retorna o array original se nada mudou (evita re-render desnecessário).
 */
export function applyContextRename(nodes, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return nodes;

  let changed = false;

  const next = nodes.map((n) => {
    const d = n.data;

    if (n.type === 'time' && d.trueContext === oldName) {
      changed = true;
      return { ...n, data: { ...d, trueContext: newName } };
    }

    if (n.type === 'route' && d.routeMode === 'contexto' && d.context === oldName) {
      changed = true;
      return { ...n, data: { ...d, context: newName } };
    }

    if (n.type === 'gosub' && d.context === oldName) {
      changed = true;
      return { ...n, data: { ...d, context: newName } };
    }

    return n;
  });

  return changed ? next : nodes;
}
