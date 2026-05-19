# Orpen URA Builder — Project Brief

> Fonte de verdade técnica do projeto. Atualizar sempre que novos nós, regras de compilação ou padrões forem alterados.

---

## 1. Stack Tecnológica

| Pacote | Versão | Papel |
|---|---|---|
| Vite | 5.3.1 | Bundler/dev server |
| React | 18.3.1 | UI framework |
| ReactFlow | 11.11.4 | Canvas de grafo interativo |
| @reactflow/node-resizer | 2.2.14 | Handle de resize para ContextNode |
| lucide-react | 0.395.0 | Ícones SVG |
| TailwindCSS | 3.4.4 | Utility classes (uso mínimo — styling principal é CSS custom) |
| PostCSS + autoprefixer | — | Pipeline Tailwind |

**Entry point:** `index.html` → `src/main.jsx` → `src/App.jsx`

**JSX em `.js`**: proibido — Vite só processa JSX em `.jsx`/`.tsx`. O `src/components/nodes/index.jsx` usa essa extensão justamente por usar JSX no `mkActionType`.

---

## 2. Design System / Identidade Visual

### CSS Custom Properties (`:root` em `src/index.css`)

```css
--neon:    #00ff41   /* verde neon — cor primária de tudo */
--neon-dim:#00b32d   /* verde escurecido para labels e bordas */
--bg:      #0d0d0d   /* fundo do canvas */
--panel:   #131313   /* fundo dos painéis laterais */
--panel-2: #1a1a1a   /* fundo de controles RF (minimap, etc.) */
--line:    #1f3a23   /* bordas e separadores */
```

### Fontes
Stack monospace: `'JetBrains Mono', 'Fira Code', 'Courier New', ui-monospace, monospace`

### Efeitos Visuais
- **Scanlines**: `body::before` com `repeating-linear-gradient` verde semi-transparente, `z-index:1000`, `pointer-events:none`
- **Neon glow**: `box-shadow: 0 0 10px var(--neon), 0 0 20px rgba(0,255,65,0.5)` nos botões hover
- **Blink cursor**: classe `.blink` com `animation: blink 1.2s steps(2, start) infinite`

### Cores de Acento por Categoria de Nó

| Categoria | Cor | Nós |
|---|---|---|
| Estrutura core | `#00ff41` | config, menu, context, answer, wait, playback |
| Condição temporal | `#ffcc00` | time (UI), read, saydigits, saynumber |
| Fluxo de controle | `#00d4ff` | gosub, return; route-contexto |
| Lógica | `#a78bfa` | agi, macro, execif, execiftime; route-macro |
| Monitoramento | `#ff8c00` | mixmonitor, stopmonitor, chanspy; route-fila |
| Hangup/erro | `#ff5050` | hangup; handle "closed" do time |
| Debug | `#888888` | noop, verbose |

### Classes CSS Estruturais dos Nós

```
.rcx-node           — container base (border neon-dim, bg panel, min-width 220px)
.rcx-node.selected  — border white + glow branco
.rcx-node-header    — gradiente dark-green, uppercase, flex justify-between
.rcx-node-body      — padding 8px 10px, font-family inherit
.rcx-node-row       — flex justify-between, font 11px; .k = neon-dim, .v = #c7ffd5
.digit-row          — flex, border-top dashed, position:relative (para handles absolutas)
.ctx-node           — rgba(0,255,65,0.04) bg, borda dashed, flex column
.ctx-node.selected  — borda sólida branca
.ctx-header         — rgba(0,255,65,0.18) bg, cursor:move
.ctx-name-input     — input transparente editável inline
.ctx-body-hint      — hint centralizado, pointer-events:none
.badge              — inline-block, border neon-dim, font 9px
.palette-item       — border dashed line, cursor grab, hover glow
.btn-neon           — border neon, hover inverte bg/fg
.btn-danger         — border/color #ff3b3b
.term-input/select  — bg #000, border line, color neon, full width
.neon-text          — text-shadow verde
```

---

## 3. Estrutura de Diretórios

```
Construtor URA/
├── PROJECT_BRIEF.md          ← este arquivo
├── index.html                ← Vite entry (sem CDN, apenas <script src="/src/main.jsx">)
├── package.json
├── vite.config.js            ← defineConfig com @vitejs/plugin-react
├── tailwind.config.js        ← content: ['./index.html','./src/**/*.{js,jsx}']
├── postcss.config.js
└── src/
    ├── main.jsx              ← ReactDOM.createRoot; importa reactflow CSS, noderesizer CSS, index.css
    ├── App.jsx               ← Canvas component + ReactFlowProvider + estado global
    ├── index.css             ← Todo o CSS custom (variáveis, nós, inputs, modal, time picker)
    ├── components/
    │   ├── nodes/
    │   │   ├── index.jsx     ← nodeTypes registry + mkActionType factory
    │   │   ├── ActionNode.jsx← Componente genérico para os 18 nós de ação (usa ACTION_META)
    │   │   ├── ConfigNode.jsx← Nó START — sem handles de entrada
    │   │   ├── ContextNode.jsx← Container resizável com ctx-start handle
    │   │   ├── MenuNode.jsx  ← DTMF menu com handles por dígito
    │   │   ├── RouteNode.jsx ← Destino/Roteamento unificado (3 modos)
    │   │   └── TimeNode.jsx  ← Condição temporal (suporta formato novo e legado)
    │   └── layout/
    │       ├── Sidebar.jsx   ← Palette de nós draggáveis (6 categorias)
    │       └── PropertiesPanel.jsx ← Editor de propriedades por tipo de nó
    ├── config/
    │   └── nodeTags.js         ← Mapa de tags semânticas por tipo de nó (usado na pesquisa da sidebar)
    ├── contexts/
    │   └── EdgeModeContext.js  ← Contexto React do modo de roteamento ('free'|'grid') + GRID_SIZE + snapToGrid()
    ├── components/
    │   ├── edges/
    │   │   ├── EdgeWithWaypoints.jsx ← Edge 'floating' com waypoints editáveis + ortogonal routing
    │   │   └── FloatingEdge.jsx      ← Edge simplificada (legado, substituída por EdgeWithWaypoints)
    │   ├── nodes/
    │   │   ├── index.jsx     ← nodeTypes registry + mkActionType factory
    │   │   ├── ActionNode.jsx← Componente genérico para os 22 nós de ação (usa ACTION_META)
    │   │   ├── ConfigNode.jsx← Nó START — sem handles de entrada
    │   │   ├── ContextNode.jsx← Container resizável com ctx-start handle e faixa START
    │   │   ├── MenuNode.jsx  ← DTMF menu com handles por dígito
    │   │   ├── RouteNode.jsx ← Destino/Roteamento unificado (3 modos)
    │   │   └── TimeNode.jsx  ← Condição temporal (suporta formato novo e legado)
    │   └── layout/
    │       ├── Sidebar.jsx   ← Palette de nós draggáveis (6 categorias)
    │       └── PropertiesPanel.jsx ← Editor de propriedades por tipo de nó
    └── utils/
        ├── actionMeta.js     ← ACTION_META dict + actionLine() + validate() por tipo
        ├── asteriskExporter.js ← generateDialplan() — compilador principal
        ├── buildNode.js      ← Factory de nós com defaults
        ├── common.js         ← uid(), cls(), slugify(), DEFAULT_DIGITS
        ├── edgeUtils.js      ← getEdgeParams(), getEdgeParamsDirected(), isSemanticHandle()
        ├── renamePropagator.js ← applyContextRename() — cascata de rename de ContextNode
        └── timeUtils.js      ← Formatação de condições de tempo Asterisk
```

---

## 4. Arquitetura dos Nós Customizados

### 4.1 Tipos de Nós e Responsabilidades

Existem **dois padrões** de nó:

**A) Nós Estruturais** — componentes próprios, registrados diretamente no `nodeTypes`:

| Tipo | Componente | Responsabilidade |
|---|---|---|
| `context` | ContextNode.jsx | Container/grupo resizável. Agrupa filhos com `parentNode`. Tem `ctx-start` para definir entry point explícito. |
| `config` | ConfigNode.jsx | Nó START do fluxo. Define variáveis globais (IVR, paths, language). Sem handles de entrada. |
| `menu` | MenuNode.jsx | Menu DTMF. Gera Background + WaitExten + extensões por dígito. |
| `time` | TimeNode.jsx | Condição temporal. Exporta exclusivamente `GotoIfTime(...)`. |
| `route` | RouteNode.jsx | Destino unificado (Goto, Queue ou macro Orpen). |

**B) Nós de Ação** — renderizados por `ActionNode.jsx` via `mkActionType(type)`:

22 tipos registrados: `gosub, return, hangup, gotoif, set, agi, macro, execif, execiftime, noop, verbose, dial, read, saydigits, saynumber, mixmonitor, stopmonitor, chanspy, answer, wait, waitexten, playback, background`

### 4.2 Dados (`data`) por Tipo de Nó

#### `context`
```js
{
  contextName: string,  // nome do contexto Asterisk (entre colchetes no .conf)
  order?: number|''     // opcional — posição no arquivo .conf (crescente; vazio = sem prioridade)
}
```

#### `config`
```js
{
  ivr: string,          // número do IVR → Set(__IVR=...)
  soundPath: string,    // → Set(SOUND_PATH=...)
  agiPath: string,      // → Set(AGI_PATH=...)
  language: string,     // → Set(CHANNEL(language)=...)
  comment: string,      // → Noop(## comment ##)
  numberDialed: bool,   // → Set(__NUMBER_DIALED=${CALLERID(num)})
  logIvr: bool,         // → Macro(logIvr,ENTER_IVR)
  customerAgi: bool     // DEPRECATED — não gera mais código; relíquia em buildNode
}
```
> **NOTA:** `customerAgi` foi removido da geração de código (Fix 2). O campo ainda existe nos defaults do `buildNode` mas o exportador o ignora. Para emitir `Agi(customerDataInboundCall_v4.php,...)`, use um nó AGI explícito.

#### `menu`
```js
{
  contextName: string,  // nome do contexto deste menu (usado em Goto em DTMF)
  greeting: string,     // arquivo de áudio → Background(${SOUND_PATH}/greeting)
  waitExten: number,    // → WaitExten(n)
  digits: [{ id: string, label: string }],  // lista de opções DTMF
  invalidMacro: string, // macro para extensão 'i'
  timeoutMacro: string, // macro para extensão 't'
  maxRetry: number,
  retryGoto: string,    // Goto de retry após maxRetry
  invalidSound: string  // áudio tocado em dígito inválido sem edge
}
```

#### `time` (formato atual)
```js
{
  timeStart:   string,    // 'HH:MM' — início do horário (vazio = *)
  timeEnd:     string,    // 'HH:MM' — fim do horário (vazio = *)
  weekdays:    string[],  // ex: ['mon','tue','wed','thu','fri']
  months:      string[],  // ex: [] (vazio = *), ou ['jan','feb',...]
  mday:        number|'', // dia do mês (vazio = *)
  label:       string,    // comentário inline no .conf
  trueContext: string,    // contexto de destino quando a condição BATER (VERDADEIRO)
                          // OBRIGATÓRIO: vazio → linha omitida + aviso no .conf
                          // Sincronizado bidirecionalmente com handle 'true' no canvas
}
```
> **Handles:** `true` (RIGHT, source, amarelo) = branch quando condição bate; `closed` (BOTTOM, source, verde) = fall-through quando condição NÃO bate (sequencial, nenhuma instrução gerada).
> **Auto-wire bidirecional:**
> - Edge `true` → ContextNode: preenche `trueContext` automaticamente com `contextName`
> - Digitar `trueContext` + onBlur/Enter: cria edge `true` → ContextNode correspondente
> - Deletar edge `true`: limpa `trueContext`
> **Validação visual:** borda vermelha + "⚠ sem destino vinculado" quando `trueContext` vazio; borda verde + "✓ vinculado" quando preenchido.
> Campo `closedContext` foi **removido** — não existe mais.
> Formato legado suportado: `{ hours: 'HH:MM-HH:MM', days: 'mon-fri', monthdays: '*', months: '*', ... }`. `buildTimeExport()` detecta pelo campo `hours` ausente.

#### `route`
```js
{
  routeMode: 'macro'|'fila'|'contexto',
  queue: string,        // modo fila e macro
  queueOptions: string, // modo fila (ex: 't')
  context: string,      // modo contexto
  extension: string,    // modo contexto (default: 's')
  priority: string      // modo contexto (default: '1')
}
```

#### Nós de Ação (via ACTION_META) — Cobertura Completa

| Tipo | data fields | Exporta | Validação obrigatória |
|---|---|---|---|
| **Controle de Fluxo** | | | |
| `gosub` | context, extension, priority, params[] | `Gosub(ctx,ext,pri(params...))` | context |
| `return` | value | `Return([value])` | — |
| `hangup` | causeCode | `Hangup([cause])` | — |
| `gotoif` | expression, trueDestination, falseDestination | `GotoIf($[expr]?true:false)` | expression |
| **Execução Lógica** | | | |
| `set` | assignment | `Set(VAR=valor)` | format VAR=valor |
| `agi` | script, params[] | `Agi(${AGI_PATH}/script[,params...])` | script |
| `macro` | name, params[] | `Macro(name[,params...])` | name |
| `execif` | expression, action | `ExecIf($[expression]?action)` | expression |
| `execiftime` | hours, days, monthdays, months, action | `ExecIfTime(h,d,md,m?action)` | — |
| `noop` | text | `Noop(text)` | — |
| `verbose` | level, message | `Verbose(level,message)` | — |
| **Interação & Monitoramento** | | | |
| `dial` | destination, timeout, options | `Dial(Tech/resource[,timeout[,opts]])` | destination (Tech/res) |
| `read` | variable, audio, maxDigits, timeout | `Read(VAR,${SOUND_PATH}/audio,max,,timeout)` | variable |
| `saydigits` | value | `SayDigits(value)` | value |
| `saynumber` | value, gender | `SayNumber(value[,gender])` | value |
| `mixmonitor` | filename, extension | `MixMonitor(filename.ext)` | — |
| `stopmonitor` | — | `StopMonitor()` | — |
| `chanspy` | target, options | `ChanSpy(SIP/target[,options])` | target |
| **Sistema / Áudio** | | | |
| `answer` | — | `Answer()` | — |
| `wait` | seconds | `Wait(seconds)` | seconds > 0 |
| `waitexten` | seconds | `WaitExten(seconds)` | seconds > 0 |
| `playback` | filename | `Playback(${SOUND_PATH}/filename)` | filename |
| `background` | filename | `Background(${SOUND_PATH}/filename)` | filename |

> **Params variádicos (agi, macro, gosub):** armazenados em `data.params: string[]`. Backward-compat com campo legado `data.args` (string CSV). `resolveParams()` em actionMeta.js decide qual usar.
> **Validação dual:** `ACTION_META[type].validate(data)` → `string[]`. Chamada pelo ActionNode (canvas, borda vermelha) E pelo exporter (omite linha + aviso `;; AVISO: tipo [id=...] — motivo`). Sumário ao final do .conf se houver erros.

### 4.3 Handles por Tipo de Nó

**Convenção geral para nós de ação:**
- `in` (top, target), `in-left` (left, target)
- `out` (bottom, source), `out-right` (right, source) — ausentes se `terminal: true`

**Exceções e handles especiais:**

| Nó | Handles |
|---|---|
| `config` | `out` (bottom src), `out-right` (right src), `out-left` (left src) — SEM targets |
| `menu` | `in` (top tgt), `in-left` (left tgt); `d-{digit}` (right src, por dígito), `d-i` (right src, laranja), `d-t` (right src, laranja) |
| `time` | `in` (top tgt), `in-left` (left tgt); `true` (RIGHT src, amarelo #ffcc00) = branch para destino verdadeiro; `closed` (bottom src, verde) = fall-through condição falsa. `closed` NÃO está em SEQ_HANDLES global — tratado inline via `isSeqEdge()`. |
| `context` | `ctx-in` (top tgt, 14×14, verde); `ctx-start` (bottom, source, amarelo, y≈44px/center da faixa START) — entry point do fluxo interno. A faixa START é uma div HTML separada do header (não drag handle). |
| `route` | `in` (top tgt), `in-left` (left tgt), `out` (bottom src), `out-right` (right src) |
| `ActionNode` terminal | Apenas `in` + `in-left` (sem source handles) |

**`SEQ_HANDLES`** (constante no exporter): `{'out', 'out-right', 'out-bottom', 'out-left', ''}` — handles de fluxo sequencial. Handle `closed` do TimeNode NÃO está no set global; é tratado inline via função `isSeqEdge(e, curNode)` que retorna `true` para `closed` quando `curNode.type === 'time'`. Handles de branching excluídos: `d-1`, `d-i`, `d-t`, `true`, `open`.

---

## 5. Compilador/Exportador — Regras de Negócio

Arquivo: `src/utils/asteriskExporter.js`
Entry point: `generateDialplan(nodes, edges)` — detecta modo e delega.

### 5.1 Modo Hierárquico (quando qualquer nó `context` existe)

**Trigger:** `nodes.some(n => n.type === 'context')`

#### Fase 1: Anti-Orphan BFS (`findActiveContextIds`)
```
1. Inicia de config.id (se não há config → retorna Set vazio)
2. BFS pelas edges: para cada nó alcançado, segue TODAS as edges de saída
3. Propagação de parentNode: se nó N é alcançável e tem parentNode P, P é marcado como alcançável
4. Contextos ativos = nodes.type==='context' ∩ reachable
```
**Resultado:** apenas contextos conectados (direta ou indiretamente) ao config são exportados.

#### Fase 2: Ordenação dos Contextos
```js
sort((a,b) => {
  ao = a.data.order !== undefined && a.data.order !== '' ? Number(a.data.order) : Infinity
  bo = b.data.order !== undefined && b.data.order !== '' ? Number(b.data.order) : Infinity
  return ao - bo
})
```
- Contextos com `order` preenchido vêm primeiro, em ordem crescente.
- Contextos sem `order` (Infinity) mantêm ordem relativa do array `nodes`.
- **`order` é apenas de output** — não afeta lógica de conexões ou anti-orphan.

#### Fase 2.5: Contexto de entrada para nós standalone

Antes de iterar os ContextNodes, o exportador verifica se existe um `config` sem `parentNode` (flutuando fora de qualquer caixa de contexto). Se existir:
- Constrói uma cadeia seguindo edges sequenciais (`isSeqEdge`) por nós que também não têm `parentNode` (standalone)
- Gera `[orpen-ivr-{IVR}]` com o mesmo pipeline sSeq/DTMF dos contextos normais
- O contexto de entrada aparece ANTES dos demais contextos no .conf
- Isso suporta o padrão onde Config → TimeNode → MenuNode ficam no canvas SEM serem colocados dentro de um ContextBox

#### Fase 3: `getExecChain(ctx, children)` — Ordem de execução interna

```
1. Busca edge de ctx-start: edges.source===ctx.id && sourceHandle==='ctx-start'
2. SE EXISTE:
   - Inicia do target dessa edge
   - Walk: a cada nó, busca edge SEQ_HANDLES dentro do mesmo childSet
   - Para ao sair do contexto ou não encontrar próxima edge
3. SE NÃO EXISTE (fallback):
   - Filtra children excluindo type==='context'
   - Ordena por position.y, depois position.x
```

#### Fase 4: `linesForChild(n)` — Geração de linhas por tipo

| Tipo | Linhas geradas |
|---|---|
| `ACTION_META[type]` | `[actionLine(n)]` (delegado a actionMeta.js) |
| `config` | `Set(__IVR=...)`, `Set(__NUMBER_DIALED=...)` (se numberDialed), `Set(SOUND_PATH=...)`, `Set(AGI_PATH=...)`, `Macro(logIvr,ENTER_IVR)` (se logIvr), `Set(CHANNEL(language)=...)`, `Noop(## comment ##)` |
| `time` | `GotoIfTime(times,weekdays,mdays,months?dest,s,1)`. Destino resolvido em 3 prioridades: **(1)** edge com `sourceHandle === 'true'` (ou `'open'` para compat.) → lê `contextName` do target em tempo de export; **(2)** `data.trueContext` (campo de texto); **(3)** varredura ampla: qualquer edge do nó que aponte para ContextNode. Se nenhuma resolve → `[]` + aviso standalone `;; AVISO: TimeCondition sem destino configurado — nó ignorado [id=...]` (nunca embutido em `exten =>`). |
| `route` | fila: `Queue(queue[,opts])` / macro: 3 linhas Set+Goto / contexto: `Goto(ctx,ext,pri)` |
| `menu`, `context` | `[]` (menus são tratados separadamente pelo sSeq) |

**Menus no sSeq:** quando menu está no chain, adiciona `Background(${SOUND_PATH}/greeting)` com label `(menu)` e `WaitExten(n)`.

#### Fase 5: Formatação do sSeq

```
i=0 → 'exten => s,1,...'
i>0 → 'exten => s,n,...'
item.label → 'exten => s,n(label),...'
```

#### Fase 6: DTMF (`emitDigit`)

Para cada menu filho, gera extensões DTMF:
- `context` target → `Goto(contextName,s,1)`
- `route` target → inline `linesForChild(route)` como `exten => digit,1/n,...`
- `menu` target com contextName → `Goto(contextName,s,1)`
- `ACTION_META` target → `walkChainLines(target)` inline
- `i`/`t` handles: usa edge se conectada, senão fallback com Macro(invalidMacro/timeoutMacro)

#### `walkChainLines(startNode)` — Cadeia de ações

Segue nodes sequencialmente via SEQ_HANDLES. Para quando:
- `cur.type === 'route'` (sempre terminal)
- `ACTION_META[type].terminal === true` (return, hangup)
- Sem edge SEQ_HANDLES de saída
- Próximo nó é `context` → emite `Goto(contextName,s,1)` e para

#### `jumpLabel(node)` — Destino de salto

| Tipo | Retorna |
|---|---|
| `context` | `contextName,s,1` |
| `menu` (com contextName) | `contextName,s,1` |
| `route` fila | `null` |
| `route` macro | `orpen-ivr-transfer,s,1` |
| `route` contexto | `context,extension,priority` |
| outros | `null` |

### 5.2 Modo Legado (sem Context Nodes)

**Trigger:** `!nodes.some(n => n.type === 'context')`

Fluxo de geração:
1. Encontra `config` → gera `[orpen-ivr-{IVR}]` com variáveis
2. Caminha `config → time* → menu` via `outEdges` (sem filtro de handle)
3. Gera `GotoIfTime(...)` para cada time no chain
4. BFS de menus a partir do rootMenu:
   - Gera contexto por menu
   - Para cada dígito: gera extensão inline para route, sub-contexto para action chains
5. Gera sub-contextos de action chains
6. Gera macros de invalid/timeout

> **NOTA:** customerAgi foi **removido** do modo legado também (Fix 2).

### 5.3 Formato de Saída (.conf)

```asterisk
;;===========================================================================
;; URA Orpen :: GERADO POR orpen-ura-builder :: 2026-05-16T...
;; MODO HIERÁRQUICO :: N contexto(s) ativos
;;===========================================================================

[nome-do-contexto]
exten => s,1,PrimeiraApp(args)
exten => s,n,SegundaApp(args)
exten => s,n(menu),Background(${SOUND_PATH}/greeting)
exten => s,n,WaitExten(4)

exten => 1,1,Goto(outro-contexto,s,1)
exten => 2,1,Queue(7000)
exten => i,1,Macro(menu-invalid-orpen-home)
exten => i,n,Goto(nome-do-contexto,s,menu)
exten => t,1,Macro(menu-timeout-orpen-home)
exten => t,n,Goto(nome-do-contexto,s,menu)

[segundo-contexto]
...
```

---

## 6. Padrões Asterisk Seguidos

### Contextos
- Nomes: kebab-case, prefixo `orpen-ivr-`, ex: `orpen-ivr-home`, `orpen-ivr-transfer`
- Macro de transfer: `orpen-ivr-transfer` (hardcoded no modo macro do RouteNode)
- Incluído: `include => hangup-ivr` no modo legado

### Variáveis de Canal
- `__IVR` (duplo underscore = herdável): número do IVR
- `__NUMBER_DIALED`: número discado original
- `SOUND_PATH`: caminho base dos áudios
- `AGI_PATH`: caminho base dos scripts AGI
- `DESTINY_TRANFER` (typo intencional, padrão Orpen): destino do transfer macro
- `TYPE_TRANSFER`: tipo do transfer (QUEUE)

### Macros Orpen
- `logIvr,ENTER_IVR`: log de entrada no IVR
- `logIvr,ENTER_CONTEXT,{ctx}`: log de entrada em sub-contexto
- `{nomeMenu-invalid/timeout}`: fallback de dígito inválido/timeout

### GotoIfTime Syntax
```asterisk
GotoIfTime(times,weekdays,mdays,months?context,s,1)
```
- `times`: `HH:MM-HH:MM` ou `*`
- `weekdays`: `mon-fri` (range consecutivo) ou `mon&wed` (não-consecutivo) ou `*`
- `mdays`: `1`-`31` ou `*`
- `months`: mesmo padrão que weekdays (`jan`, `feb`, ..., `dec`)

### Formatos de Extensão
```asterisk
exten => s,1,App()       ; primeira prioridade
exten => s,n,App()       ; próxima prioridade sequencial
exten => s,n(label),App(); com label para Goto
exten => N,1,App()       ; extensão DTMF (N = dígito, i, t)
```

---

## 6.5 Sistema de Edges Dinâmicas — Floating Handles + Waypoints + Routing Ortogonal

### Arquitetura de Arquivos

| Arquivo | Papel |
|---|---|
| `src/utils/edgeUtils.js` | Geometria: `getEdgeParams`, `getEdgeParamsDirected`, `isSemanticHandle` |
| `src/components/edges/EdgeWithWaypoints.jsx` | Edge `type: 'floating'` — floating handles + waypoints editáveis + routing ortogonal |
| `src/contexts/EdgeModeContext.js` | Contexto React: modo `'free'`\|`'grid'`, `GRID_SIZE=20`, `snapToGrid()` |

### Funções Geométricas (`edgeUtils.js`)

**`getEdgeParams(sourceNode, targetNode)`** — interseção elipse/bounding-box entre os centros dos dois nós. Retorna `{sx, sy, tx, ty, sourcePos, targetPos}`.

**`getEdgeParamsDirected(sourceNode, targetNode, firstWp, lastWp)`** — versão dirigida para quando há waypoints:
- `sx/sy`: endpoint do source calculado em direção ao **primeiro waypoint**
- `tx/ty`: endpoint do target calculado a partir do **último waypoint**
- Garante que a edge entre/saia pelo lado geometricamente correto (evita endpoints na borda errada)

**`isSemanticHandle(handle)`** — retorna `true` para handles com posição fixa obrigatória.

### Classificação de Handles

**Fixo (semântico)** — `type: 'smoothstep'`, posição não pode ser calculada dinamicamente:

| Handle | Nó | Motivo |
|---|---|---|
| `ctx-start` | ContextNode | Deve sair da faixa START — posição visual obrigatória |
| `d-*` (DTMF) | MenuNode | Cada dígito alinhado à sua linha — fixo à direita |

**Floating (dinâmico)** — `type: 'floating'`, todos os demais: `in`, `in-left`, `out`, `out-right`, `ctx-in`, `true`, `closed`, `out-left`, etc. Endpoints reposicionados automaticamente ao mover nós.

> **Mudança de design:** `ctx-in`, `true`, `closed` e `open` foram **removidos** de `FIXED_HANDLES` para permitir waypoints nessas edges. A edge amarela do `true` handle continua `smoothstep` porque é explicitamente criada com esse tipo no bloco dedicado de `onConnect`.

### Critério de Seleção do Tipo de Edge

Em `onConnect`, `isSemanticHandle(sourceHandle) || isSemanticHandle(targetHandle)`:
- `true` → `type: 'smoothstep'` — edge fixa, sem waypoints
- `false` → `type: 'floating'` — EdgeWithWaypoints, suporta waypoints e routing ortogonal

### Path Ortogonal (`buildOrthogonalPath`)

**Sempre usado** com waypoints — sem diagonais, apenas segmentos horizontais e verticais:
- Pontos já alinhados (mesmo x ou y): linha reta direta
- Caso contrário: **L-shape** com canto arredondado (R=6px): horizontal até B.x, depois vertical até B.y via `Q (corner) (ax,ay)`

### Sistema de Waypoints

**Dados**: `edge.data.waypoints = [{x,y}, ...]` — vazio por padrão. Serializado com o estado do React Flow.

**Path sem waypoints**: `getSmoothStepPath` (borderRadius=6) — visual suave.  
**Path com waypoints**: `buildOrthogonalPath(allPoints)` — ortogonal com cantos arredondados. `allPoints = [endpoint_src, ...waypoints, endpoint_tgt]` onde os endpoints usam `getEdgeParamsDirected`.

**Controles** — visíveis **somente quando a edge está selecionada** (EdgeLabelRenderer HTML, não SVG):
- `SegmentMidHandle` ⊕: ponto sutil no centro de cada segmento. Hover → cresce. MouseDown → cria waypoint no ponto clicado + drag imediato (um único gesto)
- `WaypointDot` ●: bolinha sobre cada waypoint existente. Drag = mover. Hover = botão ×. Botão direito = menu "Remover ponto" (via `createPortal` no `document.body`)

**Por que `EdgeLabelRenderer` (HTML) e não SVG?** Eventos `onMouseDown` em SVG dentro de custom edges do React Flow são interceptados pelo sistema interno antes de chegarem aos handlers — HTML divs no `EdgeLabelRenderer` têm event handling confiável.

**Regra dos Hooks:** todos os `useCallback`/`useStore`/`useReactFlow` são chamados **antes** de qualquer early return condicional. O early return (que aguarda dimensões dos nós) vem **depois** de todos os hooks.

### Modo de Roteamento (EdgeModeContext)

**Estado:** `edgeMode: 'free' | 'grid'` — gerenciado em `Canvas` (App.jsx), compartilhado via `EdgeModeContext.Provider`.

**Toggle:** botão no status bar "◌ LIVRE" ↔ "⊞ GRADE".

**Modo grade:** waypoints e midpoints snappam para `Math.round(v / 20) * 20` ao serem criados e durante o drag. Coincide com `<Background gap={20} />`.

**Snap aplicado em:**
- `SegmentMidHandle.handleMouseDown`: posição inicial do waypoint
- `startSegmentDrag.onMove`: cada evento mousemove
- `WaypointDot.handleDown.move`: cada evento mousemove

### Context Menu da Edge (clique direito)

- **"↺ Redefinir trajeto"**: limpa `data.waypoints = []` → só aparece para `type: 'floating'` com waypoints existentes
- **"⌫ Remover conexão"**: sempre disponível; aplica cleanup do `trueContext` se `sourceHandle === 'true'`

## 7. Lógica de Interação do Canvas (App.jsx)

### Estado Global (Canvas component)
```js
nodes         // useNodesState — array React Flow
edges         // useEdgesState — array React Flow
selectedId    // useState — ID do nó selecionado
showExport    // useState — visibilidade do modal
exportText    // useState — texto gerado do .conf
edgeMenu      // useState — { x, y, edgeId } | null — context menu de edge (botão direito)
edgeMode      // useState — 'free' | 'grid' — modo de roteamento de waypoints
              //            Compartilhado via EdgeModeContext.Provider
```

### Exclusão e Interação de Edges

**Seleção visual:** clicar em uma edge a seleciona. CSS: `.react-flow__edge.selected .react-flow__edge-path` → stroke `#ffcc00` (amarelo neon) + `drop-shadow`. Área de interação: `stroke-width: 24` na classe `.react-flow__edge-interaction`.

**Delete por teclado:** `deleteKeyCode={['Backspace', 'Delete']}` no ReactFlow. Quando edge é deletada, `handleEdgesChange` intercepta o change de tipo `'remove'` e aplica cleanup (ver Auto-wire bidirecional).

**Context menu (botão direito):** `onEdgeContextMenu` no ReactFlow → `setEdgeMenu({ x, y, edgeId })`. Renderiza um menu fixo (position: fixed) com overlay invisível. Itens: "↺ Redefinir trajeto" (só para floating com waypoints) + "⌫ Remover conexão".

**`removeEdgeById(edgeId)`:** função em App.jsx que:
1. Verifica se a edge tem `sourceHandle === 'true'` → limpa `data.trueContext` no nó de origem
2. Remove a edge via `setEdges`
3. Fecha o context menu

**Auto-wire cleanup em `handleEdgesChange`:**
Sempre que uma edge com `sourceHandle === 'true'` é removida (via teclado, botão direito, ou qualquer outro mecanismo), o campo `data.trueContext` do TimeNode de origem é automaticamente zerado.

### Drag & Drop
1. Sidebar: `onDragStart` → `setData('application/rcx-node', type)`
2. Canvas `onDrop`: `buildNode(type, rfInstance.project(dropPosition))`
3. **Auto-reparenting ao drop**: `findContextAt(absPos, nodes)` — encontra ContextNode mais profundo (iterando de trás pra frente) cujo bounding box contém a posição. Se encontrado, `newNode.parentNode = ctx.id`, `extent = 'parent'`, position ajustada para relativa.
4. Config único: alerta se `nodes.some(n => n.type === 'config')` ao tentar dropar outro.

### Re-parenting ao Arrastar (`onNodeDragStop`)
- Calcula posição absoluta do nó (soma parentNode.position se tiver pai)
- `findContextAt` com a posição absoluta
- Se targetId !== currentParent → `setNodes` reescrevendo parentNode/extent
- Garante ordenação no array: filho deve aparecer DEPOIS do pai (exigência React Flow)

### Sincronização Goto-Context
`useEffect([edges])`: quando edge conecta um nó `goto` a um `context`, copia `contextName` para `goto.data.context` automaticamente (eliminado pois `goto` foi removido — mantido por histórico).

### ReactFlow Config
```jsx
connectionLineType="smoothstep"
deleteKeyCode={['Backspace', 'Delete']}
multiSelectionKeyCode={['Meta', 'Control']}
edgeTypes={stableEdgeTypes}   // { floating: EdgeWithWaypoints }
defaultEdgeOptions={{
  type: 'smoothstep',
  style: { stroke: '#00ff41', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff41' }
}}
```

### MiniMap Cores
```js
config  → '#00ff41'
menu    → '#00b32d'
time    → '#ffcc00'
route   → '#ff8c00'  // (não mapeado explicitamente, cai no else '#888')
ACTION_META[type] → meta.color
default → '#888'
```

---

## 8. Convenções de Código

### Padrão de Componente de Nó

Todo nó é um componente `memo` com `displayName`:

```jsx
const MeuNode = memo(({ id, data, selected }) => {
  return (
    <div className={cls('rcx-node', selected && 'selected')} style={{ borderColor: COR }}>
      <Handle type="target" position={Position.Top}    id="in"        />
      <Handle type="target" position={Position.Left}   id="in-left"   />
      <div className="rcx-node-header">...</div>
      <div className="rcx-node-body">
        <div className="rcx-node-row"><span className="k">key</span><span className="v">value</span></div>
      </div>
      <Handle type="source" position={Position.Bottom} id="out"       />
      <Handle type="source" position={Position.Right}  id="out-right" />
    </div>
  );
});
MeuNode.displayName = 'MeuNode';
export default MeuNode;
```

### Como Adicionar um Novo Nó de Ação (ActionNode)

1. **`actionMeta.js`**: Adicionar entrada em `ACTION_META` com `title`, `app`, `icon`, `color`, `category`, `summary`, e `terminal` se aplicável. Adicionar `case` em `actionLine()`.
2. **`buildNode.js`**: Adicionar `case 'tipo'` com `data` defaults.
3. **`nodes/index.jsx`**: `tipo: mkActionType('tipo')` no objeto `nodeTypes`.
4. **`Sidebar.jsx`**: Importar ícone, adicionar item na categoria correta de `CATEGORIES`.
5. **`PropertiesPanel.jsx`**: Adicionar `{node.type === 'tipo' && (...)}` com `Field`/`Toggle` adequados.

### Como Adicionar um Nó Estrutural Customizado

1. Criar `src/components/nodes/NomeNode.jsx` (padrão memo + displayName).
2. Importar e registrar diretamente em `nodeTypes` (não via `mkActionType`).
3. Adicionar à palette da Sidebar.
4. Implementar lógica em `linesForChild()` no exporter.
5. Se tiver handles não-padrão, adicionar ao SEQ_HANDLES check se necessário.

### `Field` e `Toggle` — Componentes de Input

Definidos **fora** do PropertiesPanel (escopo de módulo) para evitar recriação a cada render:

```jsx
// Field — input text/number/select
<Field d={d} set={set} label="Label" k="chave" type="text|number" placeholder="..." options={['a','b']} />

// Toggle — checkbox
<Toggle d={d} set={set} label="Label" k="chave" />

// set function padrão:
const set = (key, val) => updateNodeData(node.id, { ...d, [key]: val });
```

### WeekdayPicker / MonthPicker

Componentes memo para o TimeNode. Recebem `selected: string[]` e `onChange: (string[]) => void`. Detectam sequência consecutiva para exibir preview `mon-fri` vs `mon&wed`.

### Naming

- **Tipos de nó**: kebab-case singular (`config`, `menu`, `time`, `route`, `context`, `gosub`, `execiftime`, ...)
- **Handles**: kebab-case (`in`, `out`, `in-left`, `out-right`, `ctx-in`, `ctx-start`, `d-{digit}`, `open`, `closed`)
- **CSS classes**: prefixo `rcx-` para nós (`.rcx-node`, `.rcx-node-header`, `.ctx-node`, `.ctx-header`)
- **IDs de nós**: `'n_' + uid()` (uid = 7 chars base36)

---

## 8.4 Sistema de Labels no Dialplan

### Conceito
Labels marcam uma linha específica dentro de uma extensão: `exten => s,n(label),Cmd()`. Permitem que `Goto`, `GotoIf` e `GotoIfTime` saltem diretamente para aquele ponto dentro do contexto.

### Nós que suportam label (`supportsLabel: true` em ACTION_META)

| Tipo | Motivo |
|---|---|
| `background` | Padrão `(menu)` — destino clássico de Goto. Permite re-exibir o menu. |
| `playback` | Ponto de re-início de reprodução de áudio. |
| `waitexten` | Re-entrada na espera de DTMF após loop ou validação. |
| `noop` | Marcador/âncora no fluxo — uso como label puro. |
| `set` | Reset de estado — re-entrada após configuração de variável. |
| `agi` | Re-entrada em consulta AGI (ex: busca de dados). |
| `macro` | Re-entrada em execução de macro. |
| `read` | Re-prompt de entrada DTMF após validação. |

**NÃO elegíveis:** gosub, return, hangup, gotoif (são saltos, não alvos); answer, wait, dial, execif, execiftime (não são destinos típicos); nós de monitoramento.

### Regras de validação do campo label

- Formato: `/^[a-z0-9-]+$/` — apenas letras minúsculas, números e hífen
- Validação é aplicada automaticamente no `onChange` (normalização automática: strip de caracteres inválidos)
- **Borda vermelha** + mensagem inline: formato inválido
- **Borda laranja** + mensagem inline: label duplicado dentro do mesmo ContextNode pai
- **Preview amarelo**: `exten => s,n(label),Cmd()` quando válido

### Geração no .conf

- Com label: `exten => s,n(menu),Background(...)` — somente na **primeira** linha do nó
- Sem label: `exten => s,n,Background(...)` — sem parênteses
- Menu estrutural (`menu` node): usa `data.label` se definido, senão `'menu'` (padrão histórico)

### Autocomplete de labels em GotoIf

- Campo "Destino Verdadeiro" e "Destino Falso" usam `<datalist>` com todas as combinações `contextName,s,label` disponíveis no canvas
- Sugestões calculadas em tempo real a partir dos nós com `supportsLabel: true` e `data.label` não-vazio
- Se o label referenciado não existir no canvas: `;; AVISO: Goto referencia label 'X' que não foi encontrado no canvas` emitido no .conf

### Display no canvas

Badge amarelo `(label)` aparece entre o cabeçalho e o corpo do ActionNode quando label está preenchido.

## 8.4.5 Sidebar — Pesquisa, Accordion e Tags Semânticas

### Estrutura de Dados

`CATEGORIES` é um array de objetos `{ label, items[] }` onde cada item tem `{ type, title, desc, accent, Icon }`. O `desc` geralmente contém o comando Asterisk correspondente embutido (ex: `"GotoIfTime · horário/dias/meses"`).

### Sistema de Pesquisa com Scoring de Relevância

- **Estado:** `query: string`, `searchFocused: boolean` (useState)
- **Ativação:** `isSearching = normalize(query.trim()).length > 0`
- **Normalização:** função `normalize(str)` remove acentos e converte para minúsculo — permite `"validacao"` bater com `"validação"`, `"audio"` com `"áudio"`, etc.
- **Scoring por item** (`scoreItem(item, nq)`):
  | Score | Critério |
  |---|---|
  | 4 | Título exatamente igual ao termo |
  | 3 | Título contém o termo |
  | 2 | Descrição ou type contém o termo |
  | 1 | Tag semântica contém o termo |
  | 0 | Nenhum match — item excluído |
- **Ordenação:** itens com score > 0 ordenados por score decrescente dentro de cada categoria
- **Hierarquia de categorias:** preservada — apenas os itens são reordenados/filtrados
- **"Nenhum resultado":** div centralizado `// nenhum resultado` com opacidade 0.4
- **Botão ×:** limpa campo e devolve foco ao input
- **CSS do placeholder:** `.sidebar-search::placeholder` em `index.css` — cor neon, opacity 0.35, itálico

### Tags Semânticas

**Arquivo:** `src/config/nodeTags.js`

Mapa `NODE_TAGS: Record<nodeType, string[]>` com tags em português para cada tipo de nó. A busca usa correspondência parcial normalizada (`normalize(tag).includes(normalize(query))`).

**Exemplos de termos e resultados:**

| Termo digitado | Nós encontrados |
|---|---|
| `audio` | Playback, Background, Menu DTMF, Wait Exten |
| `validação` ou `val` | Time Cond, GotoIf, ExecIf, ExecIfTime |
| `fila` | Destino/Rota, Dial |
| `script` | AGI |
| `espera` | Wait, WaitExten |
| `menu` | Menu DTMF, GotoIf, WaitExten |
| `encerrar` | Hangup |
| `log` | Noop, Verbose |
| `gravação` | MixMonitor, StopMonitor |

**Como adicionar tags para um novo nó:**
1. Abrir `src/config/nodeTags.js`
2. Adicionar entrada: `nomeDoType: ['tag1', 'tag2', ...]`
3. Usar termos em português, sem acentos, minúsculos
4. Focar em conceitos (não apenas nome técnico)

### Hint Semântico

Aparece abaixo do campo de pesquisa quando `searchFocused && !query`:
```
// ex: "audio", "validação", "fila", "script"
```
Desaparece ao começar a digitar (controlado por `searchFocused` + `query`).

### Accordion Colapsável (inalterado)

- **Estado:** `collapsed: Record<label, boolean>` + `localStorage['orpen-sidebar-collapsed']`
- Animação: `maxHeight: 0 → 2000px` com `transition: 0.22s ease`
- Indicadores `▼` / `►` no header
- Pesquisa sempre mostra conteúdo independente do estado colapsado

### Accordion Colapsável

- **Estado:** `collapsed: Record<label, boolean>` (useState + localStorage)
- **Chave localStorage:** `'orpen-sidebar-collapsed'`
- **Padrão inicial:** todas expandidas (objeto vazio = nenhuma colapsada)
- **Animação:** `maxHeight: 0 → 2000px` com `transition: max-height 0.22s ease`
- **Indicador visual:** `▼` (expandida) e `►` (colapsada) alinhados à direita do header
- **Hover do header:** background ligeiramente mais claro (`rgba(0,255,65,0.11)`) — desativado durante pesquisa
- **Cursor:** `pointer` no header quando não há pesquisa; `default` quando há pesquisa ativa
- **Override de pesquisa:** `isCollapsed = !isSearching && !!collapsed[label]` — pesquisa sempre exibe conteúdo mesmo se categoria estiver colapsada

### Comportamento Integrado

| Ação | Resultado |
|---|---|
| Digitar na pesquisa | Filtra itens, expande todas as categorias visíveis, oculta dica de rodapé |
| Clicar × | Limpa pesquisa, restaura estado colapsado do localStorage, restaura dica |
| Clicar header da categoria | Alterna colapso; persiste no localStorage; ignorado durante pesquisa |
| Recarregar página | Estado colapsado restaurado do localStorage; pesquisa vazia |
| Drag de item colapsado | Não possível (item oculto); drag de item em resultado de pesquisa funciona normalmente |

## 8.5 Sistema de Propagação de Rename de ContextNode

Arquivo central: `src/utils/renamePropagator.js` — exporta `applyContextRename(nodes, oldName, newName)`.

### Funcionamento

Quando o `contextName` de um ContextNode é alterado, a função percorre todos os nós e atualiza os campos que referenciam aquele nome por string. A propagação é **silenciosa e imediata** (sem dialog de confirmação), disparada no evento `onBlur` do campo de nome.

### Dois pontos de disparo

| Ponto | Como | Quando |
|---|---|---|
| **ContextNode inline** (cabeçalho do nó) | `useRef` captura nome no `onFocus`; `onBlur` chama `propagateRename(old, new)` via `useReactFlow().setNodes` | Ao sair do campo de texto no cabeçalho do nó |
| **PropertiesPanel** (campo "Nome do Contexto Asterisk") | `useRef` captura nome no `onFocus`; `onBlur` chama `propagateContextRename(old, new)` via prop do App.jsx | Ao sair do campo no painel de propriedades |

### Nós afetados pela cascata

| Tipo | Campo atualizado | Condição |
|---|---|---|
| `time` | `data.trueContext` | sempre (campo "Destino se verdadeiro") |
| `route` | `data.context` | somente quando `data.routeMode === 'contexto'` |
| `gosub` | `data.context` | sempre (destino do Gosub) |

### Fora do escopo da cascata

- `menu.contextName`: identidade própria do menu no dialplan, não referência cruzada
- `execif.action`, `execiftime.action`: texto livre, não parseável automaticamente
- `menu.retryGoto`: string livre "ctx,ext,pri"
- Edges: conectam por ID de nó, não por nome — não precisam de atualização

### Detalhe de implementação

A função `applyContextRename` usa mapeamento funcional (`nodes.map`) e retorna o array ORIGINAL se nenhum nó foi alterado (evita re-render desnecessário no React Flow). O `useRef` é necessário porque `onChange` já sobrescreve `data.contextName` a cada tecla — sem o ref, o "nome antigo" seria perdido ao chegar no `onBlur`.

## 8.6 Sistema de Gerenciamento de Projetos (Home Screen)

### Roteamento

Estado simples em `App` (raiz): `screen: 'home' | 'canvas'`. Sem dependências de roteador externo. A aplicação inicia sempre em `'home'`.

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/screens/HomeScreen.jsx` | Tela inicial — lista projetos, cria, importa |
| `src/App.jsx` | Gerencia estado de roteamento e projetos; passa props ao Canvas |

### Camada de Persistência — IndexedDB

**Arquivo:** `src/services/projectStorage.js`

| Função | Descrição |
|---|---|
| `salvarProjeto(projeto)` | Cria ou atualiza (upsert) pelo `id` |
| `listarProjetos()` | Retorna todos, ordenados por `dataModificacao` desc |
| `carregarProjeto(id)` | Retorna projeto completo ou `null` |
| `excluirProjeto(id)` | Remove pelo `id` |
| `projetoExiste(id)` | Verifica existência sem ler o flow completo |

**Banco:** `orpen-ura-db` v1. ObjectStore `projects` com `keyPath: 'id'`. Criado automaticamente na primeira chamada.

**Auto-save no Canvas:** `useEffect([nodes, edges])` com debounce de 2s. Após mudança, exibe `// salvando...` (amarelo) no status bar. Após salvo, exibe `// salvo` (verde) por 3s. Não faz download de arquivo — o save é silencioso.

**Eventos que disparam download de arquivo:** apenas ações explícitas do usuário: "EXPORTAR URA (.CONF)" e "EXPORTAR .JSON" nos cards da Home.

### Estrutura do arquivo JSON de projeto

```json
{
  "id": "1716000000000",
  "name": "orpen-ivr-suporte",
  "dataCriacao": "2026-05-17T...",
  "dataModificacao": "2026-05-17T...",
  "flow": {
    "nodes": [...],
    "edges": [...],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

### Ciclo de vida de um projeto

```
Home → [+ NOVO PROJETO] → modal de criação → Canvas (flow vazio)
                                               ↓
Home ← [← VOLTAR] ← confirmação se dirty ← Canvas (edição)
                                               ↓
Home ← card "EXPORTAR .JSON" ←── [SALVAR .JSON] (Canvas salva + atualiza projects[])
Home → [IMPORTAR .JSON] → FileReader → valida → adiciona ao projects[]
Home → card "ABRIR" → modal confirm → Canvas (flow carregado)
```

### Estado de projetos

- **In-memory**: `projects: Project[]` em `App`. Não persiste entre reloads (sem localStorage).
- **`key={currentProject?.id}`** no Canvas força remount ao trocar projeto — garante estado limpo.
- **`pendingFlow`**: flow a ser carregado no próximo mount do Canvas.

### Rastreamento de alterações não salvas

`isDirtyRef` (`useRef<boolean>`) no Canvas. Setado para `true` em `useEffect([nodes, edges])` após o primeiro render (`skipDirtyRef` ignora a inicialização). Zerado após save. Ao clicar "← VOLTAR" com dirty = true, exibe modal de confirmação com opções "SALVAR E VOLTAR", "SAIR SEM SALVAR", "CANCELAR".

### Props do Canvas (opcionais para modo standalone)

```ts
{
  initialFlow?: { nodes, edges, viewport }  // null → flow padrão (config node)
  projectName?: string                       // exibe botão SALVAR .JSON
  projectCreatedAt?: string                  // ISO date preservado no JSON salvo
  currentProjectId?: string                  // key para atualizar projects[]
  onGoBack?: () => void                      // exibe botão ← VOLTAR
  onProjectSaved?: (project) => void         // callback após save
}
```

### Validação do nome de projeto

`/^[a-z0-9-]+$/` mínimo 3 caracteres. Validação em tempo real no modal — borda vermelha + mensagem inline se inválido. Botão CRIAR desabilitado enquanto inválido.

### Parser de .conf (`src/utils/confParser.js`)

**Entry point:** `parseConfFile(text)` → `{ nodes, edges, stats, suggestedName }`

**Mapeamento de comandos Asterisk → tipo de nó:**

| Comando | Tipo gerado |
|---|---|
| Set(__IVR=), Set(SOUND_PATH=), Set(AGI_PATH=), Macro(logIvr), Noop(## ##) | ConfigNode (agregado) |
| Answer, Hangup, Wait, WaitExten, Noop, Playback, Background | Nó correspondente |
| GotoIfTime | time (com campos preenchidos) |
| Goto(ctx,...) | route (contexto) |
| Queue(num) | route (fila) |
| AGI, Macro, Gosub, Return, GotoIf, Dial, Set, Verbose, ChanSpy | Nó correspondente |
| `;exten => ...` (comentado) | **CommentedNode** |
| Comando não reconhecido | **RawNode** |

**CommentedNode** — visual: borda dashed `#ffcc00`, opacidade 0.7. Não gera linha no .conf. Botão "REATIVAR" tenta converter para o nó equivalente.

**RawNode** — visual: borda `#ff8c00`. Armazena e exibe o comando original em textarea editável. Exporta a linha intacta no .conf.

Ambos registrados em `nodeTypes` e tratados em `linesForChild()` no exporter.

**Modal de resumo:** exibido antes de abrir no canvas. Mostra: contextos importados, nós por tipo, lista de CommentedNodes e RawNodes com o comando original. Usuário nomeia o projeto antes de confirmar.

## 9. Decisões Arquiteturais

| Decisão | Motivo |
|---|---|
| **Estado global no Canvas (App.jsx) sem Zustand/Redux** | Projeto de escopo controlado; React Flow `useNodesState`/`useEdgesState` são suficientes. Evita overhead de setup de store externo. |
| **ActionNode genérico + ACTION_META** | Evita proliferação de um componente por tipo de ação. Novo nó de ação requer apenas entrada no dict, não novo componente. |
| **`mkActionType` factory em index.jsx** | Injeta `type` como prop sem criar novo componente por tipo. O arquivo `.jsx` é necessário pela sintaxe JSX no factory. |
| **ContextNode usa `useReactFlow().setNodes` diretamente** | Eliminou o anti-padrão `window.__rcxUpdateNodeData` do protótipo original. |
| **`SEQ_HANDLES` como Set** | Garante O(1) lookup ao filtrar edges em walkChainLines/getExecChain. |
| **Dois modos de exportação (hierárquico/legado)** | Hierárquico usa ContextNodes como containers e é o modo principal. Legado mantém compatibilidade com canvas sem contextos. |
| **Anti-orphan BFS** | Contextos desconectados não poluem o .conf gerado. Propagação pelo `parentNode` garante que contextos implicitamente alcançados (por conter nós alcançados) também sejam incluídos. |
| **`order` field para ordenação de output** | Não altera lógica de conexões. Permite usuário controlar a sequência dos blocos `[contexto]` no arquivo sem mover nós no canvas. |
| **customerAgi removido da geração automática** | Fix 2: AGI de busca de cadastro deve ser declarado explicitamente via nó AGI no canvas. Evita emissão incorreta de AGI adjacente a GotoIfTime em contextos com TimeCondition. |
| **timeUtils.js separado** | Evita duplicação da lógica de formatação entre TimeNode.jsx (visual) e asteriskExporter.js. `buildTimeExport` suporta formato novo e legado via duck-typing. |
| **Handles omnidirecionais (4 lados)** | Permite diagramas mais naturais sem forçar conexões top→bottom. SEQ_HANDLES garante que o exporter identifique apenas handles de fluxo sequencial. |
| **`connectionLineType="smoothstep"`** | Preview de conexão usa o mesmo estilo das edges finais. |
| **`slugify` em common.js** | Legado do HolidayNode (removido). Atualmente sem uso ativo no codebase, mas mantido como utilitário. |
| **EdgeLabelRenderer para controles de waypoint (não SVG)** | Eventos `onMouseDown` em SVG dentro de custom edges são interceptados pelo React Flow antes dos handlers. HTML divs no EdgeLabelRenderer têm event handling confiável. |
| **`getEdgeParamsDirected` para endpoints com waypoints** | Sem direção explícita, o endpoint do target é calculado em relação ao source — resultando em borda errada quando há waypoints. A versão dirigida usa o último waypoint como referência para o endpoint do target. |
| **Path ortogonal com `buildOrthogonalPath`** | Linhas diagonais entre waypoints são visualmente confusas em diagramas de dialplan. L-shapes (horizontal→vertical) são o padrão em ferramentas como Lucidchart e draw.io. |
| **EdgeModeContext para modo LIVRE/GRADE** | O modo afeta todos os EdgeWithWaypoints no canvas; React context evita passar o estado como prop por todo o tree. |
| **Hooks antes do early return em EdgeWithWaypoints** | Rules of Hooks: useCallback/useStore após um `if (...) return null` viola as regras e causa comportamento indefinido. Todos os hooks devem ser chamados incondicionalmente, antes de qualquer return condicional. |
| **Controles de waypoint visíveis só quando edge selecionada** | Mostrar ⊕ em todas as edges simultaneamente polui o canvas. A seleção é o gatilho natural para edição — padrão usado em todas as ferramentas profissionais. |
| **FIXED_HANDLES reduzido a {'ctx-start'} + /d-/\*** | ctx-in, true, closed eram "fixos" por posição de handle, não por impedimento de waypoints. Separar os dois conceitos permite curvar qualquer edge mantendo semântica de handle onde relevante. |

---

## 10. Itens Removidos / Histórico

| Item | Status | Motivo |
|---|---|---|
| `HolidayNode` | Removido | Abstração desnecessária — usar nós nativos GotoIfTime/ExecIf |
| `QueueNode` (tipo `queue`) | Removido | Incorporado ao `RouteNode` modo `fila` |
| Tipo `goto` (action) | Removido | Incorporado ao `RouteNode` modo `contexto` |
| `window.__rcxUpdateNodeData` | Removido | Substituído por `useReactFlow().setNodes` no ContextNode |
| `window.__rcxPatchNodeStyle` | Removido | `patchNodeStyle` passado como prop para PropertiesPanel |
| `customerAgi` auto-gerado | Removido da compilação | Fix 2 — usar nó AGI explícito |
| Babel Standalone + ImportMap | Removido | Migração do protótipo CDN para Vite+React modular |
| `FloatingEdge.jsx` | Supersedido | EdgeWithWaypoints cobre todos os casos (sem waypoints = SmoothStep, com waypoints = ortogonal) |
| `ctx-in`, `true`, `closed`, `open` em FIXED_HANDLES | Removidos | Permitem now waypoints; `true` handle continua smoothstep por código explícito em onConnect |
| `buildWaypointPath` | Substituído por `buildOrthogonalPath` | Eliminava diagonais; ortogonal é o padrão correto para diagramas de dialplan |
| Sidebar com "SISTEMA/ÁUDIO" mostrando apenas answer/wait/playback | Expandido | + waitexten, background; categorias CONTROLE DE FLUXO (+gotoif), EXECUÇÃO LÓGICA (+set), INTERAÇÃO (+dial) |

---

## 11. Utilitários (`src/utils/`)

### `common.js`
```js
uid()              // → Math.random().toString(36).slice(2,9)  — IDs de nó
cls(...classes)    // → filtra falsies e join(' ')  — className helper
slugify(s)         // → NFD normalize, remove combining chars, lowercase, kebab  — não usado ativamente
DEFAULT_DIGITS     // → [{id:'1',label:'Opcao 1'}, ...{id:'4'}]  — digits padrão de menu
```
> **Atenção:** `DEFAULT_DIGITS` tem labels sem acento (`Opcao`) por limitação de encoding do PowerShell durante criação. Corrigir manualmente se necessário.

### `timeUtils.js`
```js
WEEKDAY_ORDER      // ['sun','mon','tue','wed','thu','fri','sat']
MONTH_ORDER        // ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
MAX_DAYS_PER_MONTH // {jan:31, feb:29, mar:31, apr:30, ...}
formatDayRange(selected, order)  // → 'mon-fri' | 'mon&wed' | '*'
formatTimeRange(start, end)      // → 'HH:MM-HH:MM' | '*'
getMaxDay(selectedMonths)        // → min dos MAX_DAYS dos meses selecionados (1-31)
buildTimeExport(d)               // → 'times,weekdays,mdays,months' — suporta novo e legado
```

### `actionMeta.js`
```js
ACTION_META        // dict tipo→{title,app,icon,color,category,terminal?,summary}
actionLine(n)      // n={type,data} → string Asterisk ou null
```

### `buildNode.js`
```js
buildNode(type, position)  // → node object com id='n_'+uid(), type, position, data defaults
                           // context tem style:{width:480,height:320} e zIndex:-1
```

---

*Última atualização: 2026-05-16*
*Arquivos lidos para construção deste brief: todos os 16 arquivos em `src/` + `package.json` + `vite.config.js`*
