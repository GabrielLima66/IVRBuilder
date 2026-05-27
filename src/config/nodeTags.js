/**
 * nodeTags.js — Mapa de tags semânticas por tipo de nó.
 *
 * Cada chave é o `type` exato do nó (mesmo valor usado em buildNode.js e nodeTypes).
 * O array de strings define os termos semânticos que o usuário pode digitar para
 * encontrar esse nó na pesquisa da sidebar, mesmo sem saber o nome técnico.
 *
 * COMO ADICIONAR UM NOVO NÓ:
 *   1. Crie a entrada com o `type` do novo nó como chave.
 *   2. Adicione tags que descrevem o CONCEITO, não apenas o nome técnico.
 *   3. Prefira termos em português (o usuário do projeto fala pt-BR).
 *   4. Inclua sinônimos e termos relacionados ao contexto de telefonia/IVR.
 *   5. Use letras minúsculas sem acentos — a busca normaliza antes de comparar.
 *
 * Exemplo para um novo nó 'sms':
 *   sms: ['mensagem', 'texto', 'sms', 'notificacao', 'enviar'],
 */

export const NODE_TAGS = {
  // ── Estruturais ─────────────────────────────────────────────────────────────
  context: [
    'container', 'grupo', 'agrupador', 'caixa', 'contexto', 'bloco', 'modulo',
  ],
  config: [
    'configuracao', 'global', 'ivr', 'inicio', 'start', 'variavel', 'paths',
    'parametro', 'setup', 'atender', 'comecar', 'iniciar', 'chamada',
  ],
  menu: [
    'menu', 'opcao', 'digito', 'dtmf', 'tecla', 'audio', 'som', 'background',
    'opcoes', 'selecao', 'escolha', 'ura', 'ivr', 'atendimento', 'reproducao',
    'locucao', 'musica',
  ],
  time: [
    'horario', 'validacao', 'condicao', 'regra', 'verificacao', 'tempo',
    'conferir', 'horario-comercial', 'expediente', 'dia', 'semana', 'mes',
    'calendario', 'agenda', 'plantao',
  ],
  route: [
    'destino', 'rota', 'fila', 'transferencia', 'atendimento', 'agente',
    'goto', 'queue', 'encaminhar', 'redirecionar', 'desviar',
  ],

  // ── Controle de Fluxo ────────────────────────────────────────────────────────
  gosub: [
    'fluxo', 'sub-rotina', 'modular', 'reutilizar', 'salto', 'desvio',
    'chamar', 'rotina', 'macro', 'funcao',
  ],
  return: [
    'retorno', 'voltar', 'sub-rotina', 'fluxo', 'sair', 'finalizar-rotina',
  ],
  hangup: [
    'encerramento', 'desligar', 'fim', 'hangup', 'encerrar', 'terminar',
    'desconectar', 'finalizar', 'bye',
  ],
  gotoif: [
    'condicao', 'validacao', 'salto', 'desvio', 'fluxo', 'menu', 'verificar',
    'se', 'if', 'bifurcacao', 'decisao', 'regra', 'teste', 'checar',
  ],

  // ── Execução Lógica ──────────────────────────────────────────────────────────
  set: [
    'variavel', 'configuracao', 'parametro', 'definir', 'setar', 'atribuir',
    'valor', 'armazenar', 'salvar', 'canal',
  ],
  agi: [
    'script', 'integracao', 'dados', 'cadastro', 'crm', 'consulta', 'php',
    'python', 'externo', 'banco', 'api', 'webservice', 'busca', 'cliente',
  ],
  macro: [
    'macro', 'sub-rotina', 'modular', 'reutilizar', 'fluxo', 'rotina',
    'funcao', 'chamar',
  ],
  execif: [
    'condicao', 'validacao', 'verificar', 'logica', 'se', 'if', 'teste',
    'checar', 'decisao',
  ],
  execiftime: [
    'horario', 'tempo', 'condicao', 'validacao', 'regra', 'dia', 'semana',
    'calendario', 'expediente',
  ],
  noop: [
    'log', 'debug', 'rastreio', 'registro', 'comentario', 'marcador',
    'anotacao', 'diagnostico', 'trace',
  ],
  verbose: [
    'log', 'debug', 'rastreio', 'registro', 'diagnostico', 'detalhe',
    'mensagem', 'console', 'trace',
  ],

  // ── Interação & Monitoramento ────────────────────────────────────────────────
  dial: [
    'discagem', 'ramal', 'sip', 'transferencia', 'chamada', 'telefone',
    'fila', 'destino', 'ligar', 'discar', 'pjsip', 'atendimento', 'agente',
    'rota',
  ],
  read: [
    'entrada', 'dtmf', 'variavel', 'input', 'ler', 'digitar', 'coletar',
    'capturar', 'cpf', 'opcao', 'tecla', 'dado',
  ],
  saydigits: [
    'audio', 'falar', 'locucao', 'voz', 'digito', 'som', 'reproducao',
    'sintetizar', 'tts', 'leitura',
  ],
  saynumber: [
    'audio', 'falar', 'locucao', 'voz', 'numero', 'som', 'reproducao',
    'sintetizar', 'tts', 'leitura',
  ],
  mixmonitor: [
    'gravacao', 'gravar', 'monitoramento', 'audio', 'registrar',
    'escutar', 'arquivar', 'wav', 'mp3',
  ],
  stopmonitor: [
    'gravacao', 'parar', 'monitoramento', 'parar-gravacao', 'encerrar-gravacao',
  ],
  chanspy: [
    'monitoramento', 'espionar', 'canal', 'supervisor', 'escuta',
    'ouvir', 'sussurro', 'barge', 'supervisao',
  ],

  // ── Diretivas / Integração SIP ───────────────────────────────────────────────
  include: [
    'include', 'importar', 'diretiva', 'contexto', 'hangup', 'estrutura',
    'encerramento', 'referencia', 'inserir', 'bloco',
  ],
  sipaddheader: [
    'sip', 'header', 'cabecalho', 'protocolo', 'cpf', 'variavel', 'integracao',
    'dados', 'crm', 'identificacao', 'caller', 'canal', 'custom',
  ],

  // ── Sistema / Áudio ──────────────────────────────────────────────────────────
  answer: [
    'atender', 'iniciar', 'comecar', 'chamada', 'answer', 'conectar',
    'receber', 'aceitar',
  ],
  wait: [
    'espera', 'pausa', 'tempo', 'aguardar', 'timeout', 'delay',
    'segurar', 'hold', 'silencio',
  ],
  waitexten: [
    'espera', 'dtmf', 'aguardar', 'digitar', 'timeout', 'tecla',
    'input', 'entrada', 'menu', 'opcao',
  ],
  playback: [
    'audio', 'som', 'reproducao', 'musica', 'locucao', 'tocar',
    'arquivo', 'wav', 'mensagem', 'voz', 'falar',
  ],
  background: [
    'audio', 'som', 'reproducao', 'musica', 'dtmf', 'menu', 'opcao',
    'locucao', 'tocar', 'wav', 'mensagem', 'voz', 'falar',
  ],
};
