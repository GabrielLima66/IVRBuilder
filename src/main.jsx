import React from 'react';
import ReactDOM from 'react-dom/client';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';
import './index.css';
import App from './App';

/**
 * Aplica o data-theme correto ANTES do primeiro render React para evitar flash.
 * Lê colorTheme do ConfigContext (orpen-ura-config) com fallback para orpen-theme legado.
 *
 * Mapeamento (nomes atuais):  hacking→matrix | orpen→orpen | dark→dark
 * Mapeamento (nomes legados): terminal→matrix | matrix→orpen | dark-mode→dark
 */
function applyInitialTheme() {
  try {
    const config     = JSON.parse(localStorage.getItem('orpen-ura-config') || '{}');
    const colorTheme = config.colorTheme || null;

    // Mapa unificado — suporta nomes atuais e legados (migração transparente)
    const DATA_THEME = {
      hacking:    'matrix',   // nome atual
      orpen:      'orpen',    // nome atual
      dark:       'dark',     // nome atual
      terminal:   'matrix',   // legado → renomeado para 'hacking'
      matrix:     'orpen',    // legado → renomeado para 'orpen'
      'dark-mode':'dark',     // legado → renomeado para 'dark'
    };

    if (colorTheme && DATA_THEME[colorTheme]) {
      document.documentElement.setAttribute('data-theme', DATA_THEME[colorTheme]);
    } else {
      // Sem colorTheme salvo: usa legado orpen-theme (matrix ou orpen)
      const legacy = localStorage.getItem('orpen-theme') || 'matrix';
      document.documentElement.setAttribute('data-theme', legacy);
    }
  } catch {
    document.documentElement.setAttribute('data-theme', 'matrix');
  }
}

applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
