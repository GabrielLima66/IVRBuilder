import { uid, DEFAULT_DIGITS } from './common';

export function buildNode(type, position) {
  const base = { id: 'n_' + uid(), type, position };

  switch (type) {
    case 'context':
      return {
        ...base,
        data: {
          contextName: 'orpen-ivr-novo-contexto',
          childOrder:  [],
          exportOrder: 0,     // será substituído por (maxOrder + 1) no App.jsx
          isDraft:     false,
        },
        style: { width: 320, height: 54 }, // altura inicial = só o header; expande com filhos
        zIndex: -1,
      };
    case 'config':
      return {
        ...base,
        data: {
          ivr: '0000',
          soundPath: '/etc/asterisk/customers/example/sounds',
          agiPath: '/etc/asterisk/customers/example/agi',
          language: 'pt_BR',
          comment: 'CHAMADA ENTRANTE - IVR EXEMPLO',
          customerAgi: true,
          numberDialed: true,
          logIvr: true,
        },
      };
    case 'menu':
      return {
        ...base,
        data: {
          contextName:  'orpen-ivr-home',
          audioFiles:   ['boas-vindas'],       // array de arquivos de áudio (suporta múltiplos via &)
          greeting:     'boas-vindas',         // compat legado (= audioFiles[0])
          waitExten:    4,
          waitSeconds:  4,
          digits:       DEFAULT_DIGITS.map((d) => ({
            ...d,
            comment:          null,
            actions:          [],
            finalDestination: null,
          })),
          label:         'menu',               // label da linha Background — ponto de re-entrada (ex: Goto(ctx,s,menu))
          invalidMacro:  'macro-menu-invalid-orpen-home',
          timeoutMacro:  'macro-menu-timeout-orpen-home',
          invalidOption: null,
          timeoutOption: null,
          maxRetry:      2,
          retryGoto:     'ivr-encerramento,s,1',
          invalidSound:  'opcao-invalida',
        },
      };
    case 'time':
      return {
        ...base,
        data: {
          timeStart:      '08:00',
          timeEnd:        '18:00',
          weekdays:       ['mon', 'tue', 'wed', 'thu', 'fri'],
          months:         [],
          mday:           '',
          label:          'horario-comercial',
          trueContext:    '',
          trueExtension:  '', // extensão de destino quando ≠ 's' (ex: 7310 p/ fila)
          truePriority:   '', // prioridade de destino quando ≠ '1'
        },
      };
    case 'route':
      return {
        ...base,
        data: {
          routeMode:    'macro',
          queue:        '7000',
          queueOptions: '',
          context:      'orpen-ivr-home',
          extension:    's',
          priority:     '1',
        },
      };

    // Controle de Fluxo
    case 'gosub':
      return { ...base, data: { context: 'sub-rotina', extension: 's', priority: '1', params: [] } };
    case 'return':
      return { ...base, data: { value: '' } };
    case 'hangup':
      return { ...base, data: { causeCode: '' } };
    case 'gotoif':
      return { ...base, data: { expression: '"${VAR}"="1"', trueDestination: 'orpen-ivr-home,s,1', falseDestination: '' } };

    // Execução Lógica
    case 'set':
      return { ...base, data: { assignment: '__IVR=0000', label: '' } };
    case 'agi':
      return { ...base, data: { script: 'meu-script.php', params: [], label: '' } };
    case 'macro':
      return { ...base, data: { name: 'minha-macro', params: ['PARAM1'], label: '' } };
    case 'execif':
      return { ...base, data: { expression: '"${MINHA_VAR}"!=""', action: 'Playback(${SOUND_PATH}/nome-do-audio)' } };
    case 'execiftime':
      return { ...base, data: { hours: '08:00-18:00', days: 'mon-fri', monthdays: '*', months: '*', action: 'Goto(orpen-ivr-home,s,1)' } };
    case 'include':
      return { ...base, data: { contextName: 'hangup-ivr' } };
    case 'sipaddheader':
      return { ...base, data: { headerName: 'X-Meu-Header', value: '${MINHA_VAR}' } };
    case 'noop':
      return { ...base, data: { text: '## DEBUG ##', label: '' } };
    case 'verbose':
      return { ...base, data: { level: 3, message: 'mensagem de log' } };

    // Interação / Monitoramento
    case 'read':
      return { ...base, data: { variable: 'MINHA_VAR', audio: 'nome-do-audio', maxDigits: 1, timeout: 5, label: '' } };
    case 'saydigits':
      return { ...base, data: { value: '${MINHA_VAR}' } };
    case 'saynumber':
      return { ...base, data: { value: '${MINHA_VAR}', gender: 'm' } };
    case 'mixmonitor':
      return { ...base, data: { filename: '${UNIQUEID}-${CALLERID(num)}', extension: 'wav' } };
    case 'stopmonitor':
      return { ...base, data: {} };
    case 'chanspy':
      return { ...base, data: { target: '2000', options: 'qw' } };
    case 'dial':
      return { ...base, data: { destination: 'SIP/ramal', timeout: '30', options: '' } };

    case 'integration':
      return {
        ...base,
        data: {
          variables:  [],
          agiScript:  '',
          agiParams:  [],
          destination: { type: 'none', context: '', extension: 's', priority: '1', queue: '', queueOptions: '' },
        },
      };

    // Sistema / Áudio
    case 'answer':
      return { ...base, data: {} };
    case 'wait':
      return { ...base, data: { seconds: 1 } };
    case 'waitexten':
      return { ...base, data: { seconds: 4, label: '' } };
    case 'playback':
      return { ...base, data: { filename: 'nome-do-audio', label: '' } };
    case 'background':
      return { ...base, data: { filename: 'nome-do-audio', filenames: ['nome-do-audio'], label: '' } };

    // Elementos de formatação — criados apenas pelo parser durante importação
    case 'blankline':
      return { ...base, data: { count: 1 } };
    case 'sectioncomment':
      return { ...base, data: { text: ';; comentário de seção', style: 'double' } };

    default:
      return base;
  }
}
