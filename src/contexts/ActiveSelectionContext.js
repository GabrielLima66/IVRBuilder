/**
 * ActiveSelectionContext — estado global de seleção visual do canvas.
 *
 * Gerencia dois conjuntos:
 *   activeEdgeIds  — edges em estado ATIVO (sólidas, pulsantes)
 *   activeNodeIds  — nós vizinhos em estado ATIVO (borda pulsante)
 *
 * Quando o conjunto está vazio → todas as edges ficam em estado REPOUSO
 * (tracejadas, 25% opacidade). Quando há seleção → edges/nós do conjunto
 * ficam ATIVOS; os demais permanecem em REPOUSO.
 *
 * Propagação:
 *   Clicar num nó → conectados (edges diretas + nós na outra ponta)
 *   Clicar numa edge → a edge + os dois nós das extremidades
 *   Clicar no canvas → limpa tudo (repouso imediato)
 */
import { createContext, useContext } from 'react';

export const ActiveSelectionContext = createContext({
  activeEdgeIds: new Set(),
  activeNodeIds: new Set(),
});

export function useActiveSelection() {
  return useContext(ActiveSelectionContext);
}
