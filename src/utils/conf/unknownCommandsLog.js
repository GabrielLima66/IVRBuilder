/**
 * unknownCommandsLog.js — rastreio em memória de aplicações Asterisk não reconhecidas.
 *
 * Uso no pipeline de importação:
 *   1. Chamar resetUnknownCommands() antes de cada importConf().
 *   2. Chamar logUnknown(application) no default case de appToNodeData().
 *   3. Incluir getUnknownCommands() nos stats retornados pelo confImporter.
 *
 * O log é limpo a cada importação — não persiste entre sessões.
 * Thread-safe por design: JS é single-threaded; a Map é local ao módulo.
 */

/** @type {Map<string, number>} application name → occurrence count */
const unknownCmds = new Map();

/**
 * Registra uma ocorrência de uma aplicação Asterisk não reconhecida.
 * Chamado no default case de appToNodeData em confResolver.js.
 * @param {string} application  — nome da aplicação (ex: 'ExecIfTime', 'SIPAddHeader')
 */
export function logUnknown(application) {
  const key = (application || 'unknown').trim();
  unknownCmds.set(key, (unknownCmds.get(key) || 0) + 1);
}

/**
 * Zera o log. Deve ser chamado no início de cada importConf().
 */
export function resetUnknownCommands() {
  unknownCmds.clear();
}

/**
 * Retorna a lista de comandos não reconhecidos, ordenados por contagem decrescente.
 * @returns {{ cmd: string, count: number }[]}
 */
export function getUnknownCommands() {
  return [...unknownCmds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cmd, count]) => ({ cmd, count }));
}
