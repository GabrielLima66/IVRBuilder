# Orpen URA Builder
Editor visual de dialplan Asterisk (extensions.conf) via canvas drag-and-drop. Cada nó representa uma instrução/bloco; edges representam fluxo de execução. Gera .conf válido via compilador interno.

## Comandos
```
npm run dev      # dev server Vite em http://localhost:5173
npm run build    # build de produção em dist/
npm run preview  # preview do build
```

## Stack
| Pacote | Versão | Papel |
|---|---|---|
| Vite | 5 | bundler / dev server |
| React | 18 | UI framework |
| ReactFlow | 11.11.4 | canvas de grafo interativo |
| lucide-react | 0.395 | ícones SVG |
| TailwindCSS | 3 | utility classes (uso mínimo — styling principal é CSS custom) |

> **Nota:** `@reactflow/node-resizer` ainda está instalado mas não é mais usado — o ContextNode deixou de ser manualmente redimensionável.

## Estrutura de pastas
```
src/
├── App.jsx               Canvas (estado global) + App (roteamento home|canvas)
├── index.css             TODO o CSS custom (variáveis, nós, inputs, modais, animações)
├── main.jsx              entry point — importa reactflow CSS, node-resizer CSS, index.css
├── components/
│   ├── canvas/
│   │   ├── AlignmentGuides.jsx   linhas-guia sobre o canvas
│   │   └── ContextOrderOverlay.jsx  controles de reordenação (drag ⠿, ↑↓, campo numérico)
│   ├── edges/
│   │   ├── EdgeWithWaypoints.jsx  componente de edge principal (floating + smoothstep + DTMF)
│   │   └── FloatingEdge.jsx       LEGADO — existe no disco, NÃO registrado em edgeTypes
│   └── nodes/
│       ├── index.jsx         nodeTypes registry + mkActionType factory
│       ├── ActionNode.jsx    componente genérico para 22 tipos de ação
│       ├── CommentedNode.jsx nó comentado (borda dashed amarela)
│       ├── ConfigNode.jsx    nó START — sem handles de entrada
│       ├── ContextNode.jsx   container de altura automática — handle ctx-in (top); filhos gerenciados por childOrder
│       ├── MenuNode.jsx      menu DTMF — handles d-N, d-i, d-t na borda direita
│       ├── RawNode.jsx       linha não reconhecida — textarea editável
│       ├── RouteNode.jsx     destino unificado: macro / fila / contexto
│       └── TimeNode.jsx      condição temporal — handle true (right) + closed (bottom)
├── components/layout/
│   ├── Sidebar.jsx           palette accordion + busca com relevância semântica
│   └── PropertiesPanel.jsx   editor de propriedades (320px, lado direito)
├── config/
│   └── nodeTags.js           mapa de tags semânticas por tipo (alimenta busca da sidebar)
├── contexts/
│   ├── EdgeModeContext.js    contexto React: 'free'|'grid', GRID_SIZE=20, snapToGrid()
│   └── ActiveSelectionContext.js  contexto de seleção visual: activeEdgeIds + activeNodeIds
├── hooks/
│   └── useAlignmentGuides.js smart guides Figma-style + snap ao soltar
├── screens/
│   └── HomeScreen.jsx        tela inicial: grid de projetos, criar/abrir/importar/exportar
├── services/
│   └── projectStorage.js     CRUD IndexedDB — salvarProjeto, listarProjetos, carregarProjeto, excluirProjeto
└── utils/
    ├── actionMeta.js         ACTION_META dict + actionLine() + validate() por tipo
    ├── asteriskExporter.js   generateDialplan() — compilador principal
    ├── buildNode.js          factory de nós com defaults por tipo
    ├── common.js             uid(), cls(), slugify(), DEFAULT_DIGITS
    ├── confParser.js         parseConfFile() — converte .conf Asterisk em nós+edges
    ├── edgeUtils.js          getEdgeParams(), getEdgeParamsDirected(), isSemanticHandle()
    ├── renamePropagator.js   applyContextRename() — cascata de rename em time/route/gosub
    └── timeUtils.js          formatDayRange(), buildTimeExport()
```

## Regras críticas — não violar

1. **JSX apenas em `.jsx`** — Vite não processa JSX em `.js`. Nunca criar `.js` com JSX.

2. **`sourceHandleId` não `sourceHandle` em componentes de edge** — React Flow v11 passa o handle como `sourceHandleId` (e `targetHandleId`). Usar `sourceHandle` retorna sempre `undefined`.

3. **Todos os hooks antes de qualquer early return** — Rules of Hooks. Em EdgeWithWaypoints e edge components: todos os `useStore/useCallback/useEffect` ANTES do `if (!sourceNode...) return null`.

4. **`useMemo` para `nodeTypes` e `edgeTypes` no Canvas** — evita remount de todos os nós a cada render. Não criar esses objetos inline no JSX do `<ReactFlow>`.

5. **`React.memo` em todos os componentes de nó** — crítico para performance. Sem memo, cada update de estado remonta todos os nós.

6. **Filho SEMPRE depois do pai no array `nodes`** — exigência do React Flow para renderização correta de nós aninhados em ContextNode.

7. **DTMF handles (`d-*`) usam `type: 'floating'`** — NÃO são semânticos (`isSemanticHandle` retorna false para `d-*`). O EdgeWithWaypoints detecta `isDtmf = /^d-/.test(sourceHandleId)` e aplica Bézier cúbico independente. Não passar por `getEdgeParams` (causaria convergência de todas as edges no mesmo ponto).

8. **`ctx-start` foi removido do ContextNode** — o handle e a barra START foram eliminados. A ordem de execução é determinada por `data.childOrder`. O compilador usa childOrder como fonte de verdade; fallback legado (edge ctx-start ou sort por Y) ainda funciona para projetos antigos.

9. **Não reativar `onEdgeMouseDown` no ReactFlow** — foi removido pois impedia a criação de conexões dos handles DTMF. O drag de edge usa `EdgeLabelRenderer` + `document.addEventListener`.

10. **`computeObstacleAvoidance()` está desativado** — a função existe em `edgeUtils.js` mas não é chamada. Causava paths incorretos com ContextNodes. Não reconnectar.

11. **TimeNode sem `trueContext` não gera linha no .conf** — exportador omite o GotoIfTime e emite aviso `;;`. Não é erro silencioso.

12. **Nó com `_commented: true` não gera saída** — exportador omite a linha. Comportamento distinto de `CommentedNode` (tipo próprio para linhas `;exten =>`).

13. **ContextNode tem `zIndex: -1`** — deve aparecer atrás dos filhos para não bloquear interação.

14. **`customerAgi` no ConfigNode é LEGADO** — campo existe nos defaults do buildNode mas o exportador o ignora. Para `AGI(customerDataInboundCall...)`, usar nó AGI explícito.

15. **`Canvas` recebe `key={project.id}`** — garante remount completo ao trocar de projeto. Não usar o mesmo Canvas para projetos diferentes sem key.

16. **Filhos de ContextNode têm `draggable: false`** — o posicionamento é gerenciado exclusivamente pelo ContextNode via `useEffect` + `childOrder`. Nunca setar `draggable: true` em filhos enquanto estiverem dentro de um contexto.

17. **`ContextOrderOverlay` detecta hover via `mousePos`** — o Canvas passa `mousePos` ({x,y} relativo ao wrapperRef) ao overlay. O overlay converte posições flow→tela via `useStore(s => s.transform)` para renderizar controles absolutamente posicionados acima do ReactFlow (z-index 50), evitando o problema de stacking com o ContextNode (z-index -1).

18. **`childOrder` é fonte de verdade da sequência** — ao dropar, re-parenting ou deletar um nó filho, o `childOrder` do ContextNode pai deve ser atualizado em conjunto. O compilador lê `childOrder` para emitir `exten => s,1,...` e `exten => s,n,...` na ordem correta.

19. **`ActiveSelectionContext` — estado de seleção visual das edges:**  
    - Todas as edges ficam em estado de REPOUSO por padrão: tracejadas (`strokeDasharray: '6 4'`), 25% de opacidade.  
    - Clicar num nó → `computeActiveFromNode()` preenche `activeEdgeIds` (edges diretas) e `activeNodeIds` (nós vizinhos).  
    - Clicar numa edge → `onEdgeClick` ativa a edge + os dois nós das extremidades.  
    - Clicar no canvas → limpeza imediata (retorno ao repouso sem transição).  
    - Propagação é de **1 nível** — não propaga para vizinhos dos vizinhos.  
    - As animações (`edge-glow-pulse`, `node-border-pulse`) são CSS `@keyframes` (GPU) — não usar `setInterval` em JS.  
    - `EdgeWithWaypoints` aplica `computedStyle` com `animation` inline referenciando os keyframes do CSS.  
    - Todos os componentes de nó leem `useActiveSelection()` e aplicam `.node-connected-active` + CSS custom properties `--node-active-color` e `--node-active-glow` na cor de acento do tipo de nó.

## Asterisk — conceitos mínimos

- Contextos Asterisk são blocos `[nome-do-contexto]` no .conf. Nomes: kebab-case.
- Sequência dentro de um contexto: `exten => s,1,Cmd()` → `exten => s,n,Cmd()` → ...
- Labels: `exten => s,n(label),Cmd()` — permitem Goto apontando para esse ponto.
- Variáveis com `__` (duplo underscore) são herdadas por sub-contextos: `__IVR`, `__NUMBER_DIALED`.
- `include => outro-contexto` — inclui outro contexto (exportado via RawNode). Nunca como `exten => s,n,include(...)`.
- Extensão `i` = dígito inválido; `t` = timeout de WaitExten.
- Prefixo de contexto do projeto: `orpen-ivr-*`. Macro de transfer: `orpen-ivr-transfer`.

### Sintaxe validada das funções Asterisk (fonte: docs.asterisk.org)

| Função | Sintaxe correta | Observações |
|---|---|---|
| `Answer()` | `Answer()` | Parênteses obrigatórios |
| `Hangup()` | `Hangup([causecode])` | Parênteses obrigatórios. Bare `Hangup` é aceito mas não é recomendado. |
| `Wait()` | `Wait(seconds)` | |
| `WaitExten()` | `WaitExten(seconds)` | |
| `Noop()` | `Noop(text)` | |
| `Background()` | `Background(${SOUND_PATH}/file)` | Sem extensão de arquivo |
| `Playback()` | `Playback(${SOUND_PATH}/file)` | Sem extensão de arquivo |
| `Set()` | `Set(VAR=value)` ou `Set(__VAR=value)` | `Set(CHANNEL(language)=pt_BR)` é sintaxe especial válida |
| `AGI()` | `AGI(${AGI_PATH}/script[,arg1,...])` | **AGI** em maiúsculas — não `Agi` |
| `Macro()` | `Macro(nome[,p1,p2,...])` | Contexto `[macro-nome]` |
| `Gosub()` | `Gosub(ctx,ext,pri[(arg1,...)])` | Args em parênteses após a prioridade. Sem args: sem parênteses — `Gosub(ctx,ext,1)` |
| `Return()` | `Return([value])` | |
| `Goto()` | `Goto(context,extension,priority)` | Sempre 3 partes |
| `GotoIf()` | `GotoIf($[expr]?[true_dest]:[false_dest])` | Destino vazio = fall-through |
| `GotoIfTime()` | `GotoIfTime(times,weekdays,mdays,months[,tz]?[dest_true[,dest_false]])` | Sem destino falso: cai na linha seguinte |
| `ExecIf()` | `ExecIf($[expr]?App(args))` | |
| `ExecIfTime()` | `ExecIfTime(times,weekdays,mdays,months[,tz]?App(args))` | |
| `Dial()` | `Dial(Tech/resource[,timeout[,options]])` | |
| `Queue()` | `Queue(queuename[,options,...])` | |
| `Read()` | `Read(variable,filename,maxdigits[,options[,attempts[,timeout]]])` | |
| `SayDigits()` | `SayDigits(digits)` | |
| `SayNumber()` | `SayNumber(digits[,gender])` | |
| `Verbose()` | `Verbose([level,]message)` | Level é opcional; padrão 0 |
| `MixMonitor()` | `MixMonitor(filename.ext[,options[,command]])` | |
| `StopMonitor()` | `StopMonitor()` | |
| `ChanSpy()` | `ChanSpy([chanprefix[,options]])` | chanprefix é prefixo de canal, ex: `SIP` ou `SIP/1234` |

### GotoIfTime — formato dos campos
```
times    = HH:MM-HH:MM (ex: 09:00-18:00) ou * para qualquer hora
weekdays = mon-fri | mon&wed&fri | * — abreviações inglesas de 3 letras
mdays    = 1-31 | 1-5 | * — dia do mês
months   = jan-dec | jan&jul | * — abreviações inglesas de 3 letras
```
Sequências consecutivas usam `-`; múltiplos não-consecutivos usam `&`.

## Padrões de código

### Adicionar novo tipo de nó de ação
1. `actionMeta.js` — adicionar `mynewtype: { title, app, icon, color, category, summary, validate, actionLine }` no `ACTION_META`
2. `buildNode.js` — adicionar case com defaults do `data`
3. `nodes/index.jsx` — `mynewtype: mkActionType('mynewtype')`
4. `Sidebar.jsx` — item em uma categoria de `CATEGORIES`
5. `nodeTags.js` — tags semânticas (array de strings PT-BR para busca)
6. `PropertiesPanel.jsx` — bloco `{node.type === 'mynewtype' && (...)}`
7. `confParser.js` — case em `cmdToNodeData()` se importável

### Adicionar nó estrutural
Mesmo fluxo, mas com componente próprio em `nodes/MyNode.jsx`, registro direto no `nodeTypes` (não via `mkActionType`), e handles declarados com `<Handle>` do React Flow.

### Nomenclatura
- IDs de nó: `n_` + `uid()` — ex: `n_abc1234`
- IDs de edge geradas pelo confParser: `e-ref-{uid()}`
- Handles de entrada: `id="in"` (TOP) e `id="in-left"` (LEFT)
- Handles de saída: `id="out"` (BOTTOM) e `id="out-right"` (RIGHT)
- Handles terminais: omitir `out` e `out-right`; marcar `terminal: true` no ACTION_META
- Classes CSS: usar `cls()` de `common.js` para concatenação condicional
- Styling: inline styles predominam sobre Tailwind; classes globais definidas em `index.css`

### Handles do MenuNode (DTMF)
```jsx
<Handle type="source" position={Position.Right} id={`d-${digit.id}`} />
```
O bloco DTMF usa `margin: -10px` lateral no container para cancelar o padding do body, posicionando handles exatamente na borda do nó. Chamar `updateNodeInternals(id)` via `useEffect([digits.length])`.

### EdgeWithWaypoints — DTMF path
```js
// sourceHandleId = 'd-1', rfSourceX/Y = posição real do handle
pathD = `M ${sx} ${sy} C ${sx+80} ${sy}, ${tx-80} ${ty}, ${tx} ${ty}`
// Arm horizontal de 80px garante saídas paralelas sem convergência
```

## Valores padrão

| Campo | Valor padrão |
|---|---|
| `config.ivr` | `'2900'` |
| `config.soundPath` | `'${ura-asterisk}'` ou string vazia |
| `config.agiPath` | `'/var/lib/asterisk/agi-bin'` |
| `config.language` | `'pt_BR'` |
| Prefixo de contexto | `orpen-ivr-` |
| Macro de transfer | `orpen-ivr-transfer` |
| MenuNode `waitExten` | `4` |
| MenuNode `maxRetry` | `3` |
| MenuNode dígitos padrão (`DEFAULT_DIGITS`) | `[{id:'1',label:'Opcao 1'}, ..., {id:'4',label:'Opcao 4'}]` |
| ContextNode `order` | `''` (sem ordem definida — campo legado, não determina mais sequência) |
| ContextNode `childOrder` | `[]` (ids dos filhos em ordem de execução) |
| ContextNode largura mínima | `320px` (CTX_MIN_W em ContextNode.jsx) |
| ContextNode padding filhos | `20px` lateral + `20px` inferior (CTX_PAD_H, CTX_PAD_BOTTOM) |
| ContextNode altura header | `34px` (CTX_HEADER_H — constante exportada de ContextNode.jsx) |
| IndexedDB database | `orpen-ura-db` v1, store `projects` |
| Projeto ID | `Date.now().toString()` |
| Debounce de auto-save | `2000ms` |
| Threshold smart guides | `8px` |
| DTMF Bézier arm | `80px` (constante `DTMF_ARM` em EdgeWithWaypoints) |

## Documentação completa
Para documentação completa consulte PROJECT_BRIEF.md
