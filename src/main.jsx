import React from 'react';
import ReactDOM from 'react-dom/client';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';
import './index.css';
import App from './App';
import { initTheme } from './utils/theme';

// Aplica o tema salvo ANTES do primeiro render para evitar flash
initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
