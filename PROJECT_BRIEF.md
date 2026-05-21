# Orpen URA Builder — Project Brief

> Fonte de verdade técnica do projeto. Lida por Claude Code em sessões futuras. Reescrever sempre que arquitetura mudar.

---

## 1. Visão Geral

**Nome:** Orpen URA Builder  
**Propósito:** Editor visual de dialplan Asterisk (extensions.conf) via canvas drag-and-drop. Cada nó representa uma instrução ou bloco do dialplan; as edges representam o fluxo de execução. O resultado é um arquivo `.conf` válido gerado pelo compilador interno.

**Público:** Operadores e desenvolvedores de telefonia da Orpen que precisam montar e manter URAs Asterisk sem editar texto manualmente.

**Entry point:** `index.html` → `src/main.jsx` → `src/App.jsx`

### Stack

| Pacote | Papel |
|---|---|
| Vite 5 | Bundler / dev server |
| React 18 | UI framework |
| ReactFlow 11 | Canvas de grafo interativo |
| @reactflow/node-resizer | Handle de resize para ContextNode |
| lucide-react | Ícones SVG |
| TailwindCSS 3 | Utility classes (uso mínimo — styling principal é CSS custom em `index.css`) |

**Regra JSX:** Vite só processa JSX em `.jsx`/`.tsx`. Nunca usar JSX em `.js`.

---

## 2. Design System / Identidade Visual

### CSS Custom Properties (`:root` em `src/index.css`)

```css
--neon:    #00ff41   /* verde neon — cor primária */
--neon-dim:#00b32d   /* verde escurecido para labels e bordas */
--bg:      #0d0d0d   /* fundo do canvas */
--panel:   #131313   /* fundo dos painéis laterais */
--panel-2: #1a1a1a   /* fundo de controles RF (minimap, etc.) */
--line:    #1f3a23   /* bordas e separadores */
```

### Fontes
Stack monospace: `'JetBrains Mono', 'Fira Code', 'Courier New', ui-monospace, monospace`

### Efeitos Visuais
- **Scanlines:** `body::before` com `repeating-linear-gradient` verde semi-transparente, `z-index:1000`, `pointer-events:none`
- **Neon glow:** `box-shadow` nos botões hover
- **Blink cursor:** classe `.blink` com `animation: blink 1.2s steps(2) infinite`
- **Orphan pulse:** `.ctx-node--orphan:not(.selected)` — borda laranja pulsante em ContextNodes sem conexão de entrada

### Cores de Acento por Categoria

| Cor | Nós/contexto |
|---|---|
| `#00ff41` | config, menu, context, answer, wait, playback, background, waitexten |
| `#ffcc00` | time (handle true, edge amarela), read, saydigits, saynumber |
| `#00d4ff` | gosub, return, gotoif, route-contexto, ContextNode macro |
| `#a78bfa` | set, agi, macro, execif, execiftime, route-macro |
| `#ff8c00` | mixmonitor, stopmonitor, chanspy, dial, route-fila |
| `#ff5050` | hangup, badge "DESATIVADO" |
| `#888888` | noop, verbose |

### Classes CSS Estruturais dos Nós

```
.rcx-node           — container base (border neon-dim, bg panel, min-width 220px)
.rcx-node.selected  — border white + glow branco
.rcx-node-header    — gradiente dark-green, uppercase, flex justify-between
.rcx-node-body      — padding 8px 10px
.rcx-node-row       — flex justify-between, 11px; .k=neon-dim .v=#c7ffd5
.digit-row          — flex, border-top dashed, position:relative
.ctx-node           — bg rgba(0,255,65,0.04), borda dashed neon, flex column
.ctx-node.selected  — borda sólida branca
.ctx-node--orphan   — borda laranja pulsante (sem conexão de entrada)
.ctx-header         — bg rgba(0,255,65,0.18), cursor:move
.ctx-name-input     — input transparente editável inline no cabeçalho
.ctx-body-hint      — hint "ARRASTE NÓS AQUI DENTRO", pointer-events:none
.ctx-orphan-badge   — badge "SEM CONEXÃO" com tooltip
.badge              — inline-block, border neon-dim, font 9px
.palette-item       — border dashed line, cursor grab, hover glow
.btn-neon           — border neon, hover inverte bg/fg
.btn-danger         — border/color #ff3b3b
.term-input/select/textarea — bg #000, border line, color neon, full width
.neon-text          — text-shadow verde
```

---

## 3. Estrutura de Diretórios

```
Construtor URA/
├── PROJECT_BRIEF.md          ← este arquivo
├── index.html                ← Vite entry
├── package.json
├── vite.config.js            ← defineConfig com @vitejs/plugin-react
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx              ← ReactDOM.createRoot; importa reactflow CSS, node-resizer CSS, index.css
    ├── App.jsx               ← Canvas (estado global) + App (roteamento home/canvas)
    ├── index.css             ← Todo o CSS custom
    ├── components/
    │   ├── canvas/
    │   │   └── AlignmentGuides.jsx   ← Renderiza linhas-guia sobre o canvas (usa useStore para viewport)
    │   ├── edges/
    │   │   ├── EdgeWithWaypoints.jsx ← Componente de edge principal (floating + smoothstep)
    │   │   └── FloatingEdge.jsx      ← Componente legacy simples (existe no disco, NÃO registrado em edgeTypes)
    │   ├── nodes/
    │   │   ├── index.jsx       ← nodeTypes registry + mkActionType factory
    │   │   ├── ActionNode.jsx  ← Componente genérico para os 22 nós de ação
    │   │   ├── CommentedNode.jsx ← Nó comentado (borda dashed amarela, exibe originalLine)
    │   │   ├── ConfigNode.jsx  ← Nó START — apenas handles de saída (out, out-right, out-left)
    │   │   ├── ContextNode.jsx ← Container resizável; handles ctx-in (top) e ctx-start (interno)
    │   │   ├── MenuNode.jsx    ← Menu DTMF com handles d-N, d-i, d-t na borda direita
    │   │   ├── RawNode.jsx     ← Linha não reconhecida (orange, textarea editável)
    │   │   ├── RouteNode.jsx   ← Destino unificado: macro/fila/contexto
    │   │   └── TimeNode.jsx    ← Condição temporal: handle true (right, amarelo) + closed (bottom, verde)
    │   └── layout/
    │       ├── Sidebar.jsx     ← Palette accordion (6 categorias) + busca com relevância + drag-and-drop
    │       └── PropertiesPanel.jsx ← Editor de propriedades por tipo de nó (320px, lado direito)
    ├── config/
    │   └── nodeTags.js         ← Mapa de tags semânticas por tipo (para busca na Sidebar)
    ├── contexts/
    │   └── EdgeModeContext.js  ← Context React: 'free'|'grid' + GRID_SIZE=20 + snapToGrid()
    ├── hooks/
    │   └── useAlignmentGuides.js ← Smart guides Figma-style + snap ao soltar
    ├── screens/
    │   └── HomeScreen.jsx      ← Tela inicial: lista de projetos, criar/abrir/importar/excluir
    ├── services/
    │   └── projectStorage.js   ← CRUD IndexedDB: salvarProjeto, listarProjetos, carregarProjeto, excluirProjeto, projetoExiste
    └── utils/
        ├── actionMeta.js       ← ACTION_META (title, app, icon, color, summary, validate, terminal, supportsLabel) + actionLine()
        ├── asteriskExporter.js ← generateDialplan(): modo hierárquico (com ContextNodes) ou legado (sem)
        ├── buildNode.js        ← Factory de nós com todos os defaults por tipo
        ├── common.js           ← uid(), cls(), slugify(), DEFAULT_DIGITS
        ├── confParser.js       ← parseConfFile(): converte .conf Asterisk em nós+edges React Flow
        ├── edgeUtils.js        ← getEdgeParams(), getEdgeParamsDirected(), isSemanticHandle(), computeObstacleAvoidance()
        ├── renamePropagator.js ← applyContextRename(): cascata de rename em time/route/gosub
        └── timeUtils.js        ← formatDayRange(), formatTimeRange(), buildTimeExport(), getMaxDay()
```

---

## 4. Nós Customizados

### 4.1 Dois padrões de nó

**A) Nós Estruturais** — componentes próprios, registrados diretamente no `nodeTypes`:

| Tipo | Componente | Responsabilidade |
|---|---|---|
| `context` | ContextNode.jsx | Container/grupo resizável. Agrupa filhos com `parentNode`. |
| `config` | ConfigNode.jsx | Nó START — define variáveis globais. Sem handles de entrada. |
| `menu` | MenuNode.jsx | Menu DTMF. Gera Background + WaitExten + extensões por dígito. |
| `time` | TimeNode.jsx | Condição temporal GotoIfTime. |
| `route` | RouteNode.jsx | Destino unificado (Goto / Queue / Macro Orpen). |
| `commented` | CommentedNode.jsx | Linha Asterisk comentada (;exten =>). Não gera output. |
| `raw` | RawNode.jsx | Linha não reconhecida. Exporta a string literal intacta. |

**B) Nós de Ação** — renderizados por `ActionNode.jsx` via `mkActionType(type)`:

22 tipos: `gosub, return, hangup, gotoif, set, agi, macro, execif, execiftime, noop, verbose, dial, read, saydigits, saynumber, mixmonitor, stopmonitor, chanspy, answer, wait, waitexten, playback, background`

### 4.2 Dados (`data`) por Tipo de Nó

#### `context`
```js
{
  contextName: string,  // nome do contexto Asterisk — editável inline no cabeçalho
  order?: number|'',    // opcional: posição no .conf (crescente; vazio = sem prioridade)
  isMacro?: bool,       // true quando importado de [macro-*]; visual ciano
}
```
Handles: `ctx-in` (TOP, target, verde/ciano) = recebe edges externas; `ctx-start` (posição absoluta top:44, source, amarelo) = define entry-point do fluxo interno.
Badge "SEM CONEXÃO" visível quando `!hasIncoming && !data.isMacro`.

#### `config`
```js
{
  ivr: string,          // → Set(__IVR=...)
  soundPath: string,    // → Set(SOUND_PATH=...)
  agiPath: string,      // → Set(AGI_PATH=...)
  language: string,     // → Set(CHANNEL(language)=...)
  comment: string,      // → Noop(## comment ##)
  numberDialed: bool,   // → Set(__NUMBER_DIALED=${CALLERID(num)})
  logIvr: bool,         // → Macro(logIvr,ENTER_IVR)
  customerAgi: bool,    // LEGADO — presente no buildNode mas ignorado pelo exportador
}
```
Handles: apenas saída — `out` (BOTTOM), `out-right` (RIGHT), `out-left` (LEFT).  
Para emitir `Agi(customerDataInboundCall_v4.php,...)`, usar um nó AGI explícito no canvas.

#### `menu`
```js
{
  contextName: string,   // nome do contexto deste menu (Goto na exportação)
  greeting: string,      // arquivo de áudio → Background(${SOUND_PATH}/greeting)
  waitExten: number,     // → WaitExten(n)
  digits: [{ id: string, label: string }],  // opções DTMF (1-9, 0)
  invalidMacro: string,  // macro extensão 'i' (fallback: macro-menu-invalid-orpen-home)
  timeoutMacro: string,  // macro extensão 't' (fallback: macro-menu-timeout-orpen-home)
  maxRetry: number,
  retryGoto: string,
  invalidSound: string,
  _dtmfGotos?: object,   // campo interno do confParser (consumido por resolveReferences, ignorado pelo exportador)
}
```
Handles: `in` (TOP target), `in-left` (LEFT target); `d-{digit.id}` (RIGHT source, handle semântico) para cada dígito + `d-i` + `d-t`.  
`updateNodeInternals(id)` chamado via `useEffect([digits.length])` para reposicionar handles ao adicionar/remover dígitos.  
O bloco DTMF usa `margin: -10px` lateral para cancelar o `padding` do `rcx-node-body`, fazendo os handles ficarem exatamente na borda do nó.

#### `time`
```js
{
  timeStart:   string,    // 'HH:MM' (vazio = *)
  timeEnd:     string,    // 'HH:MM' (vazio = *)
  weekdays:    string[],  // ['sun','mon','tue','wed','thu','fri','sat']
  months:      string[],  // ['jan','feb',...] (vazio = *)
  mday:        number|'', // dia do mês (vazio = *)
  label:       string,    // comentário inline
  trueContext: string,    // contexto destino quando condição VERDADEIRA — obrigatório
}
```
Handles: `in` (TOP target), `in-left` (LEFT target); `true` (RIGHT source, amarelo) → branch verdadeiro; `closed` (BOTTOM source, verde) → fall-through (condição falsa, tratado como sequencial no exportador).  
Auto-wire bidirecional:
- Edge `true` → ContextNode: preenche `trueContext` automaticamente
- Digitar `trueContext` + onBlur/Enter: cria edge `true` → ContextNode correspondente via `syncTrueContext`
- Deletar edge `true`: limpa `trueContext`  
Validação visual: borda vermelha + "⚠ sem destino vinculado" quando `trueContext` vazio.

Formato legado suportado: `{ hours, days, monthdays, months }` — `buildTimeExport()` detecta pela ausência de `timeStart`.

#### `route`
```js
{
  routeMode: 'macro'|'fila'|'contexto',
  queue: string,        // modo fila e macro (número/nome da fila)
  queueOptions: string, // modo fila
  context: string,      // modo contexto
  extension: string,    // modo contexto (default: 's')
  priority: string,     // modo contexto (default: '1')
}
```
Exporta:
- `macro` → `Set(DESTINY_TRANFER=queue)` + `Set(TYPE_TRANSFER=QUEUE)` + `Goto(orpen-ivr-transfer,s,1)`
- `fila` → `Queue(queue[,opts])`
- `contexto` → `Goto(context,extension,priority)`

#### `commented` (CommentedNode)
```js
{
  originalLine: string,  // linha original (;exten =>...)
  text?: string,         // fallback display
  onReactivate?: fn,     // callback para reativação (raro)
  reactivateError?: string,
}
```
Visual: borda dashed amarela, opacidade 0.7. Botão "REATIVAR" no header (se `onReactivate` existir). Não gera nenhuma linha no .conf. **Distinto de** `_commented: true` que é o mecanismo de "desativar" qualquer nó pelo menu de contexto — os dois não devem ser confundidos.

#### `raw` (RawNode)
```js
{
  rawLine: string,    // linha Asterisk literal (editável via textarea)
  _commented?: bool,  // se desativado via toggle de comentário
  _origLine?: string, // linha original quando _commented
}
```
Visual: borda laranja. Textarea editável (readOnly quando `_commented`). Exporta a string `rawLine` intacta.

#### Nós de Ação (`ACTION_META`) — Referência Completa

| Tipo | data fields | Exporta | terminal | supportsLabel |
|---|---|---|---|---|
| `gosub` | context, extension, priority, params[] | `Gosub(ctx,ext,pri(args))` | — | sim |
| `return` | value | `Return([value])` | **sim** | — |
| `hangup` | causeCode | `Hangup([cause])` | **sim** | — |
| `gotoif` | expression, trueDestination, falseDestination | `GotoIf($[expr]?true:false)` | — | — |
| `set` | assignment | `Set(VAR=valor)` | — | sim |
| `agi` | script, params[] | `Agi(${AGI_PATH}/script[,params])` | — | sim |
| `macro` | name, params[] | `Macro(name[,params])` | — | sim |
| `execif` | expression, action | `ExecIf($[expr]?action)` | — | — |
| `execiftime` | hours, days, monthdays, months, action | `ExecIfTime(t,d,md,m?action)` | — | — |
| `noop` | text | `Noop(text)` | — | sim |
| `verbose` | level, message | `Verbose(level,msg)` | — | — |
| `dial` | destination, timeout, options | `Dial(dest[,timeout[,opts]])` | — | — |
| `read` | variable, audio, maxDigits, timeout | `Read(VAR,${SOUND_PATH}/audio,max,,timeout)` | — | sim |
| `saydigits` | value | `SayDigits(value)` | — | — |
| `saynumber` | value, gender | `SayNumber(value[,gender])` | — | — |
| `mixmonitor` | filename, extension | `MixMonitor(file.ext)` | — | — |
| `stopmonitor` | — | `StopMonitor()` | — | — |
| `chanspy` | target, options | `ChanSpy(SIP/target[,opts])` | — | — |
| `answer` | — | `Answer()` | — | — |
| `wait` | seconds | `Wait(n)` | — | — |
| `waitexten` | seconds | `WaitExten(n)` | — | sim |
| `playback` | filename | `Playback(${SOUND_PATH}/file)` | — | sim |
| `background` | filename | `Background(${SOUND_PATH}/file)` | — | sim |

`terminal: true` → o exportador interrompe a cadeia sequencial neste nó (não segue próxima edge).  
`supportsLabel: true` → o exportador emite `exten => s,n(label),Cmd()`. O PropertiesPanel mostra o campo label com validação `/^[a-z0-9-]+$/` e detecção de duplicatas no mesmo ContextNode.

**Handles dos nós de ação:** `in` (TOP target), `in-left` (LEFT target); `out` (BOTTOM source), `out-right` (RIGHT source). Nós terminais omitem os handles de saída.

**Estado de comentário (_commented):** qualquer nó (exceto `config` e `context`) pode ser desativado via menu de contexto ou botão no PropertiesPanel. Quando `_commented: true`:
- Borda dashed, opacidade 0.6
- Header mostra `// TITULO` e badge "DESATIVADO"
- Exibe botões ATIVAR / EXCLUIR dentro do nó
- Exportador: omite a linha (passa o `_origLine` se existir, sem gerar código)

---

## 5. Compilador / Exportador (asteriskExporter.js)

### Entry Point

```js
export function generateDialplan(nodes, edges)
```

**Modo selecionado automaticamente:**
- Se existir qualquer nó `type === 'context'` → **modo hierárquico** (`generateDialplanFromContexts`)
- Caso contrário → **modo legado** (`generateDialplanLegacy`)

---

### 5.1 Modo Hierárquico

**Cabeçalho do .conf:** timestamp ISO, número de contextos ativos.

#### Passo 1 — BFS para detectar contextos ativos (`findActiveContextIds`)

BFS partindo do nó `config`:
- Segue TODAS as edges de saída (sem filtro de handle)
- Propaga reachability para o `parentNode` de qualquer nó alcançado
- Ao alcançar um `ContextNode`, enfileira todos os seus filhos diretos
- Fallback: se BFS não encontrou nenhum contexto, usa todos os ContextNodes de nível superior

#### Passo 2 — Ordenação dos contextos

Contextos ativos são ordenados pelo campo `data.order` (crescente). Contextos sem `order` vão para o final.

#### Passo 3 — Bloco standalone (Config sem edges a ContextNode)

Se o ConfigNode não estiver conectado a nenhum ContextNode ativo, gera um bloco `[orpen-ivr-{IVR}]` com a cadeia de nós standalone (sem `parentNode`) que partem do Config.

#### Passo 4 — Por contexto: sequência principal (sSeq)

Para cada ContextNode ativo:
1. **Injeção do GlobalConfig:** se uma edge conecta o ConfigNode diretamente a este contexto, as linhas do Config são emitidas primeiro.
2. **Ordenação interna (`getExecChain`):**
   - Se existe edge `ctx-start` saindo deste contexto → segue grafo explícito a partir do nó apontado
   - Sem `ctx-start` → fallback por posição Y/X dos filhos
3. **Geração de linhas por nó filho:**
   - `menu` → emite `Background(...)` + `WaitExten(...)` com label `menu` (ou label customizado)
   - nós de ação → chama `actionLine(node)` da `actionMeta.js`
   - `time` → `GotoIfTime(spec?dest,s,1)` (omite se `trueContext` vazio, emite aviso)
   - `route` → linha(s) conforme `routeMode`
   - `commented` → emite `_origLine` se existir, sem processar
   - `raw` → emite `rawLine` literal
4. **Validação:** nós de ação com `validate()` definido têm seus erros coletados; nós inválidos são omitidos com aviso `;;`.

#### Passo 5 — Extensões DTMF de cada menu

Para cada MenuNode no sSeq, gera:
- `exten => {digit},1,...` para cada dígito com edge `d-{digit}`
- Destino suportado: ContextNode (→ Goto), RouteNode (→ linhas do route), MenuNode com contextName (→ Goto), ActionNode (→ `walkChainLines`)
- `exten => i,...` / `exten => t,...` com fallback para macro de invalid/timeout

#### Formato de prioridade

```
exten => s,1,Cmd()    ← primeiro item real (seqIdx=0)
exten => s,n,Cmd()    ← demais
exten => s,n(label),Cmd()  ← quando item tem label
```
Linhas raw (comentadas, `include =>`, que começam com `;`) são emitidas sem prefixo `exten =>`.

---

### 5.2 Modo Legado

Geração linear: Config → TimeNodes → rootMenu, depois BFS de menus por DTMF. Gera macros de invalid/timeout ao final. Usado quando não existem ContextNodes no canvas.

---

### 5.3 Helpers

- `isSeqEdge(edge, curNode)` — retorna `true` para handles `'out', 'out-right', 'out-bottom', 'out-left', ''`; para TimeNode, também para `'closed'`
- `walkChainLines(startNode)` — caminha cadeia de nós sequenciais a partir de um nó de ação, retorna lista de strings para emissão
- `jumpLabel(node)` — retorna string `ctx,s,1` ou `ctx,ext,pri` para destinos Goto inline

---

## 6. Parser de Importação (.conf)

### Entry Point

```js
export function parseConfFile(text)
// Retorna: { nodes, edges, stats, suggestedName }
```

### Estágios

**1. `extractContexts(lines)`**  
Divide o texto em blocos `[nome]` + suas linhas. Aceita linhas `exten =>`, `;exten =>` (comentadas) e `include =>`. Ignora `;;` (comentários duplos).

**2. `extractGlobalConfig(firstCtx)`**  
Lê o primeiro contexto para extrair variáveis globais: IVR, soundPath, agiPath, language, comment, numberDialed.

**3. `processContext(ctx, xOffset, stats, globalConfig, isFirstContext)`**  
Para cada contexto:
- Linhas `include =>` → RawNode
- Linhas comentadas (`;exten =>`) → nó do tipo real com `_commented: true` e `_origLine`
- Linhas DTMF (`exten => 1,n,Cmd()`) → agrupadas em `dtmfGroups`
- Linhas de config global repetidas no mesmo valor → ignoradas; se valor diferente → SetNode
- Demais linhas → `cmdToNodeData()` → nó do tipo correspondente
- MenuNode: construído ao final a partir do `dtmfGroups` (absorve WaitExten e Background imediatamente anteriores)
- Edges sequenciais entre nós são geradas com handle `out` → `in`, tipo `floating`, `data: { waypoints: [] }`

**4. `cmdToNodeData(cmdFull)`**  
Mapeia comando Asterisk → `{ type, data }`. Comandos não mapeados → `{ type: 'raw', data: { rawLine } }`.

Mapeamentos suportados: `Answer, Hangup, Wait, WaitExten, Noop, Playback, Background, GotoIfTime, Goto, Queue, Agi, Macro, Gosub, Return, GotoIf, Dial, Set, Verbose, ExecIf, ChanSpy, MixMonitor, StopMonitor, SayDigits, SayNumber`.

**5. `resolveReferences(allNodes, allEdges)`**  
Varre todos os nós e cria edges visuais para ContextNodes referenciados por nome:
- `route` (contexto) → handle `out`, edge verde
- `gosub` → handle `out`, edge verde
- `time` → handle `true`, edge amarela
- `gotoif` → `out` (true) / `out-right` (false), edges verdes
- `menu` via `_dtmfGotos` → handles `d-{ext}`, edges smoothstep
- Referências sem ContextNode correspondente → `stats.unresolvedRefs`

### Layout Gerado

```
Constantes:
  CTX_MIN_WIDTH  = 520   largura mínima de um ContextNode
  CTX_PAD_TOP    = 60    espaço topo (abaixo da faixa START)
  CTX_PAD_BOTTOM = 40
  CTX_PAD_H      = 40    padding horizontal dos filhos
  NODE_H         = 100   altura estimada de nó filho
  NODE_GAP       = 40    espaçamento vertical entre filhos
  CTX_COL_GAP    = 120   gap horizontal entre ContextNodes
  CTX_ROW_Y      = 220   Y fixo de todos os ContextNodes
```

GlobalConfigNode posicionado centralizado horizontalmente acima de todos os contextos, y=20.

### Stats Retornadas

```js
{
  contexts: number,
  nodesByType: { [type]: count },
  commented: string[],       // linhas originais comentadas
  raw: string[],             // comandos não reconhecidos
  unresolvedRefs: string[],  // nomes de contexto referenciados mas não encontrados
}
```

---

## 7. Sistema de Edges

### 7.1 Tipos Registrados

```js
const edgeTypes = {
  floating:   EdgeWithWaypoints,  // edges com pontos de conexão dinâmicos + offset elástico
  smoothstep: EdgeWithWaypoints,  // mesmo componente — handles posicionados de forma fixa
};
```

`FloatingEdge.jsx` existe no disco mas **NÃO está registrado** em `edgeTypes`. É um componente legacy não usado.

### 7.2 Handles Semânticos (`isSemanticHandle`)

```js
const FIXED_HANDLES = new Set(['ctx-start']);

export function isSemanticHandle(handle) {
  if (!handle) return false;
  return FIXED_HANDLES.has(handle) || /^d-/.test(handle);
}
```

Handles semânticos: `ctx-start` e qualquer `d-*` (DTMF do MenuNode).  
Edges com pelo menos um handle semântico usam `type: 'smoothstep'` — o caminho respeita a posição exata do handle (não flutua).  
Edges com ambos os handles genéricos usam `type: 'floating'` — os pontos de conexão são calculados dinamicamente.

### 7.3 Seleção de Tipo na Conexão (`onConnect`)

```js
const useFloating = !isSemanticHandle(sourceHandle) && !isSemanticHandle(targetHandle);
// floating: { type: 'floating', data: { offsetX: 0, offsetY: 0 } }
// smoothstep: { type: 'smoothstep' } — sem data de offset
```

Exceção: handle `true` do TimeNode → sempre `floating`, edge amarela (`stroke: '#ffcc00'`).

### 7.4 Normalização na Carga de Projeto (`initEdges`)

```js
raw.map((e) => {
  if (e.type === 'floating' && (isSemanticHandle(e.sourceHandle) || isSemanticHandle(e.targetHandle))) {
    return { ...e, type: 'smoothstep' };
  }
  return e;
});
```

Migra edges antigas: handles semânticos (`d-*`, `ctx-start`) que foram salvas como `floating` são convertidas para `smoothstep` no mount.

### 7.5 EdgeWithWaypoints — Componente Principal

**Arquivo:** `src/components/edges/EdgeWithWaypoints.jsx`

**Props:** `id, source, target, data, markerEnd, style, selected`  
**`data`:** `{ offsetX: number, offsetY: number }` — offset elástico do midpoint. Padrão `0,0`.

#### Cálculo de Caminho

```
hasOffset = Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1

SEM offset → getSmoothStepPath({ sx, sy, sourcePos, tx, ty, targetPos, borderRadius: 6 })

COM offset → buildOrthogonalPath([
  { x: dsx, y: dsy },          ← saída calculada pelo getEdgeParamsDirected em direção ao waypoint
  { x: midX + offsetX, y: midY + offsetY },   ← waypoint único
  { x: dtx, y: dty }           ← entrada calculada em direção ao waypoint
])
```

`buildOrthogonalPath(pts)`: gera SVG path com segmentos horizontais/verticais e cantos arredondados (R=6) via quadratic bezier.

#### `getEdgeParams(sourceNode, targetNode)`

Calcula qual lado (Left/Right/Top/Bottom) de cada nó usar com regra **horizontal-first**:
- `|dx| < 30` → saída/entrada vertical (Top/Bottom)
- `|dy| < 30` → saída/entrada horizontal (Left/Right)
- diagonal → saída horizontal (Right/Left), entrada vertical (Top/Bottom)

#### `getEdgeParamsDirected(sourceNode, targetNode, firstWp, lastWp)`

Versão usada quando `hasOffset`:
- Source exit calculado em direção ao waypoint (não ao nó destino)
- Target entry calculado a partir do waypoint (não do nó origem)

#### MidpointDragHandle

Subcomponente `React.memo` renderizado via `EdgeLabelRenderer` **somente quando `selected === true`**.

- Visual: quadrado 12×12px (18×18px no hover/drag), borda verde neon, bg `#0d0d0d`
- Ícone: `·` normal, `↕` no hover/drag
- Drag via `document.addEventListener('mousemove/mouseup')` — acumula deslocamento em `offsetX/offsetY`
- Divide o deslocamento pelo `zoom` atual (lido via `useStore((s) => s.transform[2])`)
- NÃO há `onEdgeMouseDown` no ReactFlow — foi removido pois quebrava a conexão de handles DTMF

#### Auto-reset de Offset

```js
useEffect(() => {
  if (!mountedRef.current) { mountedRef.current = true; return; }
  if (offsetX === 0 && offsetY === 0) return;
  setEdges((es) => es.map((e) => e.id === id ? { ...e, data: { ...e.data, offsetX: 0, offsetY: 0 } } : e));
}, [srcPosKey, tgtPosKey]);
```

Quando qualquer nó conectado se move, o offset é zerado automaticamente.  
`srcPosKey`/`tgtPosKey` = string `"x,y"` da `positionAbsolute` arredondada.

#### Reset pelo Usuário

Menu de contexto (botão direito na edge) → "↺ Redefinir trajeto" → `resetEdgeOffset(edgeId)` → `{ offsetX: 0, offsetY: 0 }`.

### 7.6 `computeObstacleAvoidance` (DESATIVADO)

A função `computeObstacleAvoidance()` existe em `edgeUtils.js` mas **não é chamada em nenhum lugar**. Foi desativada porque causava bugs visuais com ContextNodes. A detecção de colisão calcula um ponto de desvio no midpoint projetado em cada lado do bbox do obstáculo, mas o resultado não é mais aplicado.

### 7.7 Auto-reset de Offset ao Arrastar Nó

Em `onNodeDragStop`, as edges conectadas ao nó movido têm seu offset zerado:

```js
setEdges((es) => es.map((e) => {
  if ((movedIds.has(e.source) || movedIds.has(e.target)) &&
      ((e.data?.offsetX || 0) !== 0 || (e.data?.offsetY || 0) !== 0)) {
    return { ...e, data: { ...e.data, offsetX: 0, offsetY: 0 } };
  }
  return e;
}));
```

### 7.8 EdgeModeContext

`EdgeModeContext` expõe o modo `'free' | 'grid'`. Atualmente o contexto existe e é provido pelo Canvas, mas **nenhum componente de edge o consome ativamente** para snap de grid. O toggle na status bar alterna o valor mas o comportamento de snap não está implementado nas edges.

### 7.9 Aparência das Edges por Tipo

| Tipo de edge | Cor `stroke` | `markerEnd` |
|---|---|---|
| Genérica (floating/smoothstep) | `#00ff41` | ArrowClosed verde |
| Handle `true` (TimeNode) | `#ffcc00` | ArrowClosed amarelo |
| Edge selecionada (CSS global) | Sobrescrita por `stroke: #ffcc00`, `stroke-width: 2.5`, `filter: drop-shadow` |
| Edge hover (CSS global) | `stroke: #fff`, `stroke-width: 2` |

---

## 8. Sistema de Alinhamento (`useAlignmentGuides`)

**Arquivo:** `src/hooks/useAlignmentGuides.js`  
**Integração:** `src/components/canvas/AlignmentGuides.jsx`

### API do Hook

```js
const { guides, onNodeDragStart, onNodeDrag, onNodeDragStop: alignDragStop } = useAlignmentGuides(nodes, setNodes);
```

Os handlers são passados ao `<ReactFlow>`. `onNodeDragStop` do Canvas COMBINA `alignDragStop` + lógica própria de re-parenting.

### Comportamento

**Regras de escopo (quais nós são comparados):**
- Filho (tem `parentNode`) → compara com irmãos + o próprio pai ContextNode
- ContextNode ou ConfigNode (sem `parentNode`) → compara com outros ContextNodes e ConfigNode de nível superior
- Nó standalone sem pai → compara com outros nós de nível superior

**`onNodeDragStart`:** constrói cache estático de bounds (`staticBoundsRef`) — não atualizado durante o drag.

**`onNodeDrag`:** throttled via `requestAnimationFrame` — chama `computeGuides` e atualiza `guides` + `snapRef`.

**`computeGuides`:** compara cada borda do nó arrastado contra as 4 bordas de cada nó estático. Threshold = 8px. Retorna guias visíveis + posição de snap.

**`onNodeDragStop`:** aplica snap (conversão abs→relativo levando em conta `parentNode`) e limpa guias.

### AlignmentGuides (Componente)

Renderiza linhas verticais (guias `{ x }`) e horizontais (guias `{ y }`) como `div` absolutas de 1px sobre o canvas. Converte coordenadas de flow para tela via `useStore((s) => s.transform)`. Retorna `null` quando não há guias — evita subscriptions desnecessárias durante pan/zoom.

---

## 9. Features do Canvas

### 9.1 Roteamento e Seleção de Nós

- **Drop da sidebar:** `onDrop` detecta o tipo via `e.dataTransfer.getData('application/rcx-node')`, converte posição de tela para flow via `rfInstance.project()`, detecta `ContextNode` pai via `findContextAt`, atribui `parentNode` + `extent: 'parent'` automaticamente
- **Re-parenting:** `onNodeDragStop` verifica se o nó caiu dentro de um ContextNode diferente do atual e reatribui `parentNode`/`position`
- **Ordenação no array:** filho sempre DEPOIS do pai (exigência do React Flow para renderização correta)
- **ConfigNode único:** `onDrop` bloqueia criação de segundo nó `config`

### 9.2 Propagação de Rename de ContextNode

**Arquivo:** `src/utils/renamePropagator.js`

```js
export function applyContextRename(nodes, oldName, newName)
```

Atualiza `data.trueContext` (TimeNode), `data.context` (RouteNode modo 'contexto'), `data.context` (Gosub).

Disparado em dois pontos:
1. **Inline no ContextNode** (`onBlur` do input do header) → `propagateRename` via `useReactFlow().setNodes`
2. **PropertiesPanel** (`onBlur` do campo contextName) → `propagateContextRename` via callback do Canvas

### 9.3 Sincronização TimeNode ↔ Edge `true`

**`syncTrueContext(timeNodeId, trueCtx)`** (Canvas → PropertiesPanel via prop):
- Vazio → remove edge `true` saindo do TimeNode
- Não-vazio + ContextNode encontrado → recria edge `true` (amarela, floating)

**`handleEdgesChange`:** quando edge `true` é removida → limpa `data.trueContext` do nó

**`useEffect([edges])`:** sincroniza `data.context` dos nós GotoIf/Route quando a edge conectada muda de destino (auto-sync para GoTo).

### 9.4 Detecção de Órfãos

`ContextNode` subscreve ao store via `useStore((s) => s.edges.some((e) => e.target === id))`. ContextNodes do tipo macro (`data.isMacro`) são excluídos da detecção.

### 9.5 Sidebar — Busca com Pontuação de Relevância

Função `scoreItem(item, nq)` retorna 0-4:
- 4: match exato no título
- 3: título contém o termo
- 2: desc ou type contém
- 1: tag semântica de `NODE_TAGS[type]` contém

Normalização remove acentos e converte para minúsculo. Durante busca, accordion não é colapsável e itens são ordenados por score descendente.

Estado colapsado das categorias persiste em `localStorage` com chave `'orpen-sidebar-collapsed'`.

### 9.6 Context Menu (Botão Direito)

**Em edges:** Menu "// CONEXÃO" com:
- "↺ Redefinir trajeto" — visível apenas para edges `floating` com offset ≠ 0
- "⌫ Remover conexão" — remove edge + limpa `trueContext` se for edge `true`

**Em nós:** Menu "// NÓ" com:
- "// DESATIVAR nó" / "▶ ATIVAR nó" — toggle `_commented` (exceto `config` e `context`)
- "⌫ Excluir nó" — (exceto `config`)

### 9.7 Auto-save com Debounce

`useEffect([nodes, edges])` com debounce de 2 segundos:
- Status bar mostra `// salvando...` (amarelo) → `// salvo` (verde, some em 3s)
- `flushSave()` força save imediato (chamado antes de "VOLTAR" com alterações)
- Modal "ALTERAÇÕES NÃO SALVAS" ao tentar voltar com `isDirtyRef.current === true`

### 9.8 Exportação

Botão "⤓ EXPORTAR URA (.conf)" (bottom-right absoluto). Modal com preview, botão COPIAR e BAIXAR (filename: `orpen-ura-gerada.conf`). Usa LF como quebra de linha na exportação.

---

## 10. Persistência e Projetos

### IndexedDB

**Arquivo:** `src/services/projectStorage.js`  
**DB:** `orpen-ura-db` v1, object store `projects`, keyPath: `'id'`

#### Schema de Projeto

```js
{
  id:              string,  // Date.now().toString()
  name:            string,  // slug lowercase a-z0-9-
  dataCriacao:     string,  // ISO 8601
  dataModificacao: string,  // ISO 8601
  flow: {
    nodes:    Node[],       // array de nós React Flow
    edges:    Edge[],       // array de edges React Flow
    viewport: { x, y, zoom }
  }
}
```

#### API

```js
salvarProjeto(projeto)      // upsert (put)
listarProjetos()            // getAll, ordenado por dataModificacao DESC
carregarProjeto(id)         // get por id
excluirProjeto(id)          // delete por id
projetoExiste(id)           // boolean
```

### HomeScreen (`src/screens/HomeScreen.jsx`)

Tela inicial com roteamento simples gerenciado pelo `App`:

- **Grid de cards** — `repeat(auto-fill, minmax(280px,1fr))` — cada card mostra nome, datas, botões ABRIR / EXP .JSON / ⌫
- **Criar projeto** — modal `CreateProjectModal`: valida slug (`/^[a-z0-9-]+$/`, mín. 3 chars)
- **Abrir projeto** — modal `ConfirmOpenModal` → `handleOpenProject` → Canvas keyed por `project.id`
- **Importar .JSON** — valida campos `name, dataCriacao, flow.nodes`; atribui novo `id` (Date.now())
- **Importar .CONF** — `parseConfFile()` → modal `ConfImportModal` com stats; após confirmar, abre canvas
- **Exportar .JSON** — download direto (sem modal)
- **Excluir** — modal `ConfirmDeleteModal` + `excluirProjeto(id)` + refresh da lista

### Roteamento App

```
App state: 'home' | 'canvas'
```

`Canvas` recebe `key={currentProject.id}` → remount completo ao trocar de projeto, garantindo estado limpo.

---

## 11. Padrões de Código

### Como Adicionar um Novo Tipo de Nó de Ação

1. **`src/utils/actionMeta.js`** — adicionar entrada no `ACTION_META`:
   ```js
   mynewtype: {
     title: 'MEUTYPE', app: 'MeuApp', icon: SomeIcon, color: '#xxxxxx', category: 'logic',
     terminal: false,       // omitir se false
     supportsLabel: false,  // omitir se false
     summary: (d) => [{ k: 'campo', v: d.campo || '—' }],
     validate: (d) => d.campo ? [] : ['campo obrigatório'],
   }
   ```
   Adicionar `actionLine()` no switch correspondente.

2. **`src/utils/buildNode.js`** — adicionar case em `buildNode()` com defaults.

3. **`src/utils/confParser.js`** — adicionar case em `cmdToNodeData()` se o comando Asterisk deve ser importado.

4. **`src/components/nodes/index.jsx`** — adicionar `mynewtype: mkActionType('mynewtype')` no `nodeTypes`.

5. **`src/components/layout/Sidebar.jsx`** — adicionar item em uma categoria de `CATEGORIES`.

6. **`src/config/nodeTags.js`** — adicionar tags semânticas para busca.

7. **`src/components/layout/PropertiesPanel.jsx`** — adicionar bloco de edição `{node.type === 'mynewtype' && (...)}`.

### Como Adicionar um Nó Estrutural

Mesmos passos acima, mas com componente próprio em `src/components/nodes/MyNode.jsx` e registro direto (não via `mkActionType`) no `nodeTypes`.

### Convenções Gerais

- **IDs de nó:** `n_` + `uid()` (7 chars aleatórios base36)
- **IDs de edge:** `e-{sourceId}-{targetId}` (gerado pelo React Flow via `addEdge`) ou `e-ref-{uid()}` (confParser)
- **Handles de entrada:** `id="in"` (TOP) e `id="in-left"` (LEFT) na maioria dos nós
- **Handles de saída:** `id="out"` (BOTTOM) e `id="out-right"` (RIGHT) nos nós não-terminais
- **Handles DTMF:** `id="d-{digitId}"` (RIGHT) no MenuNode — semânticos, forçam smoothstep
- **Handle ctx-start:** posição absoluta `top: 44, left: 50%` no ContextNode — semântico, força smoothstep
- **Styling inline predominante** — TailwindCSS é importado mas quase não usado; CSS custom em `index.css` é a fonte principal
- **`React.memo` em todos os componentes de nó** — crítico para performance no ReactFlow
- **`useCallback` em todos os handlers** passados como props ou usados em `useEffect`
- **`useMemo`** para `nodeTypes` e `edgeTypes` no Canvas — evita remount dos nós a cada render
- **`cls(...)`** de `common.js` para concatenar classes condicionalmente

### Comportamento de Comentário de Nó (_commented)

O flag `_commented: true` no `data` de qualquer nó (exceto `config` e `context`) é o mecanismo de "desativar". Ativado/desativado por:
- `toggleComment(id)` no Canvas (via menu de contexto ou botão no PropertiesPanel)
- `ActionNode`, `TimeNode`, `RouteNode`, `RawNode` exibem botões ATIVAR/EXCLUIR inline quando comentados

O exportador:
- Para `commented` type: não gera linha (passa `_origLine` bruta se existir)
- Para `raw` type com `_commented`: não gera
- Para outros com `_commented`: omite a linha e passa o `_origLine` se existir

---

## 12. Fluxo de Renderização

```
App
├── HomeScreen (quando screen === 'home')
└── ReactFlowProvider
    └── Canvas (key=projectId, remontado ao trocar projeto)
        ├── EdgeModeContext.Provider (value: 'free'|'grid')
        ├── Sidebar (palette + search)
        ├── div.wrapperRef (onDrop, onDragOver)
        │   ├── ReactFlow
        │   │   ├── Background gap=20
        │   │   ├── Controls
        │   │   ├── MiniMap
        │   │   └── [nós e edges renderizados pelos tipos registrados]
        │   ├── AlignmentGuides (guides=[])
        │   ├── Botão ← VOLTAR (quando onGoBack)
        │   ├── Status bar (NODES|EDGES|STATUS|save|toggle LIVRE/GRADE)
        │   └── Botão ⤓ EXPORTAR
        ├── PropertiesPanel (node selecionado)
        ├── Context menu de edge (edgeMenu state)
        ├── Context menu de nó (nodeMenu state)
        ├── Modal ALTERAÇÕES NÃO SALVAS
        └── Modal de exportação .conf
```

---

## 13. Armadilhas e Decisões Conhecidas

- **`onEdgeMouseDown` foi REMOVIDO do ReactFlow** — quebrava a conexão de handles DTMF (`d-*`). O drag do midpoint é feito via `EdgeLabelRenderer` + listeners globais no `document`.
- **`computeObstacleAvoidance()` está desativado** — existe em `edgeUtils.js` mas não é chamado. Causava bugs visuais com ContextNodes.
- **`FloatingEdge.jsx` existe mas não é usado** — `edgeTypes` mapeia `floating` para `EdgeWithWaypoints`. Mantido como referência legacy.
- **`data.waypoints: []`** ainda aparece em edges geradas pelo `confParser` (legado de implementação anterior). O `EdgeWithWaypoints` atual ignora esse campo completamente — usa apenas `offsetX/offsetY`.
- **ContextNode tem `zIndex: -1`** — deve aparecer atrás dos nós filhos para não bloquear interação.
- **Filho deve aparecer DEPOIS do pai no array de nós** — o Canvas garante isso ao re-parenting via splice.
- **`skipDirtyRef`** — o primeiro render do Canvas não marca como dirty (evita auto-save imediato ao abrir projeto).
- **`nodesWithSel`** — `selected` é injetado via `useMemo` sem armazenar em state do React Flow, evitando conflito com seleção nativa.
- **GotoIf `falseDestination` vazio é válido** no Asterisk (fall-through) — não é um erro de validação.
- **MenuNode `contextName`** é usado apenas no modo legado para o Goto dentro do menu; no modo hierárquico, o ContextNode pai define o nome do bloco.
