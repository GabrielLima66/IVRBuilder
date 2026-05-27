/**
 * ThemeContext — fornece o tema efetivo ('matrix' | 'orpen' | 'dark') para
 * componentes filhos do Canvas que precisam de cores dependentes do tema.
 *
 * O valor é derivado de ConfigContext.colorTheme via COLOR_THEME_TO_DATA_THEME:
 *   'hacking' → 'matrix'
 *   'orpen'   → 'orpen'
 *   'dark'    → 'dark'
 *
 * Fonte de verdade: ConfigContext (não ThemeContext diretamente).
 */
import { createContext, useContext } from 'react';

export const ThemeContext = createContext('matrix');

/** Hook de atalho. Retorna 'matrix' | 'orpen' | 'dark'. */
export const useThemeContext = () => useContext(ThemeContext);
