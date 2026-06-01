/**
 * nodeModeConfig.js — mapeamento centralizado de nomes, descrições e dicas
 * para o modo AMIGÁVEL. Referenciado por Sidebar, nodes e PropertiesPanel.
 *
 * Estrutura por tipo de nó:
 *   labelPro      — nome exibido no modo PRO (igual ao atual)
 *   labelAmigavel — nome exibido no modo AMIGÁVEL
 *   desc          — descrição completa do que o nó faz (modo AMIGÁVEL sidebar)
 *   dica          — dica operacional exibida no painel de propriedades
 *   campos        — { [dataKey]: string } — labels amigáveis dos campos do painel
 */

/** @type {Record<string, { labelPro: string, labelAmigavel: string, desc: string, dica: string, campos?: Record<string,string> }>} */
export const NODE_MODE_CONFIG = {
  config: {
    labelPro:      'CONFIG / START',
    labelAmigavel: 'Configuração da URA',
    desc:          'Define as configurações iniciais da URA — número, caminhos de áudio e idioma',
    dica:          'Este bloco deve ser o primeiro de toda URA. Preencha o número da URA e os caminhos corretos dos arquivos de som',
    campos: {
      ivr:         'Número da URA',
      soundPath:   'Caminho dos arquivos de áudio',
      agiPath:     'Caminho dos scripts de integração',
      language:    'Idioma da URA',
      comment:     'Identificação (comentário)',
      numberDialed:'Capturar número do chamador',
      logIvr:      'Registrar entrada no log',
    },
  },

  context: {
    labelPro:      'CONTEXT BOX',
    labelAmigavel: 'Bloco de Contexto',
    desc:          'Agrupa um conjunto de ações que acontecem em sequência quando a chamada chega neste ponto',
    dica:          'Pense no bloco de contexto como uma "cena" do atendimento. Cada cena tem suas próprias ações',
    campos: {
      contextName: 'Nome do bloco (técnico)',
      order:       'Ordem de exportação',
    },
  },

  menu: {
    labelPro:      'MENU DTMF',
    labelAmigavel: 'Menu de Opções',
    desc:          'Reproduz um áudio e aguarda o cliente pressionar um número no telefone',
    dica:          'Configure o áudio do menu e as ações para cada tecla que o cliente pode pressionar (1, 2, 3...)',
    campos: {
      contextName: 'Nome do contexto deste menu',
      label:       'Label do menu (ponto de re-entrada)',
      greeting:    'Arquivo de áudio do menu',
      waitExten:   'Tempo de espera (segundos)',
      invalidMacro:'Ação para tecla inválida',
      timeoutMacro:'Ação para tempo esgotado',
      maxRetry:    'Máximo de tentativas',
      retryGoto:   'Destino após tentativas',
      invalidSound:'Áudio para tecla inválida',
    },
  },

  time: {
    labelPro:      'TIME COND',
    labelAmigavel: 'Condição de Horário',
    desc:          'Verifica se a chamada está dentro do horário configurado e desvia o fluxo conforme o resultado',
    dica:          'Use para redirecionar chamadas fora do horário comercial para uma mensagem de fora de horário',
    campos: {
      timeStart:   'Horário de início',
      timeEnd:     'Horário de encerramento',
      weekdays:    'Dias da semana',
      months:      'Meses de funcionamento',
      mday:        'Dia do mês',
      trueContext: 'Destino quando dentro do horário',
      label:       'Identificação',
    },
  },

  route: {
    labelPro:      'DESTINO / ROTA',
    labelAmigavel: 'Encaminhar Chamada',
    desc:          'Encaminha a chamada para uma fila de atendimento, ramal ou outro contexto',
    dica:          'Escolha "Fila" para encaminhar para atendentes, "Contexto" para ir para outro bloco da URA',
    campos: {
      routeMode:    'Tipo de encaminhamento',
      queue:        'Fila ou ramal de destino',
      queueOptions: 'Opções adicionais',
      context:      'Bloco de destino',
      extension:    'Extensão de destino',
      priority:     'Prioridade',
    },
  },

  agi: {
    labelPro:      'AGI',
    labelAmigavel: 'Consulta ao Sistema',
    desc:          'Executa um script que busca ou envia dados para sistemas externos (CRM, banco de dados)',
    dica:          'Usado para buscar dados do cliente pelo número de telefone antes de continuar o atendimento',
    campos: {
      script: 'Caminho do script',
      params: 'Parâmetros do script',
      label:  'Identificação (label)',
    },
  },

  set: {
    labelPro:      'SET',
    labelAmigavel: 'Definir Variável',
    desc:          'Armazena um valor temporário que pode ser usado por outras ações na chamada',
    dica:          'Exemplo: guardar o motivo do contato para exibir no sistema do atendente',
    campos: {
      assignment: 'Variável e valor (ex: MOTIVO=suporte)',
      label:      'Identificação (label)',
    },
  },

  noop: {
    labelPro:      'NOOP',
    labelAmigavel: 'Anotação / Log',
    desc:          'Registra uma mensagem no log do sistema sem afetar o fluxo da chamada',
    dica:          'Use para identificar pontos importantes no fluxo durante testes e monitoramento',
    campos: {
      text:  'Mensagem do log',
      label: 'Identificação (label)',
    },
  },

  verbose: {
    labelPro:      'VERBOSE',
    labelAmigavel: 'Log Detalhado',
    desc:          'Registra uma mensagem detalhada no log do sistema com nível configurável',
    dica:          'Diferente do NOOP: permite configurar o nível de detalhamento (0 = menos, 5 = mais)',
    campos: {
      level:   'Nível de detalhe (0–5)',
      message: 'Mensagem do log',
    },
  },

  gosub: {
    labelPro:      'GOSUB',
    labelAmigavel: 'Executar Sub-rotina',
    desc:          'Executa um bloco de ações reutilizável e retorna para o ponto de origem após concluir',
    dica:          'Use para ações que se repetem em vários pontos da URA sem precisar duplicar os blocos',
    campos: {
      context:   'Bloco de destino (contexto)',
      extension: 'Extensão',
      priority:  'Prioridade',
      params:    'Parâmetros',
      label:     'Identificação (label)',
    },
  },

  return: {
    labelPro:      'RETURN',
    labelAmigavel: 'Retornar',
    desc:          'Retorna ao ponto de origem após a execução de uma sub-rotina',
    dica:          'Sempre use após um bloco de Sub-rotina para que o fluxo continue corretamente',
    campos: {
      value: 'Valor de retorno (opcional)',
    },
  },

  hangup: {
    labelPro:      'HANGUP',
    labelAmigavel: 'Encerrar Chamada',
    desc:          'Encerra a chamada imediatamente',
    dica:          'Use ao final de fluxos que não precisam de atendimento humano',
    campos: {
      causeCode: 'Código de encerramento (opcional)',
    },
  },

  answer: {
    labelPro:      'ANSWER',
    labelAmigavel: 'Atender Chamada',
    desc:          'Atende a chamada formalmente antes de iniciar o fluxo de áudio',
    dica:          'Geralmente é o primeiro nó dentro de um contexto de entrada',
    campos: {},
  },

  wait: {
    labelPro:      'WAIT',
    labelAmigavel: 'Aguardar',
    desc:          'Pausa o fluxo por um tempo determinado em segundos',
    dica:          'Use para dar um breve silêncio antes de reproduzir um áudio',
    campos: {
      seconds: 'Duração da pausa (segundos)',
      label:   'Identificação (label)',
    },
  },

  waitexten: {
    labelPro:      'WAITEXTEN',
    labelAmigavel: 'Aguardar Tecla',
    desc:          'Aguarda o cliente pressionar uma tecla por um tempo determinado',
    dica:          'Se o cliente não pressionar nada no tempo configurado, o fluxo continua pela saída de timeout',
    campos: {
      seconds: 'Tempo de espera (segundos)',
      label:   'Identificação (label)',
    },
  },

  playback: {
    labelPro:      'PLAYBACK',
    labelAmigavel: 'Reproduzir Áudio',
    desc:          'Reproduz um arquivo de áudio sem aceitar teclas do cliente durante a reprodução',
    dica:          'Use para avisos importantes que o cliente deve ouvir até o final, como termos legais',
    campos: {
      filename: 'Nome do arquivo de áudio',
      label:    'Identificação (label)',
    },
  },

  background: {
    labelPro:      'BACKGROUND',
    labelAmigavel: 'Áudio com Menu',
    desc:          'Reproduz um áudio enquanto aceita que o cliente pressione teclas',
    dica:          'Diferente do Reproduzir Áudio — aqui o cliente pode pressionar uma tecla antes do áudio terminar',
    campos: {
      filename: 'Nome do arquivo de áudio',
      label:    'Identificação (label)',
    },
  },

  gotoif: {
    labelPro:      'GOTOIF',
    labelAmigavel: 'Desvio Condicional',
    desc:          'Verifica uma condição e redireciona o fluxo conforme o resultado (verdadeiro ou falso)',
    dica:          'Exemplo: se o cliente ligou mais de 3 vezes, redireciona para uma fila prioritária',
    campos: {
      expression:       'Condição a verificar',
      trueDestination:  'Destino se verdadeiro',
      falseDestination: 'Destino se falso (vazio = continua)',
    },
  },

  macro: {
    labelPro:      'MACRO',
    labelAmigavel: 'Ação Padrão',
    desc:          'Executa uma ação pré-configurada do sistema (log, validação, etc.)',
    dica:          'Macros são ações técnicas do sistema — em geral não precisam ser alteradas',
    campos: {
      name:   'Nome da macro',
      params: 'Parâmetros',
      label:  'Identificação (label)',
    },
  },

  execif: {
    labelPro:      'EXEC IF',
    labelAmigavel: 'Executar se Condição',
    desc:          'Executa uma ação somente se a condição especificada for verdadeira',
    dica:          'Útil para ações que devem ocorrer apenas em determinadas situações sem desviar o fluxo',
    campos: {
      expression: 'Condição a verificar',
      action:     'Ação a executar',
    },
  },

  execiftime: {
    labelPro:      'EXEC IF TIME',
    labelAmigavel: 'Executar se Horário',
    desc:          'Executa uma ação somente se a chamada estiver dentro do horário configurado',
    dica:          'Alternativa à Condição de Horário quando não é necessário desviar o fluxo principal',
    campos: {
      hours:      'Horário (HH:MM-HH:MM)',
      days:       'Dias da semana',
      monthdays:  'Dias do mês',
      months:     'Meses',
      action:     'Ação a executar',
    },
  },

  dial: {
    labelPro:      'DIAL',
    labelAmigavel: 'Ligar para Ramal',
    desc:          'Disca diretamente para um ramal ou número externo',
    dica:          'Use para transferências diretas sem passar por fila de espera',
    campos: {
      destination: 'Destino (ramal ou número)',
      timeout:     'Tempo de espera (segundos)',
      options:     'Opções adicionais',
    },
  },

  read: {
    labelPro:      'READ DTMF',
    labelAmigavel: 'Capturar Tecla',
    desc:          'Reproduz um áudio e aguarda o cliente digitar uma sequência de teclas',
    dica:          'Use para capturar o número do protocolo, CPF ou qualquer dado que o cliente precise digitar',
    campos: {
      variable:  'Variável para guardar o resultado',
      audio:     'Arquivo de áudio',
      maxDigits: 'Máximo de dígitos',
      timeout:   'Tempo de espera (segundos)',
      label:     'Identificação (label)',
    },
  },

  saydigits: {
    labelPro:      'SAY DIGITS',
    labelAmigavel: 'Falar Dígitos',
    desc:          'Lê cada dígito de uma variável individualmente (ex: "3-4-5-6")',
    dica:          'Use para falar números de protocolo, ramais ou códigos dígito por dígito',
    campos: {
      value: 'Variável ou número a falar',
    },
  },

  saynumber: {
    labelPro:      'SAY NUMBER',
    labelAmigavel: 'Falar Número',
    desc:          'Lê um número como valor completo (ex: "três mil e quarenta")',
    dica:          'Diferente do Falar Dígitos — fala o número como quantidade, não como sequência de algarismos',
    campos: {
      value:  'Variável ou número a falar',
      gender: 'Gênero gramatical (m/f)',
    },
  },

  mixmonitor: {
    labelPro:      'MIX MONITOR',
    labelAmigavel: 'Gravar Chamada',
    desc:          'Inicia a gravação da chamada em um arquivo de áudio',
    dica:          'O arquivo gerado inclui os dois lados da conversa (cliente e atendente)',
    campos: {
      filename:  'Nome do arquivo de gravação',
      extension: 'Formato do arquivo (wav, mp3)',
    },
  },

  stopmonitor: {
    labelPro:      'STOP MONITOR',
    labelAmigavel: 'Parar Gravação',
    desc:          'Encerra a gravação da chamada iniciada pelo nó de Gravar Chamada',
    dica:          'Use quando precisar gravar apenas parte da chamada, não o fluxo inteiro',
    campos: {},
  },

  chanspy: {
    labelPro:      'CHAN SPY',
    labelAmigavel: 'Monitorar Canal',
    desc:          'Permite escutar ou entrar em uma chamada em andamento (supervisão)',
    dica:          'Recurso técnico de supervisão — geralmente não é necessário em URAs comuns',
    campos: {
      target:  'Canal a monitorar (ramal ou prefixo)',
      options: 'Opções de monitoramento',
    },
  },

  integration: {
    labelPro:      'INTEGRAÇÃO',
    labelAmigavel: 'Bloco de Integração',
    desc:          'Encapsula uma sequência de variáveis + script AGI + destino final em um único bloco configurável',
    dica:          'Use para agrupar: definir dados do cliente (Set), consultar sistema (AGI) e encaminhar para fila ou contexto',
    campos: {
      variables:   'Variáveis a definir (pares chave/valor)',
      agiScript:   'Script AGI (nome do arquivo)',
      agiParams:   'Parâmetros do script',
      destination: 'Destino final (fila, contexto ou nenhum)',
    },
  },

  raw: {
    labelPro:      '// RAW',
    labelAmigavel: '// Comando Personalizado',
    desc:          'Linha de dialplan que não foi reconhecida automaticamente pelo sistema',
    dica:          'Contém um comando técnico do Asterisk. Consulte um técnico antes de alterar',
    campos: {
      rawLine: 'Comando Asterisk',
    },
  },

  commented: {
    labelPro:      '// COMENTADO',
    labelAmigavel: '// Ação Desativada',
    desc:          'Uma ação que existe no fluxo mas está temporariamente desativada',
    dica:          'Clique em ATIVAR para reativar esta ação no fluxo de atendimento',
    campos: {},
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de categorias da sidebar
// ─────────────────────────────────────────────────────────────────────────────

/** Labels das categorias da sidebar no modo AMIGÁVEL. */
export const CATEGORY_LABELS_AMIGAVEL = {
  'CONTAINERS':          'Estrutura',
  'ESTRUTURA':           'Elementos Principais',
  'CONTROLE DE FLUXO':   'Redirecionamento',
  'EXECUÇÃO LÓGICA':     'Ações e Dados',
  'INTERAÇÃO & MONITOR': 'Interação e Monitoramento',
  'SISTEMA / ÁUDIO':     'Áudio',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o label do nó para o modo ativo.
 * @param {string} type  Tipo do nó (ex: 'playback', 'time')
 * @param {'pro'|'amigavel'} mode
 * @returns {string}
 */
export function getNodeLabel(type, mode) {
  const cfg = NODE_MODE_CONFIG[type];
  if (!cfg) return type;
  return mode === 'amigavel' ? cfg.labelAmigavel : cfg.labelPro;
}

/**
 * Retorna o label amigável de um campo do painel de propriedades, ou o label
 * original quando não há mapeamento ou o modo é PRO.
 *
 * @param {string} nodeType    Tipo do nó
 * @param {string} fieldKey    Chave do campo no data do nó (ex: 'filename')
 * @param {string} defaultLabel Label original (fallback)
 * @param {'pro'|'amigavel'} mode
 * @returns {string}
 */
export function getFieldLabel(nodeType, fieldKey, defaultLabel, mode) {
  if (mode !== 'amigavel') return defaultLabel;
  return NODE_MODE_CONFIG[nodeType]?.campos?.[fieldKey] || defaultLabel;
}
