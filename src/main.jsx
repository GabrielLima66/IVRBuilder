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
 * Mapeamento: terminal→matrix | matrix→orpen | dark→dark
 */
function applyInitialTheme() {
  try {
    const config     = JSON.parse(localStorage.getItem('orpen-ura-config') || '{}');
    const colorTheme = config.colorTheme || null;

    if (colorTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (colorTheme === 'matrix') {
      document.documentElement.setAttribute('data-theme', 'orpen');
    } else if (colorTheme === 'terminal') {
      document.documentElement.setAttribute('data-theme', 'matrix');
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
