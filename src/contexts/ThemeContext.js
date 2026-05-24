/**
 * ThemeContext — fornece o tema ativo ('matrix' | 'orpen') para
 * componentes filhos do Canvas que precisam de cores dependentes do tema.
 */
import { createContext, useContext } from 'react';

export const ThemeContext = createContext('matrix');

/** Hook de atalho. Retorna 'matrix' | 'orpen'. */
export const useThemeContext = () => useContext(ThemeContext);
