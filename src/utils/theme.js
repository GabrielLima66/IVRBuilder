/**
 * theme.js — gerenciamento de tema global (matrix | orpen).
 * Persiste em localStorage; aplica data-theme ao <html>.
 */

const STORAGE_KEY = 'orpen-theme';

/** @returns {'matrix'|'orpen'} */
export function getTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || 'matrix'; } catch { return 'matrix'; }
}

/**
 * Define e aplica o tema ao DOM + localStorage.
 * @param {'matrix'|'orpen'} name
 */
export function setTheme(name) {
  if (name !== 'matrix' && name !== 'orpen') return;
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', name);
}

/**
 * Alterna entre matrix e orpen e retorna o novo tema.
 * @returns {'matrix'|'orpen'}
 */
export function toggleTheme() {
  const next = getTheme() === 'matrix' ? 'orpen' : 'matrix';
  setTheme(next);
  return next;
}

/**
 * Lê o tema salvo e aplica ao DOM.
 * Deve ser chamado ANTES do primeiro render React para evitar flash.
 * @returns {'matrix'|'orpen'}
 */
export function initTheme() {
  const saved = getTheme();
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}
