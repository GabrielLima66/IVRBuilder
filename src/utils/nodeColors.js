/**
 * nodeColors.js — resolução de cores de nó por tema.
 *
 * Alguns tipos de nó usam cores que colidem com o tema ativo:
 *   • Matrix: nós de sistema usam #00ff41 — igual ao chrome verde → invisíveis
 *   • Orpen:  nós de lógica usam #a78bfa — próximo de #c084fc (neon) → invisíveis
 *
 * A função resolveNodeColor() remapeia essas cores colidentes para
 * alternativas com contraste adequado em cada tema.
 */

/** @type {Record<string, Record<string, string>>} */
const COLOR_REMAP = {
  matrix: {
    // Nós de sistema/áudio (Answer, Wait, Playback, Background, WaitExten)
    // eram #00ff41 (idêntico ao chrome verde) → teal/mint (#2dd4bf)
    '#00ff41': '#2dd4bf',
  },
  orpen: {
    // Nós de lógica (Set, AGI, Macro, ExecIf, ExecIfTime)
    // eram #a78bfa (similar ao neon roxo #c084fc) → hot pink (#f472b6)
    '#a78bfa': '#f472b6',
  },
  dark: {
    // Nós de sistema/áudio: #00ff41 colidia com fundo escuro → azul-teal VS Code
    '#00ff41': '#4fc1ff',
    // Nós de integração: #a78bfa (lavanda) → rosa-mauve para contraste no cinza
    '#a78bfa': '#c586c0',
  },
};

/**
 * Retorna a cor de acento correta para o nó dado o tema atual.
 * Se não houver colisão, retorna a cor original.
 *
 * @param {string} baseColor  Cor base do nó (ex: '#00ff41')
 * @param {string} theme      Tema ativo ('matrix' | 'orpen')
 * @returns {string}
 */
export function resolveNodeColor(baseColor, theme = 'matrix') {
  return COLOR_REMAP[theme]?.[baseColor] ?? baseColor;
}
