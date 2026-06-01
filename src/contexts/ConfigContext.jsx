/**
 * ConfigContext — store global de configurações do Orpen URA Builder.
 *
 * Persiste automaticamente no localStorage (chave: 'orpen-ura-config').
 * Qualquer componente pode ler via useConfig() e alterar via setConfig(key, value).
 * Alterações são refletidas imediatamente sem necessidade de "Salvar".
 *
 * Mapeamento de colorTheme → data-theme no <html>:
 *   'hacking' → 'matrix'  (verde neon clássico)
 *   'orpen'   → 'orpen'   (roxo/violeta — identidade da marca)
 *   'dark'    → 'dark'    (paleta VS Code)
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'orpen-ura-config';

/** Mapeia colorTheme do ConfigContext para o atributo data-theme do DOM */
export const COLOR_THEME_TO_DATA_THEME = {
  hacking: 'matrix',
  orpen:   'orpen',
  dark:    'dark',
};

/** Valores padrão de todas as configurações */
export const CONFIG_DEFAULTS = {
  // Interface
  mode:                   'pro',        // 'pro' | 'amigavel'
  colorTheme:             'hacking',    // 'hacking' | 'orpen' | 'dark'

  // Canvas
  snapToGrid:             true,         // bool — snap automático para grade
  gridSize:               16,           // px (8–32) — tamanho da célula da grade
  showGrid:               true,         // bool — exibir padrão de pontos no fundo
  smartGuides:            true,         // bool — linhas-guia de alinhamento (smart guides)

  // Edges
  edgeStyle:              'smooth',     // 'smooth' | 'straight' | 'step'
  edgeIdleOpacity:        0.25,         // 0.10–0.60 — opacidade das edges em repouso

  // Exportação
  contextPrefix:          'orpen-ivr',  // string — prefixo usado em nomes de contexto gerados
  includeSectionComments: true,         // bool — emitir comentários ;; no .conf exportado
  lineEnding:             'lf',         // 'lf' | 'crlf'
  highFidelityMode:       true,         // bool — emitir originalLine para nós não editados (fidelidade literal)

  // Visualização
  showFormattingElements: false,        // bool — mostrar NóLinhaEmBranco e NóComentárioSeção no canvas

  // Importação
  rawOnUnknown:           true,         // bool — criar NóRaw para comandos não reconhecidos
  preserveComments:       true,         // bool — preservar linhas comentadas como NóComentado
  reviewModeOnImport:     true,         // bool — abrir canvas em modo revisão antes de confirmar

  // Projeto
  autosaveDelay:          2,            // segundos (1–10) — debounce do autosave
  confirmBack:            true,         // bool — confirmar antes de sair com alterações
};

/**
 * Carrega config do localStorage, com fallback para defaults e migração legada.
 *
 * Migrações aplicadas:
 *   - 'terminal' → 'hacking'   (renomeação de tema)
 *   - 'matrix'   → 'orpen'     (renomeação de tema)
 *   - 'dark-mode'→ 'dark'      (renomeação de tema)
 *   - orpen-theme legado = 'orpen' → colorTheme = 'orpen'
 */
function loadConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // Migração de nomes de tema antigos para os novos:
      const THEME_RENAME = { terminal: 'hacking', matrix: 'orpen', 'dark-mode': 'dark' };
      if (parsed.colorTheme && THEME_RENAME[parsed.colorTheme]) {
        parsed.colorTheme = THEME_RENAME[parsed.colorTheme];
      }

      // Migração legada: usuário sem colorTheme salvo que usava orpen-theme='orpen'
      // → preserva o tema Orpen (roxo)
      if (!parsed.colorTheme && localStorage.getItem('orpen-theme') === 'orpen') {
        parsed.colorTheme = 'orpen';
      }

      return { ...CONFIG_DEFAULTS, ...parsed };
    }
  } catch {}

  // Primeiro uso: detecta tema legado do orpen-theme
  const legacyTheme = localStorage.getItem('orpen-theme');
  const legacyMode  = localStorage.getItem('orpen-ura-mode');
  return {
    ...CONFIG_DEFAULTS,
    ...(legacyTheme === 'orpen' ? { colorTheme: 'orpen' } : {}),
    ...(legacyMode ? { mode: legacyMode } : {}),
  };
}

export const ConfigContext = createContext({ ...CONFIG_DEFAULTS, setConfig: () => {} });
export const useConfig = () => useContext(ConfigContext);

/**
 * Provedor de configurações — deve envolver toda a aplicação.
 * Sincroniza automaticamente a classe body.mode-amigavel com a configuração de modo
 * e o data-theme do <html> com colorTheme.
 */
export function ConfigProvider({ children }) {
  const [config, setConfigState] = useState(loadConfig);

  /** Altera uma chave de configuração e persiste imediatamente */
  const setConfig = useCallback((key, value) => {
    setConfigState((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Sincroniza a classe body para hierarquia de cores do modo AMIGÁVEL
  useEffect(() => {
    if (config.mode === 'amigavel') {
      document.body.classList.add('mode-amigavel');
    } else {
      document.body.classList.remove('mode-amigavel');
    }
    return () => document.body.classList.remove('mode-amigavel');
  }, [config.mode]);

  // Sincroniza data-theme no <html> com base em colorTheme
  // ConfigContext é a única fonte de verdade — theme.js/orpen-theme localStorage é legado
  useEffect(() => {
    const dataTheme = COLOR_THEME_TO_DATA_THEME[config.colorTheme] || 'matrix';
    document.documentElement.setAttribute('data-theme', dataTheme);
  }, [config.colorTheme]);

  return (
    <ConfigContext.Provider value={{ ...config, setConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}
