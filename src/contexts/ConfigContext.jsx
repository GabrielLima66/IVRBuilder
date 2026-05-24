/**
 * ConfigContext — store global de configurações do Orpen URA Builder.
 *
 * Persiste automaticamente no localStorage (chave: 'orpen-ura-config').
 * Qualquer componente pode ler via useConfig() e alterar via setConfig(key, value).
 * Alterações são refletidas imediatamente sem necessidade de "Salvar".
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'orpen-ura-config';

/** Valores padrão de todas as configurações */
export const CONFIG_DEFAULTS = {
  // Interface
  mode:                   'pro',        // 'pro' | 'amigavel'

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

  // Importação
  rawOnUnknown:           true,         // bool — criar NóRaw para comandos não reconhecidos
  preserveComments:       true,         // bool — preservar linhas comentadas como NóComentado

  // Projeto
  autosaveDelay:          2,            // segundos (1–10) — debounce do autosave
  confirmBack:            true,         // bool — confirmar antes de sair com alterações
};

/** Carrega config do localStorage, com fallback para defaults e migração legada */
function loadConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...CONFIG_DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  // Migração: lê modo legado se houver
  const legacyMode = localStorage.getItem('orpen-ura-mode');
  return { ...CONFIG_DEFAULTS, ...(legacyMode ? { mode: legacyMode } : {}) };
}

export const ConfigContext = createContext({ ...CONFIG_DEFAULTS, setConfig: () => {} });
export const useConfig = () => useContext(ConfigContext);

/**
 * Provedor de configurações — deve envolver toda a aplicação.
 * Sincroniza automaticamente a classe body.mode-amigavel com a configuração de modo.
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

  return (
    <ConfigContext.Provider value={{ ...config, setConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}
