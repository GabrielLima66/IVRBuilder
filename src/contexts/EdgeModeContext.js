import { createContext, useContext } from 'react';

/**
 * Modo de roteamento das edges:
 *  'free' — arrastar livremente em qualquer posição
 *  'grid' — snap automático para os pontos do grid de fundo (gap = 20)
 */
export const EdgeModeContext = createContext('free');
export const useEdgeMode    = () => useContext(EdgeModeContext);

/** Tamanho da célula do grid — deve coincidir com <Background gap={20} /> */
export const GRID_SIZE = 20;

/** Arredonda um valor para o múltiplo de GRID_SIZE mais próximo */
export function snapToGrid(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}
