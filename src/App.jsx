import React, { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from 'reactflow';
import { nodeTypes } from './components/nodes';
import EdgeWithWaypoints from './components/edges/EdgeWithWaypoints';
import Sidebar from './components/layout/Sidebar';
import PropertiesPanel from './components/layout/PropertiesPanel';
import { buildNode } from './utils/buildNode';
import { generateDialplan } from './utils/asteriskExporter';
import { ACTION_META } from './utils/actionMeta';
import { uid } from './utils/common';
import { generateUniqueContextName } from './utils/contextUtils';
import { applyContextRename } from './utils/renamePropagator';
import { isSemanticHandle } from './utils/edgeUtils';
import { EdgeModeContext } from './contexts/EdgeModeContext';
import { ActiveSelectionContext } from './contexts/ActiveSelectionContext';
import { ThemeContext } from './contexts/ThemeContext';
import { ModeContext } from './contexts/ModeContext';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import ConfigModal from './components/canvas/ConfigModal';
import { MenuActionsContext } from './contexts/MenuActionsContext';
import HomeScreen from './screens/HomeScreen';
import { salvarProjeto, listarProjetos } from './services/projectStorage';
import {
  extractLayout, exportLayoutFile, importLayoutFile,
  applyLayout, saveLayout, loadLayout,
} from './services/layoutStorage';
import { importConf } from './utils/conf/confImporter';
import { useAlignmentGuides } from './hooks/useAlignmentGuides';
import AlignmentGuides from './components/canvas/AlignmentGuides';
import ContextOrderOverlay from './components/canvas/ContextOrderOverlay';
import ExportOrderPanel from './components/canvas/ExportOrderPanel';

// Ambos os tipos usam EdgeWithWaypoints:
// 'floating' — floating handles + offset elástico + desvio automático de obstáculos
// 'smoothstep' — posições fixas de handle (ctx-start, d-*) sem offset
const edgeTypes = { floating: EdgeWithWaypoints, smoothstep: EdgeWithWaypoints };

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — estado global do grafo + lógica de DnD / reparenting
// Props de projeto (opcionais): permitem integração com HomeScreen.
// ─────────────────────────────────────────────────────────────────────────────
function Canvas({ initialFlow, projectName, projectCreatedAt, currentProjectId, onGoBack, onProjectSaved }) {
  // Lê configurações do ConfigContext
  const config = useConfig();
  const mode   = config.mode;

  // Tema efetivo — derivado do ConfigContext; sem prop theme externo
  // 'terminal' → data-theme="matrix" (verde)
  // 'matrix'   → data-theme="orpen"  (roxo)
  // 'dark'     → data-theme="dark"   (VS Code azul)
  const effectiveTheme = config.colorTheme === 'dark'   ? 'dark'
                       : config.colorTheme === 'matrix' ? 'orpen'
                       : 'matrix';

  // Cor principal do tema — usada em edges e mini-mapa (JS; não pode usar CSS var em SVG)
  const neonColor = effectiveTheme === 'orpen' ? '#c084fc'
                  : effectiveTheme === 'dark'  ? '#4fc1ff'
                  : '#00ff41';
  const wrapperRef  = useRef(null);
  const rfInstance  = useReactFlow();

  // nodeTypes e edgeTypes são constantes de módulo — já têm referência estável;
  // useMemo sobre constante de módulo seria overhead sem benefício.

  // Nós e edges iniciais: usa o flow carregado ou inicia com config padrão.
  // Calculados apenas uma vez no mount (o componente é "keyed" por projeto).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initNodes = useMemo(() => {
    const raw = initialFlow?.nodes?.length
      ? initialFlow.nodes
      : [buildNode('config', { x: 60, y: 80 })];

    // Constrói childOrder para ContextNodes que ainda não o possuem (projetos antigos).
    // Ordena filhos por posição Y, depois X — preserva ordem visual existente.
    const ctxIds = new Set(raw.filter((n) => n.type === 'context').map((n) => n.id));
    const byParent = {};
    for (const n of raw) {
      if (n.parentNode && ctxIds.has(n.parentNode)) {
        (byParent[n.parentNode] = byParent[n.parentNode] || []).push(n);
      }
    }

    return raw.map((n) => {
      if (n.type !== 'context') return n;
      if (n.data?.childOrder) return n; // já possui childOrder
      const children = (byParent[n.id] || [])
        .slice()
        .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
      return { ...n, data: { ...n.data, childOrder: children.map((c) => c.id) } };
    });
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initEdges = useMemo(() => {
    const raw = initialFlow?.edges || [];
    // Normalização de edges ao carregar projeto:
    // - ctx-start: deve ser smoothstep (fixed handle, built-in renderer é OK)
    // - d-* (DTMF): deve ser floating (EdgeWithWaypoints usa rfSourceX/Y do RF
    //   para posição real de cada handle, com roteamento floating no target)
    return raw.map((e) => {
      // ctx-start salvo como floating (legado) → converte para smoothstep
      if (e.type === 'floating' && isSemanticHandle(e.sourceHandle)) {
        return { ...e, type: 'smoothstep' };
      }
      // d-* salvo como smoothstep (sessão anterior) → converte de volta para floating
      if (e.type === 'smoothstep' && /^d-/.test(e.sourceHandle)) {
        return { ...e, type: 'floating', data: { offsetX: 0, offsetY: 0, ...(e.data || {}) } };
      }
      return e;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // ── Refs sincronizadas — leitura estável do estado atual sem dep em callbacks ─
  // Permite que onConnect, handleEdgesChange, computeActiveFromNode etc. leiam o
  // valor mais recente de nodes/edges sem precisar tê-los no array de deps do
  // useCallback, evitando recriação de handlers a cada mudança no grafo.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const [selectedId,      setSelectedId]      = useState(null);
  // ── Seleção visual de edges/nós vizinhos ─────────────────────────────────
  // activeEdgeIds: edges em estado ativo (sólidas, pulsantes)
  // activeNodeIds: nós vizinhos em estado ativo (borda pulsante)
  // Propagação de 1 nível: apenas edges/nós diretamente conectados ao clicado.
  const [activeEdgeIds,   setActiveEdgeIds]   = useState(() => new Set());
  const [activeNodeIds,   setActiveNodeIds]   = useState(() => new Set());

  const activeSelectionValue = useMemo(() => ({
    activeEdgeIds,
    activeNodeIds,
  }), [activeEdgeIds, activeNodeIds]);

  const [showExport,           setShowExport]           = useState(false);
  const [showOrderPanel,       setShowOrderPanel]       = useState(false);
  const [showConfigModal,      setShowConfigModal]      = useState(false);
  const [exportText,           setExportText]           = useState('');
  const [exportLayout,         setExportLayout]         = useState(null); // URALayout para download junto ao .conf
  const [showFirstExportModal, setShowFirstExportModal] = useState(false);
  const [firstExportDontShow,  setFirstExportDontShow]  = useState(false);
  // Context menu de edge (botão direito)
  const [edgeMenu, setEdgeMenu] = useState(null); // { x, y, edgeId }

  // Nome do arquivo .conf derivado do nome do projeto — usado na exportação e no layout.
  const confFileName = projectName ? `${projectName}.conf` : 'orpen-ura-gerada.conf';

  // ── Rastreamento de alterações + auto-save IndexedDB (debounce 2s) ──────
  const isDirtyRef   = useRef(false);
  const skipDirtyRef = useRef(true);
  const saveTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (!currentProjectId) return;

    isDirtyRef.current = true;
    setSaveStatus('saving');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const now = new Date().toISOString();
      const projectData = {
        id:              currentProjectId,
        name:            projectName || 'projeto',
        dataCriacao:     projectCreatedAt || now,
        dataModificacao: now,
        flow: {
          nodes:    rfInstance.getNodes(),
          edges:    rfInstance.getEdges(),
          viewport: rfInstance.getViewport(),
        },
      };
      salvarProjeto(projectData)
        .then(() => {
          onProjectSaved?.(projectData);
          isDirtyRef.current = false;
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus(null), 3000);
          // Persiste layout na store 'layouts' (fire-and-forget, não bloqueia o save principal)
          try {
            const layout = extractLayout(
              rfInstance.getNodes(),
              rfInstance.getEdges(),
              rfInstance.getViewport(),
              confFileName
            );
            saveLayout(confFileName, layout).catch(() => {});
          } catch (_) { /* layout save failure é não-crítica */ }
        })
        .catch(() => setSaveStatus('error'));
    }, (config.autosaveDelay || 2) * 1000);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal de confirmação para voltar com alterações não salvas ───────────
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // ── Conexões ──────────────────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    const { source, sourceHandle, targetHandle, target } = params;

    // Handle 'true' do TimeNode → direção EDGE → CAMPO
    if (sourceHandle === 'true') {
      // Atualiza trueContext via functional updater — sem dep em nodes do closure
      setNodes((ns) => {
        const srcNode = ns.find((n) => n.id === source);
        const tgtNode = ns.find((n) => n.id === target);
        if (srcNode?.type === 'time' && tgtNode?.type === 'context') {
          return ns.map((n) =>
            n.id === source
              ? { ...n, data: { ...n.data, trueContext: tgtNode.data.contextName } }
              : n
          );
        }
        return ns;
      });

      // Remove edge 'true' anterior e adiciona nova (amarela, floating com offset zero)
      setEdges((es) => {
        const filtered = es.filter(
          (e) => !(e.source === source && e.sourceHandle === 'true')
        );
        return addEdge(
          {
            ...params,
            type: 'floating',
            data: { offsetX: 0, offsetY: 0 },
            animated: false,
            style: { stroke: '#ffcc00', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#ffcc00' },
          },
          filtered
        );
      });
      return;
    }

    // Edge padrão — floating quando ambos os handles são genéricos,
    // smoothstep quando pelo menos um é semanticamente posicionado.
    const useFloating =
      !isSemanticHandle(sourceHandle) && !isSemanticHandle(targetHandle);

    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: useFloating ? 'floating' : 'smoothstep',
          // offset inicializado em zero → edge usa trajeto automático
          ...(useFloating ? { data: { offsetX: 0, offsetY: 0 } } : {}),
          animated: false,
          style: { stroke: neonColor, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: neonColor },
        },
        eds
      )
    );

    // ── Sync Goto.context quando goto conecta a um contexto ─────────────────
    // Substitui o useEffect que varreria todos os nós; aqui sabemos exatamente
    // qual nó mudou e qual é o destino.
    setNodes((ns) => {
      const srcNode = ns.find((n) => n.id === source);
      const tgtNode = ns.find((n) => n.id === target);
      if (srcNode?.type === 'goto' && tgtNode?.type === 'context') {
        return ns.map((n) =>
          n.id === source
            ? { ...n, data: { ...n.data, context: tgtNode.data.contextName } }
            : n
        );
      }
      return ns;
    });
  }, [setEdges, setNodes, neonColor]); // ← nodes removido das deps

  // ── Mudanças em edges — detecta deleção do handle 'true' → limpa campo ────
  // Usa edgesRef.current (estável) em vez de edges no closure — sem dep edges.
  const handleEdgesChange = useCallback((changes) => {
    for (const c of changes) {
      if (c.type === 'remove') {
        const edge    = edgesRef.current.find((e) => e.id === c.id);
        const srcNode = nodesRef.current.find((n) => n.id === edge?.source);

        // Limpa trueContext quando edge do TimeNode é removida
        if (edge?.sourceHandle === 'true') {
          setNodes((ns) =>
            ns.map((n) =>
              n.id === edge.source
                ? { ...n, data: { ...n.data, trueContext: '' } }
                : n
            )
          );
        }

        // ── Sync Goto.context quando edge do goto é removida ─────────────────
        if (srcNode?.type === 'goto') {
          setNodes((ns) =>
            ns.map((n) =>
              n.id === edge.source
                ? { ...n, data: { ...n.data, context: '' } }
                : n
            )
          );
        }
      }
    }
    // Fecha o context menu se qualquer edge foi removida
    if (changes.some((c) => c.type === 'remove')) setEdgeMenu(null);
    onEdgesChange(changes);
  }, [onEdgesChange, setNodes]); // ← edges removido das deps

  // ── Context menu de botão direito em edge ────────────────────────────────
  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  // Reseta o offset da edge → volta ao trajeto automático
  const resetEdgeOffset = useCallback((edgeId) => {
    setEdges((es) =>
      es.map((e) =>
        e.id === edgeId ? { ...e, data: { ...(e.data || {}), offsetX: 0, offsetY: 0 } } : e
      )
    );
    setEdgeMenu(null);
  }, [setEdges]);

  // Remove edge por ID — aplica o mesmo cleanup do handleEdgesChange
  const removeEdgeById = useCallback((edgeId) => {
    const edge    = edgesRef.current.find((e) => e.id === edgeId);
    const srcNode = nodesRef.current.find((n) => n.id === edge?.source);

    if (edge?.sourceHandle === 'true') {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === edge.source ? { ...n, data: { ...n.data, trueContext: '' } } : n
        )
      );
    }
    // Sync Goto.context quando removida via context menu
    if (srcNode?.type === 'goto') {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === edge.source ? { ...n, data: { ...n.data, context: '' } } : n
        )
      );
    }
    setEdges((es) => es.filter((e) => e.id !== edgeId));
    setEdgeMenu(null);
  }, [setEdges, setNodes]); // ← edges removido das deps

  // ── Direção CAMPO → EDGE (chamado pelo PropertiesPanel no onBlur/Enter) ───
  const syncTrueContext = useCallback((timeNodeId, trueCtx) => {
    const trimmed = (trueCtx || '').trim();

    if (!trimmed) {
      setEdges((es) =>
        es.filter((e) => !(e.source === timeNodeId && e.sourceHandle === 'true'))
      );
      return;
    }

    // Lê nodesRef.current em vez de nodes do closure — sem dep em nodes
    const targetCtx = nodesRef.current.find(
      (n) => n.type === 'context' && n.data.contextName === trimmed
    );
    if (!targetCtx) return; // Texto livre sem match — mantém o texto, sem edge

    setEdges((es) => {
      const filtered = es.filter(
        (e) => !(e.source === timeNodeId && e.sourceHandle === 'true')
      );
      return addEdge(
        {
          source: timeNodeId,
          sourceHandle: 'true',
          target: targetCtx.id,
          targetHandle: 'ctx-in',
          type: 'floating',
          data: { offsetX: 0, offsetY: 0 },
          animated: false,
          style: { stroke: '#ffcc00', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ffcc00' },
        },
        filtered
      );
    });
  }, [setEdges]); // ← nodes removido das deps

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Helpers de posicionamento ─────────────────────────────────────────────
  const findContextAt = (absPos, currentNodes) => {
    const ctxs = currentNodes.filter((n) => n.type === 'context');
    for (let i = ctxs.length - 1; i >= 0; i--) {
      const c = ctxs[i];
      const w = (c.style?.width)  || c.width  || 320;
      const h = (c.style?.height) || c.height || 54;
      if (
        absPos.x >= c.position.x &&
        absPos.x <= c.position.x + w &&
        absPos.y >= c.position.y &&
        absPos.y <= c.position.y + h
      ) return c;
    }
    return null;
  };

  // ── Drop da sidebar para o canvas ─────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/rcx-node');
    if (!type) return;

    const position = rfInstance.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    if (type === 'config' && nodes.some((n) => n.type === 'config')) {
      alert('⚠ Já existe um nó de Configuração. Apenas um é permitido.');
      return;
    }

    const newNode = buildNode(type, position);

    // Atribui exportOrder automático e nome único para novos ContextNodes
    if (type === 'context') {
      const ctxNodes = nodes.filter((n) => n.type === 'context');
      const maxOrder = ctxNodes.reduce((max, n) => Math.max(max, n.data?.exportOrder ?? 0), 0);
      const existingNames = ctxNodes.map((n) => n.data?.contextName || '');
      // Usa o prefixo configurado pelo usuário como base do nome
      const prefix    = (config.contextPrefix || 'orpen-ivr').replace(/\s+/g, '-');
      const baseName  = `${prefix}-novo-contexto`;
      const uniqueName = generateUniqueContextName(baseName, existingNames);
      newNode.data = { ...newNode.data, exportOrder: maxOrder + 1, contextName: uniqueName };
    }

    if (type !== 'context') {
      const parent = findContextAt(position, nodes);
      if (parent) {
        newNode.parentNode = parent.id;
        newNode.extent     = 'parent';
        newNode.draggable  = false; // gerenciado pelo ContextNode
        newNode.position   = {
          x: 20,
          y: 0, // será ajustado pelo ContextNode via useEffect
        };

        // Adiciona ao final do childOrder do pai
        setNodes((ns) => {
          const updated = ns.map((n) =>
            n.id === parent.id
              ? { ...n, data: { ...n.data, childOrder: [...(n.data.childOrder || []), newNode.id] } }
              : n
          );
          // Filho deve vir DEPOIS do pai no array
          return [...updated, newNode];
        });
        return;
      }
    }

    setNodes((ns) =>
      newNode.type === 'context' ? [newNode, ...ns] : [...ns, newNode]
    );
  }, [rfInstance, nodes, setNodes]);

  // ── Re-parenting ao arrastar nó existente ─────────────────────────────────
  const onNodeDragStop = useCallback((event, draggedNode) => {
    // Apply alignment snap before anything else
    alignDragStop(event, draggedNode);

    // IDs de nós que se moveram: o nó arrastado + filhos quando é ContextNode
    const movedIds = new Set([draggedNode.id]);
    if (draggedNode.type === 'context') {
      nodes.forEach((n) => { if (n.parentNode === draggedNode.id) movedIds.add(n.id); });
    }

    // Reseta o offset de todas as edges conectadas aos nós movidos.
    // Feito ao soltar (não durante o drag) para evitar re-renders excessivos.
    setEdges((es) =>
      es.map((e) => {
        if (
          (movedIds.has(e.source) || movedIds.has(e.target)) &&
          ((e.data?.offsetX || 0) !== 0 || (e.data?.offsetY || 0) !== 0)
        ) {
          return { ...e, data: { ...(e.data || {}), offsetX: 0, offsetY: 0 } };
        }
        return e;
      })
    );

    // Re-parenting apenas para nós não-contexto
    if (draggedNode.type === 'context') return;

    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentNode) {
      const p = nodes.find((n) => n.id === draggedNode.parentNode);
      if (p) { absX += p.position.x; absY += p.position.y; }
    }

    const target    = findContextAt({ x: absX, y: absY }, nodes);
    const targetId  = target ? target.id : null;
    const currentParent = draggedNode.parentNode || null;
    if (targetId === currentParent) return;

    setNodes((ns) => {
      // 1. Atualiza o nó arrastado (parentNode, extent, draggable, position)
      let result = ns.map((n) => {
        if (n.id !== draggedNode.id) return n;
        if (targetId) {
          return {
            ...n,
            parentNode: targetId,
            extent:     'parent',
            draggable:  false,
            position:   { x: 20, y: 0 }, // ContextNode ajusta via useEffect
          };
        }
        const { parentNode, extent, ...rest } = n;
        return { ...rest, draggable: true, position: { x: absX, y: absY } };
      });

      // 2. Atualiza childOrder dos contextos envolvidos
      result = result.map((n) => {
        if (n.type !== 'context') return n;
        const order = [...(n.data.childOrder || [])];
        let changed = false;
        if (n.id === currentParent) {
          const i = order.indexOf(draggedNode.id);
          if (i >= 0) { order.splice(i, 1); changed = true; }
        }
        if (n.id === targetId) {
          if (!order.includes(draggedNode.id)) { order.push(draggedNode.id); changed = true; }
        }
        return changed ? { ...n, data: { ...n.data, childOrder: order } } : n;
      });

      // 3. Garante filho DEPOIS do pai no array (exigência do React Flow)
      if (targetId) {
        const childIdx  = result.findIndex((n) => n.id === draggedNode.id);
        const parentIdx = result.findIndex((n) => n.id === targetId);
        if (childIdx !== -1 && parentIdx !== -1 && childIdx < parentIdx) {
          const [moved] = result.splice(childIdx, 1);
          result.push(moved);
        }
      }

      return result;
    });
  }, [nodes, setNodes, setEdges]); // alignDragStop omitido — é estável

  // ── Seleção ───────────────────────────────────────────────────────────────

  // Helpers para calcular conjunto ativo a partir de um nó clicado
  // edgesRef.current sempre atualizado pelo useEffect acima — callback estável para sempre
  const computeActiveFromNode = useCallback((nodeId) => {
    const connectedEdges = edgesRef.current.filter((e) => e.source === nodeId || e.target === nodeId);
    const newEdgeIds     = new Set(connectedEdges.map((e) => e.id));
    const newNodeIds     = new Set();
    for (const e of connectedEdges) {
      newNodeIds.add(e.source === nodeId ? e.target : e.source);
    }
    setActiveEdgeIds(newEdgeIds);
    setActiveNodeIds(newNodeIds);
  }, []); // ← edges removido das deps; edgesRef é estável

  const onNodeClick  = useCallback((_, n) => {
    setSelectedId(n.id);
    setEdgeMenu(null);
    setNodeMenu(null);
    computeActiveFromNode(n.id);
  }, [computeActiveFromNode]);

  // Clicar em edge → ativa a edge + os dois nós das extremidades
  const onEdgeClick  = useCallback((_, edge) => {
    setSelectedId(null);
    setEdgeMenu(null);
    setNodeMenu(null);
    setActiveEdgeIds(new Set([edge.id]));
    setActiveNodeIds(new Set([edge.source, edge.target]));
  }, []);

  // Clicar no canvas → volta ao repouso imediatamente
  const onPaneClick  = useCallback(() => {
    setSelectedId(null);
    setEdgeMenu(null);
    setNodeMenu(null);
    setActiveEdgeIds(new Set());
    setActiveNodeIds(new Set());
  }, []);

  // ── Atualização de dados e estilo ─────────────────────────────────────────
  const updateNodeData = useCallback((id, data) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
  }, [setNodes]);

  // Atualiza campos parciais do data de um nó (usado pelo ExportOrderPanel)
  const patchNodeData = useCallback((id, dataPatch) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...dataPatch } } : n))
    );
  }, [setNodes]);

  const patchNodeStyle = useCallback((id, stylePatch) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, style: { ...(n.style || {}), ...stylePatch } } : n))
    );
  }, [setNodes]);

  // Goto.context sync removido deste useEffect — movido para onConnect (conexão)
  // e handleEdgesChange/removeEdgeById (desconexão), onde o evento é preciso e
  // não requer varredura O(n×m) de todos os nós a cada mudança de edges.

  // ── Propagação de rename de ContextNode ──────────────────────────────────
  // Chamado pelo PropertiesPanel quando contextName muda via painel de edição.
  // O ContextNode inline já propaga diretamente via useReactFlow + applyContextRename.
  const propagateContextRename = useCallback((oldName, newName) => {
    setNodes((ns) => applyContextRename(ns, oldName, newName));
  }, [setNodes]);

  // ── Deleção ───────────────────────────────────────────────────────────────
  const deleteNode = useCallback((id) => {
    setNodes((ns) =>
      ns
        .filter((n) => n.id !== id)
        // Remove o id excluído do childOrder de qualquer ContextNode pai
        .map((n) => {
          if (n.type !== 'context') return n;
          const order = (n.data.childOrder || []).filter((cid) => cid !== id);
          if (order.length === (n.data.childOrder || []).length) return n;
          return { ...n, data: { ...n.data, childOrder: order } };
        })
    );
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  }, [setNodes, setEdges]);

  // ── Toggle comentado (DESATIVAR / ATIVAR) ─────────────────────────────────
  const toggleComment = useCallback((id) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        if (n.data._commented) {
          const { _commented, _origLine, ...rest } = n.data;
          return { ...n, data: rest };
        }
        return { ...n, data: { ...n.data, _commented: true } };
      })
    );
  }, [setNodes]);

  // ── Destaque de navegação de contextos ───────────────────────────────────
  // Acionado pelo ContextNavPanel ao clicar num item da lista.
  // Injeta _navHighlight=true no data do nó alvo via nodesWithSel (não persiste).
  const [highlightedCtxId,  setHighlightedCtxId]  = useState(null);
  const highlightTimerRef = useRef(null);

  const onContextNavigate = useCallback((id) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedCtxId(id);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCtxId(null);
    }, 1500);
  }, []);

  // ── Alignment guides + snap ───────────────────────────────────────────────
  const {
    guides,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop: alignDragStop,
  } = useAlignmentGuides(nodes, setNodes, config.smartGuides);

  // mousePos e seus callbacks foram movidos para dentro do ContextOrderOverlay.
  // O componente lê o mouse diretamente via wrapperRef, evitando que o Canvas
  // todo re-renderize a cada movimento do mouse.

  // ── Helpers de reordenação de childOrder ────────────────────────────────────
  // Atualiza childOrder de um ContextNode e retorna os novos nodes
  const updateChildOrder = useCallback((ctxId, newOrder) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === ctxId ? { ...n, data: { ...n.data, childOrder: newOrder } } : n
      )
    );
  }, [setNodes]);

  const onMoveUp = useCallback((ctxId, nodeId) => {
    setNodes((ns) => {
      const ctx = ns.find((n) => n.id === ctxId);
      if (!ctx) return ns;
      const order = [...(ctx.data.childOrder || [])];
      const idx   = order.indexOf(nodeId);
      if (idx <= 0) return ns;
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
      return ns.map((n) => n.id === ctxId ? { ...n, data: { ...n.data, childOrder: order } } : n);
    });
  }, [setNodes]);

  const onMoveDown = useCallback((ctxId, nodeId) => {
    setNodes((ns) => {
      const ctx = ns.find((n) => n.id === ctxId);
      if (!ctx) return ns;
      const order = [...(ctx.data.childOrder || [])];
      const idx   = order.indexOf(nodeId);
      if (idx < 0 || idx >= order.length - 1) return ns;
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
      return ns.map((n) => n.id === ctxId ? { ...n, data: { ...n.data, childOrder: order } } : n);
    });
  }, [setNodes]);

  const onMoveTo = useCallback((ctxId, nodeId, targetIndex) => {
    setNodes((ns) => {
      const ctx = ns.find((n) => n.id === ctxId);
      if (!ctx) return ns;
      const order = [...(ctx.data.childOrder || [])];
      const idx   = order.indexOf(nodeId);
      if (idx < 0) return ns;
      order.splice(idx, 1);
      const clampedTarget = Math.max(0, Math.min(order.length, targetIndex));
      order.splice(clampedTarget, 0, nodeId);
      return ns.map((n) => n.id === ctxId ? { ...n, data: { ...n.data, childOrder: order } } : n);
    });
  }, [setNodes]);

  const onDragReorder = useCallback((ctxId, nodeId, targetIndex) => {
    onMoveTo(ctxId, nodeId, targetIndex);
  }, [onMoveTo]);

  // ── Expandir opção DTMF para ContextNode independente ────────────────────
  const expandDigitToContext = useCallback((menuNodeId, digitId) => {
    const ns  = nodesRef.current;
    const menuNode = ns.find((n) => n.id === menuNodeId);
    if (!menuNode) return;
    const digit = (menuNode.data.digits || []).find((d) => d.id === digitId);
    if (!digit || !Array.isArray(digit.actions) || digit.actions.length === 0) return;

    // Nome do contexto derivado de logIvrLabel ou fallback
    const ctxBaseName = menuNode.data.contextName || 'orpen-ivr-menu';
    const logIvrLbl   = digit.logIvrLabel || `${ctxBaseName}-op-${digit.id}`;
    const prefix      = (config.contextPrefix || 'orpen-ivr').replace(/\s+/g, '-');
    const baseName    = `${prefix}-${logIvrLbl}`;
    const existingNames = ns.filter((n) => n.type === 'context').map((n) => n.data?.contextName || '');
    const uniqueCtxName = generateUniqueContextName(baseName, existingNames);

    const ctxId    = 'n_' + uid();
    const childIds = [];
    const childNodes = [];

    // Cria nós filhos a partir de actions
    for (const action of (digit.actions || [])) {
      const childId    = 'n_' + uid();
      const defaultNode = buildNode(action.type, { x: 20, y: 0 });
      childIds.push(childId);
      childNodes.push({
        ...defaultNode,
        id:         childId,
        data:       { ...(defaultNode.data || {}), ...(action.data || {}) },
        parentNode: ctxId,
        extent:     'parent',
        draggable:  false,
        position:   { x: 20, y: 0 },
      });
    }

    // Cria nó de destino a partir de finalDestination
    if (digit.finalDestination) {
      const fd     = digit.finalDestination;
      const destId = 'n_' + uid();
      let destNode = null;

      if (fd.type === 'hangup') {
        destNode = { ...buildNode('hangup', { x: 20, y: 0 }), id: destId };
      } else if (fd.type === 'queue') {
        destNode = {
          ...buildNode('route', { x: 20, y: 0 }), id: destId,
          data: { routeMode: 'fila', queue: fd.ext || fd.ctx || '', queueOptions: '', context: '', extension: 's', priority: '1' },
        };
      } else if (fd.type === 'context') {
        destNode = {
          ...buildNode('route', { x: 20, y: 0 }), id: destId,
          data: { routeMode: 'context', queue: '', queueOptions: '', context: fd.contextName || '', extension: fd.ext || 's', priority: fd.pri || '1' },
        };
      } else if (fd.type === 'dial') {
        destNode = {
          ...buildNode('dial', { x: 20, y: 0 }), id: destId,
          data: { destination: fd.target || '', timeout: fd.timeout || '30', options: '' },
        };
      } else if (fd.type === 'playback_only') {
        destNode = {
          ...buildNode('playback', { x: 20, y: 0 }), id: destId,
          data: { filename: fd.filename || '', label: '' },
        };
      }

      if (destNode) {
        destNode.parentNode = ctxId;
        destNode.extent     = 'parent';
        destNode.draggable  = false;
        destNode.position   = { x: 20, y: 0 };
        childIds.push(destId);
        childNodes.push(destNode);
      }
    }

    // Posição: à direita do MenuNode, alinhado com a linha do dígito
    const menuWidth   = (menuNode.style?.width) || (menuNode.width) || 250;
    const digitIndex  = (menuNode.data.digits || []).findIndex((d) => d.id === digitId);
    const ctxX        = menuNode.position.x + menuWidth + 200;
    const ctxY        = menuNode.position.y + Math.max(0, digitIndex) * 26;

    const maxOrder = ns
      .filter((n) => n.type === 'context')
      .reduce((mx, n) => Math.max(mx, n.data?.exportOrder ?? 0), 0);

    const ctxNode = {
      id:   ctxId,
      type: 'context',
      position: { x: ctxX, y: ctxY },
      data: {
        contextName: uniqueCtxName,
        childOrder:  childIds,
        exportOrder: maxOrder + 1,
        isDraft:     false,
      },
      style:  { width: 320, height: 54 },
      zIndex: -1,
    };

    const newEdge = {
      id:           'e_' + uid(),
      source:       menuNodeId,
      sourceHandle: `d-${digitId}`,
      target:       ctxId,
      targetHandle: 'ctx-in',
      type:         'floating',
      data:         { offsetX: 0, offsetY: 0 },
      animated:     false,
      style:        { stroke: neonColor, strokeWidth: 1.5 },
      markerEnd:    { type: MarkerType.ArrowClosed, color: neonColor },
    };

    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== menuNodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            digits: n.data.digits.map((d) => {
              if (d.id !== digitId) return d;
              return {
                ...d,
                actions:              [],
                finalDestination:     null,
                expandedToContextId:  ctxId,
                expandedToContextName: uniqueCtxName,
                expandedChildCount:   childIds.length,
              };
            }),
          },
        };
      });
      // ContextNode primeiro (pai antes dos filhos), depois filhos
      return [ctxNode, ...updated, ...childNodes];
    });

    setEdges((es) => {
      const filtered = es.filter((e) => !(e.source === menuNodeId && e.sourceHandle === `d-${digitId}`));
      return [...filtered, newEdge];
    });
  }, [setNodes, setEdges, neonColor, config]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recolher ContextNode de volta para opção DTMF ────────────────────────
  const collapseDigitContext = useCallback((menuNodeId, digitId) => {
    const ns = nodesRef.current;
    const menuNode = ns.find((n) => n.id === menuNodeId);
    if (!menuNode) return;
    const digit = (menuNode.data.digits || []).find((d) => d.id === digitId);
    if (!digit?.expandedToContextId) return;

    const ctxId  = digit.expandedToContextId;
    const ctxNode = ns.find((n) => n.id === ctxId);

    // Reconstrói actions e finalDestination a partir dos filhos
    const actions = [];
    let finalDestination = null;

    if (ctxNode) {
      const childIds = ctxNode.data.childOrder || [];
      for (const cid of childIds) {
        const child = ns.find((n) => n.id === cid);
        if (!child) continue;

        if (child.type === 'hangup') {
          finalDestination = { type: 'hangup' };
        } else if (child.type === 'route') {
          const m = child.data.routeMode || 'macro';
          if (m === 'fila') {
            finalDestination = { type: 'queue', ext: child.data.queue || '', ctx: child.data.queue || '' };
          } else if (m === 'macro') {
            finalDestination = { type: 'context', contextName: 'orpen-ivr-transfer' };
          } else {
            finalDestination = {
              type: 'context',
              contextName: child.data.context || '',
              ext: child.data.extension || 's',
              pri: child.data.priority || '1',
            };
          }
        } else if (child.type === 'dial') {
          finalDestination = { type: 'dial', target: child.data.destination || '' };
        } else {
          actions.push({ type: child.type, data: { ...child.data } });
        }
      }
    }

    const childIdsToRemove = ctxNode ? new Set([ctxId, ...(ctxNode.data.childOrder || [])]) : new Set([ctxId]);

    setNodes((prev) =>
      prev
        .filter((n) => !childIdsToRemove.has(n.id))
        .map((n) => {
          if (n.id !== menuNodeId) return n;
          return {
            ...n,
            data: {
              ...n.data,
              digits: n.data.digits.map((d) => {
                if (d.id !== digitId) return d;
                const { expandedToContextId, expandedToContextName, expandedChildCount, ...rest } = d;
                return { ...rest, actions, finalDestination };
              }),
            },
          };
        })
    );

    setEdges((es) => es.filter((e) => !(e.source === menuNodeId && e.sourceHandle === `d-${digitId}`)));
  }, [setNodes, setEdges]);

  // ── Context menu de clique direito em nó ─────────────────────────────────
  const [nodeMenu, setNodeMenu] = useState(null); // { x, y, nodeId }

  const onNodeContextMenu = useCallback((event, n) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeMenu({ x: event.clientX, y: event.clientY, nodeId: n.id });
    setSelectedId(n.id);
    computeActiveFromNode(n.id);
  }, [computeActiveFromNode]);

  // ── Forçar save imediato (sem aguardar debounce) ─────────────────────────
  const flushSave = useCallback(async () => {
    if (!currentProjectId) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const now = new Date().toISOString();
    const projectData = {
      id:              currentProjectId,
      name:            projectName || 'projeto',
      dataCriacao:     projectCreatedAt || now,
      dataModificacao: now,
      flow: {
        nodes:    rfInstance.getNodes(),
        edges:    rfInstance.getEdges(),
        viewport: rfInstance.getViewport(),
      },
    };
    await salvarProjeto(projectData);
    onProjectSaved?.(projectData);
    isDirtyRef.current = false;
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);
  }, [rfInstance, projectName, projectCreatedAt, currentProjectId, onProjectSaved]);

  // ── Navegação de volta à Home ─────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (onGoBack && config.confirmBack && isDirtyRef.current) {
      setShowBackConfirm(true);
    } else {
      onGoBack?.();
    }
  }, [onGoBack, config.confirmBack]);

  const handleSaveAndBack = useCallback(async () => {
    await flushSave();
    setShowBackConfirm(false);
    onGoBack?.();
  }, [flushSave, onGoBack]);

  // ── Exportação ────────────────────────────────────────────────────────────
  const doExport = () => {
    setExportText(generateDialplan(nodes, edges, {
      includeSectionComments: config.includeSectionComments,
    }));
    // Computa e armazena o layout para download junto ao .conf
    try {
      const layout = extractLayout(
        nodes, edges,
        rfInstance.getViewport(),
        confFileName
      );
      setExportLayout(layout);
    } catch (_) {
      setExportLayout(null);
    }
    // Modo AMIGÁVEL: mostra aviso informativo na primeira exportação
    if (mode === 'amigavel' && !localStorage.getItem('orpen-first-export-shown')) {
      setShowFirstExportModal(true);
    } else {
      setShowExport(true);
    }
  };

  const confirmFirstExport = () => {
    if (firstExportDontShow) localStorage.setItem('orpen-first-export-shown', '1');
    setShowFirstExportModal(false);
    setShowExport(true);
  };

  /** Baixa apenas o arquivo .conf */
  const downloadConf = () => {
    let content = exportText.replace(/\r\n/g, '\n');
    if (config.lineEnding === 'crlf') content = content.replace(/\n/g, '\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = confFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Baixa apenas o arquivo .layout.json */
  const downloadLayoutJson = () => {
    if (!exportLayout) return;
    exportLayoutFile(exportLayout, confFileName.replace(/\.conf$/, ''));
  };

  /**
   * Baixa os dois arquivos sequencialmente (300ms de intervalo para evitar bloqueio do browser).
   * Comportamento descrito na spec: "ao clicar em EXPORTAR URA, dois arquivos são baixados".
   */
  const downloadBoth = () => {
    downloadConf();
    if (exportLayout) {
      setTimeout(() => downloadLayoutJson(), 300);
    }
  };

  const copyConf = async () => {
    try { await navigator.clipboard.writeText(exportText); } catch (_) { /* ignore */ }
  };

  // Injeta selected visualmente sem armazenar em estado extra do React Flow.
  // _navHighlight: flag transitória para a animação de destaque de navegação —
  // não persiste nos nodes reais nem dispara autosave.
  const nodesWithSel = useMemo(
    () => nodes.map((n) => {
      const navHl = highlightedCtxId && n.id === highlightedCtxId;
      return {
        ...n,
        selected: n.id === selectedId,
        ...(navHl ? { data: { ...n.data, _navHighlight: true } } : {}),
      };
    }),
    [nodes, selectedId, highlightedCtxId]
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  // ── Tema: sincroniza cor do marker das edges quando o tema muda ───────────────
  useEffect(() => {
    setEdges((es) =>
      es.map((e) => {
        const needsMarker = e.markerEnd?.color && e.markerEnd.color !== neonColor;
        if (!needsMarker) return e;
        return { ...e, markerEnd: { ...e.markerEnd, color: neonColor } };
      })
    );
  }, [neonColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapa de estilo de edge configurável → tipo do React Flow
  const edgeStyleMap = { smooth: 'smoothstep', straight: 'straight', step: 'step' };

  // defaultEdgeOptions reativo ao tema e ao estilo configurado
  const defaultEdgeOpts = useMemo(() => ({
    type: edgeStyleMap[config.edgeStyle] || 'smoothstep',
    style: { stroke: neonColor, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: neonColor },
    focusable: true,
    selectable: true,
  }), [neonColor, config.edgeStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuActionsValue = useMemo(
    () => ({ expandDigitToContext }),
    [expandDigitToContext]
  );

  return (
    <MenuActionsContext.Provider value={menuActionsValue}>
    <ModeContext.Provider value={mode}>
    <ThemeContext.Provider value={effectiveTheme}>
    <ActiveSelectionContext.Provider value={activeSelectionValue}>
    <EdgeModeContext.Provider value="grid">
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <Sidebar />

      <div
        ref={wrapperRef}
        style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0 }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Botão ← VOLTAR (apenas no modo projeto) */}
        {onGoBack && (
          <button
            className="btn-neon"
            onClick={handleBack}
            style={{
              position: 'absolute', top: 10, left: 10, zIndex: 6,
              padding: '5px 12px', fontSize: 11, letterSpacing: 1,
            }}
          >
            ← VOLTAR
          </button>
        )}

        {/* Status bar */}
        <div style={{
          position: 'absolute', top: 10, left: onGoBack ? 110 : 10, zIndex: 5,
          display: 'flex', gap: 8, alignItems: 'center',
          background: 'var(--status-bar-bg)',
          padding: '6px 12px',
          border: '1px solid var(--line)',
          borderRadius: 3,
          fontSize: 11,
          color: 'var(--neon-dim)',
        }}>
          <span>NODES: <span style={{ color: '#fff' }}>{nodes.length}</span></span>
          <span style={{ color: 'var(--line)' }}>│</span>
          <span>EDGES: <span style={{ color: '#fff' }}>{edges.length}</span></span>
          <span style={{ color: 'var(--line)' }}>│</span>
          <span>STATUS: <span style={{ color: 'var(--neon)' }}>● LIVE</span></span>
          <span style={{ color: 'var(--line)' }}>│</span>
          <span style={{ color: '#888' }}>
            SELECT +{' '}
            <kbd style={{ padding: '1px 5px', border: '1px solid var(--neon-dim)', borderRadius: 2, fontSize: 9, color: 'var(--neon)' }}>
              DEL
            </kbd>{' '}
            p/ excluir
          </span>
          <span style={{ color: 'var(--line)' }}>│</span>
          {/* Painel de ordem de exportação */}
          <button
            onClick={() => setShowOrderPanel((v) => !v)}
            title="Gerenciar ordem de exportação dos contextos"
            style={{
              background: showOrderPanel ? 'var(--neon-glow-faint)' : 'transparent',
              border: `1px solid ${showOrderPanel ? 'var(--neon)' : 'var(--line)'}`,
              color: showOrderPanel ? 'var(--neon)' : 'var(--neon-dim)',
              fontFamily: 'inherit', fontSize: 9, letterSpacing: 1,
              padding: '1px 7px', cursor: 'pointer', borderRadius: 2,
              transition: 'all 0.15s',
            }}
          >
            ⊞ ORDEM
          </button>
          <span style={{ color: 'var(--line)' }}>│</span>
          {/* Botão de configurações */}
          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            title="Configurações do projeto"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--neon-dim)',
              fontFamily: 'inherit', fontSize: 9, letterSpacing: 1,
              padding: '1px 7px', cursor: 'pointer', borderRadius: 2,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon)'; e.currentTarget.style.color = 'var(--neon)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--neon-dim)'; }}
          >
            ⚙ CONFIG
          </button>
          {/* ── Toggle PRO / AMIGÁVEL ─────────────────────────────────────── */}
          <>
            <span style={{ color: 'var(--line)' }}>│</span>
            <div style={{ display: 'flex', gap: 0 }}>
              <button
                type="button"
                onClick={() => config.setConfig('mode', 'pro')}
                title="Modo PRO — interface técnica completa"
                style={{
                  background: mode === 'pro' ? 'var(--neon)' : 'transparent',
                  border: '1px solid var(--neon)',
                  borderRight: 'none',
                  color: mode === 'pro' ? '#000' : 'var(--neon)',
                  opacity: mode === 'pro' ? 1 : 0.45,
                  fontFamily: 'inherit', fontSize: 9, letterSpacing: 1,
                  padding: '1px 7px', cursor: mode === 'pro' ? 'default' : 'pointer',
                  borderRadius: '2px 0 0 2px',
                  fontWeight: mode === 'pro' ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                PRO
              </button>
              <button
                type="button"
                onClick={() => config.setConfig('mode', 'amigavel')}
                title="Modo AMIGÁVEL — interface humanizada com dicas"
                style={{
                  background: mode === 'amigavel' ? 'var(--neon)' : 'transparent',
                  border: '1px solid var(--neon)',
                  color: mode === 'amigavel' ? '#000' : 'var(--neon)',
                  opacity: mode === 'amigavel' ? 1 : 0.45,
                  fontFamily: 'inherit', fontSize: 9, letterSpacing: 1,
                  padding: '1px 7px', cursor: mode === 'amigavel' ? 'default' : 'pointer',
                  borderRadius: '0 2px 2px 0',
                  fontWeight: mode === 'amigavel' ? 700 : 400,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                AMIGÁVEL
              </button>
            </div>
          </>
        </div>

        <ReactFlow
          nodes={nodesWithSel}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          edgesFocusable
          elementsSelectable
          multiSelectionKeyCode={['Meta', 'Control']}
          connectionLineType={edgeStyleMap[config.edgeStyle] === 'straight' ? 'straight' : config.edgeStyle === 'step' ? 'step' : 'smoothstep'}
          defaultEdgeOptions={defaultEdgeOpts}
          snapToGrid={config.snapToGrid}
          snapGrid={[config.gridSize || 16, config.gridSize || 16]}
          proOptions={{ hideAttribution: false }}
        >
          {config.showGrid && <Background gap={config.gridSize || 16} size={1} />}
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'config')  return neonColor;
              if (n.type === 'menu')    return neonColor;
              if (n.type === 'time')    return '#ffcc00';
              if (n.type === 'holiday') return '#ff5050';
              if (n.type === 'queue')   return '#ff8c00';
              if (ACTION_META[n.type])  return ACTION_META[n.type].color;
              return '#888';
            }}
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>

        {/* ── Indicador de salvamento flutuante ────────────────────────────
             Posicionado no canto inferior esquerdo do wrapper do canvas.
             Sem borda nem fundo — apenas texto monospace sobre o canvas.
             Estados: saving → neon 60%, saved → fade 0.35→0 em 3s, error → vermelho 80%. */}
        {saveStatus && (
          <div
            key={saveStatus}
            className={saveStatus === 'saved' ? 'save-status-fade' : undefined}
            style={{
              position: 'absolute',
              bottom: 16,
              left: 200,
              zIndex: 45,
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 1,
              pointerEvents: 'none',
              userSelect: 'none',
              color: saveStatus === 'error' ? '#ff5050' : neonColor,
              opacity: saveStatus === 'saving' ? 0.6
                     : saveStatus === 'error'  ? 0.8
                     : undefined, // 'saved': animação save-status-fade controla opacity
            }}
          >
            {saveStatus === 'saving' && '// salvando...'}
            {saveStatus === 'saved'  && '// salvo'}
            {saveStatus === 'error'  && '// erro ao salvar'}
          </div>
        )}

        {/* Alignment guide lines — rendered over canvas, below UI controls */}
        <AlignmentGuides guides={guides} />

        {/* Reorder controls overlay — rendered above React Flow, z-index 50 */}
        <ContextOrderOverlay
          nodes={nodes}
          wrapperRef={wrapperRef}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onMoveTo={onMoveTo}
          onDragReorder={onDragReorder}
        />

        {/* Painel de ordem de exportação dos contextos */}
        {showOrderPanel && (
          <ExportOrderPanel
            nodes={nodes}
            onClose={() => setShowOrderPanel(false)}
            onUpdateNode={patchNodeData}
          />
        )}

        {/* ── Hint de canvas vazio (modo AMIGÁVEL) ─────────────────────── */}
        {mode === 'amigavel' && nodes.filter((n) => n.type !== 'config').length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 4,
            pointerEvents: 'none',
            border: '1px dashed var(--neon)',
            borderRadius: 4,
            padding: '24px 32px',
            background: 'rgba(0,0,0,0.72)',
            maxWidth: 360,
            color: 'var(--neon)',
            fontSize: 11,
            letterSpacing: 0.5,
            lineHeight: 2,
            opacity: 0.75,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, marginBottom: 10, color: 'var(--neon-dim)', borderBottom: '1px dashed var(--line)', paddingBottom: 8 }}>
              // COMO COMEÇAR
            </div>
            <div>1. Arraste um <strong style={{ color: 'var(--neon)' }}>Bloco de Contexto</strong> da barra lateral para o canvas</div>
            <div>2. Dentro do bloco, arraste os elementos do fluxo de atendimento</div>
            <div>3. Conecte os blocos entre si para definir o caminho da chamada</div>
            <div>4. Clique em <strong style={{ color: 'var(--neon)' }}>Exportar URA</strong> quando o fluxo estiver pronto</div>
          </div>
        )}

        {/* Botão de exportação flutuante */}
        <button
          className="btn-neon"
          onClick={doExport}
          style={{
            position: 'absolute', bottom: 18, right: 18, zIndex: 5,
            padding: '12px 22px', fontSize: 13, letterSpacing: 2,
            boxShadow: '0 0 10px var(--neon), 0 0 22px var(--neon-glow)',
          }}
        >
          ⤓ EXPORTAR URA (.conf)
        </button>

      </div>

      <PropertiesPanel
        node={selectedNode}
        nodes={nodes}
        updateNodeData={updateNodeData}
        deleteNode={deleteNode}
        toggleComment={toggleComment}
        patchNodeStyle={patchNodeStyle}
        syncTrueContext={syncTrueContext}
        propagateContextRename={propagateContextRename}
        onContextNavigate={onContextNavigate}
      />

      {/* ── Context menu de edge (botão direito) ─────────────────────────── */}
      {edgeMenu && (() => {
        const menuEdge      = edges.find((e) => e.id === edgeMenu.edgeId);
        const isFloating = menuEdge?.type === 'floating';
        const hasOffset  = ((menuEdge?.data?.offsetX || 0) !== 0 || (menuEdge?.data?.offsetY || 0) !== 0);

        const menuBtnStyle = {
          display: 'block', width: '100%',
          background: 'transparent', border: 'none',
          fontFamily: 'inherit', fontSize: 12,
          padding: '9px 12px',
          cursor: 'pointer', textAlign: 'left',
          letterSpacing: 1, transition: 'background 0.1s',
        };

        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setEdgeMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setEdgeMenu(null); }}
            />
            <div style={{
              position: 'fixed',
              top: edgeMenu.y, left: edgeMenu.x,
              zIndex: 9999,
              background: 'var(--panel)',
              border: '1px solid var(--neon-dim)',
              borderRadius: 3, overflow: 'hidden',
              boxShadow: '0 0 14px var(--neon-glow-soft), 0 4px 12px rgba(0,0,0,0.6)',
              minWidth: 185,
            }}>
              <div style={{
                padding: '4px 10px', fontSize: 9,
                color: 'var(--neon-dim)', letterSpacing: 1,
                borderBottom: '1px solid var(--line)',
                background: 'var(--panel-2)',
              }}>
                // CONEXÃO
              </div>

              {/* Redefinir trajeto — só para edges floating com offset */}
              {isFloating && hasOffset && (
                <button
                  style={{ ...menuBtnStyle, color: 'var(--neon)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neon-glow-bg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => resetEdgeOffset(edgeMenu.edgeId)}
                >
                  ↺ Redefinir trajeto
                </button>
              )}

              <button
                style={{ ...menuBtnStyle, color: '#ff5050' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ff3b3b18'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => removeEdgeById(edgeMenu.edgeId)}
              >
                ⌫ Remover conexão
              </button>
            </div>
          </>
        );
      })()}

      {/* ── Context menu de clique direito em nó ─────────────────────────── */}
      {nodeMenu && (() => {
        const menuNode     = nodes.find((n) => n.id === nodeMenu.nodeId);
        const isCommented  = !!menuNode?.data?._commented;
        const canComment   = menuNode && menuNode.type !== 'config' && menuNode.type !== 'context';

        const nodeBtnStyle = {
          display: 'block', width: '100%',
          background: 'transparent', border: 'none',
          fontFamily: 'inherit', fontSize: 12,
          padding: '9px 12px',
          cursor: 'pointer', textAlign: 'left',
          letterSpacing: 1, transition: 'background 0.1s',
        };

        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setNodeMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setNodeMenu(null); }}
            />
            <div style={{
              position: 'fixed',
              top: nodeMenu.y, left: nodeMenu.x,
              zIndex: 9999,
              background: 'var(--panel)',
              border: '1px solid var(--neon-dim)',
              borderRadius: 3, overflow: 'hidden',
              boxShadow: '0 0 14px var(--neon-glow-soft), 0 4px 12px rgba(0,0,0,0.6)',
              minWidth: 175,
            }}>
              <div style={{
                padding: '4px 10px', fontSize: 9,
                color: 'var(--neon-dim)', letterSpacing: 1,
                borderBottom: '1px solid var(--line)',
                background: 'var(--panel-2)',
              }}>
                // NÓ
              </div>

              {canComment && (
                <button
                  style={{ ...nodeBtnStyle, color: isCommented ? 'var(--neon)' : '#ffcc00' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isCommented ? 'var(--neon-glow-faint)' : '#ffcc0012'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => { toggleComment(nodeMenu.nodeId); setNodeMenu(null); }}
                >
                  {isCommented ? '▶ ATIVAR nó' : '// DESATIVAR nó'}
                </button>
              )}

              {menuNode?.type !== 'config' && (
                <button
                  style={{ ...nodeBtnStyle, color: '#ff5050' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#ff3b3b18'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => { deleteNode(nodeMenu.nodeId); setNodeMenu(null); }}
                >
                  ⌫ Excluir nó
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Modal: confirmação de saída com alterações não salvas ─────────── */}
      {showBackConfirm && (
        <div className="modal-backdrop" onClick={() => setShowBackConfirm(false)}>
          <div className="modal" style={{ maxWidth: 380, width: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
              <div className="neon-text" style={{ letterSpacing: 2, fontSize: 12 }}>
                ▌ ALTERAÇÕES NÃO SALVAS
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--neon-dim)', marginBottom: 20, lineHeight: 1.7 }}>
                Existem alterações não salvas no projeto atual.<br />
                Como deseja prosseguir?
              </p>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <button className="btn-neon" onClick={handleSaveAndBack} style={{ padding: '9px 12px', fontSize: 11, letterSpacing: 1 }}>
                  ⤓ SALVAR E VOLTAR
                </button>
                <button className="btn-neon btn-danger" onClick={() => { setShowBackConfirm(false); onGoBack?.(); }} style={{ padding: '9px 12px', fontSize: 11, letterSpacing: 1 }}>
                  SAIR SEM SALVAR
                </button>
                <button className="btn-neon" onClick={() => setShowBackConfirm(false)} style={{ padding: '9px 12px', fontSize: 11, letterSpacing: 1 }}>
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: primeiro export (modo AMIGÁVEL) ─────────────────────────── */}
      {showFirstExportModal && (
        <div className="modal-backdrop" onClick={() => setShowFirstExportModal(false)}>
          <div className="modal" style={{ maxWidth: 420, width: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="neon-text" style={{ letterSpacing: 2, fontSize: 12 }}>▌ ARQUIVO GERADO</div>
              <button className="btn-neon btn-danger" style={{ padding: '4px 10px' }} onClick={() => setShowFirstExportModal(false)} aria-label="Fechar">X</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--neon-dim)', marginBottom: 12, lineHeight: 1.8 }}>
                O arquivo <span style={{ color: '#fff' }}>.conf</span> gerado está pronto para uso no servidor Asterisk.
              </p>
              <p style={{ fontSize: 12, color: 'var(--neon-dim)', marginBottom: 12, lineHeight: 1.8 }}>
                Entregue este arquivo para o técnico responsável pela instalação.
              </p>
              <p style={{ fontSize: 12, color: '#ffcc00', marginBottom: 20, lineHeight: 1.8 }}>
                ⚠ Não edite o arquivo manualmente sem conhecimento técnico.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: 11, color: 'var(--neon-dim)' }}>
                <input
                  type="checkbox"
                  checked={firstExportDontShow}
                  onChange={(e) => setFirstExportDontShow(e.target.checked)}
                  style={{ accentColor: 'var(--neon)' }}
                />
                Não mostrar novamente
              </label>
              <button className="btn-neon" onClick={confirmFirstExport} style={{ width: '100%', padding: '10px 12px', fontSize: 11, letterSpacing: 1 }}>
                ENTENDI, BAIXAR ARQUIVO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de exportação */}
      {showExport && (
        <div className="modal-backdrop" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ letterSpacing: 2, fontSize: 12 }} className="neon-text">
                ▌ DIALPLAN GERADO :: {confFileName}
              </div>
              <button className="btn-neon btn-danger" style={{ padding: '4px 10px' }}
                onClick={() => setShowExport(false)}>
                X
              </button>
            </div>

            {/* Banner dos arquivos gerados */}
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--panel-2)',
              fontSize: 9,
              color: 'var(--neon-dim)',
              letterSpacing: 0.5,
              lineHeight: 2.2,
            }}>
              <span style={{ color: '#555', letterSpacing: 1 }}>{'// arquivos gerados:'}</span>
              <br />
              <span style={{ color: 'var(--neon)' }}>{confFileName}</span>
              {' — dialplan para o Asterisk'}
              <br />
              <span style={{ color: 'var(--neon)' }}>{confFileName.replace(/\.conf$/, '.layout.json')}</span>
              {' — layout do canvas '}
              <span style={{ color: '#555' }}>(mantenha junto ao .conf)</span>
            </div>

            {/* Preview do .conf */}
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '14px',
              background: 'var(--bg)',
              color: 'var(--neon-value)',
              fontSize: 11,
              lineHeight: 1.55,
              whiteSpace: 'pre',
            }}>
              {exportText}
            </pre>

            {/* Ações */}
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--line)',
              display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              <button className="btn-neon" onClick={copyConf} title="Copiar .conf para a área de transferência">
                ⎘ COPIAR
              </button>
              <button className="btn-neon" onClick={downloadConf} title={`Baixar apenas ${confFileName}`}
                style={{ borderColor: 'var(--neon-dim)', color: 'var(--neon-dim)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon)'; e.currentTarget.style.color = 'var(--neon)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--neon-dim)'; e.currentTarget.style.color = 'var(--neon-dim)'; }}
              >
                ⤓ .conf
              </button>
              <button className="btn-neon" onClick={downloadLayoutJson}
                disabled={!exportLayout}
                title={`Baixar apenas ${confFileName.replace(/\.conf$/, '.layout.json')}`}
                style={{ borderColor: 'var(--neon-dim)', color: 'var(--neon-dim)', opacity: exportLayout ? 1 : 0.4, cursor: exportLayout ? 'pointer' : 'not-allowed' }}
                onMouseEnter={(e) => { if (exportLayout) { e.currentTarget.style.borderColor = 'var(--neon)'; e.currentTarget.style.color = 'var(--neon)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--neon-dim)'; e.currentTarget.style.color = 'var(--neon-dim)'; }}
              >
                ⤓ .layout.json
              </button>
              <button className="btn-neon" onClick={downloadBoth}
                title="Baixar ambos os arquivos sequencialmente"
                style={{ boxShadow: '0 0 6px var(--neon-glow)' }}
              >
                ⤓ BAIXAR AMBOS
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de configurações */}
      {showConfigModal && <ConfigModal onClose={() => setShowConfigModal(false)} />}

    </div>
    </EdgeModeContext.Provider>
    </ActiveSelectionContext.Provider>
    </ThemeContext.Provider>
    </ModeContext.Provider>
    </MenuActionsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP — roteamento simples: 'home' | 'canvas'
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,         setScreen]         = useState('home');
  const [projects,       setProjects]       = useState([]);  // reflete o IndexedDB
  const [currentProject, setCurrentProject] = useState(null);
  const [pendingFlow,    setPendingFlow]    = useState(null);
  const [importError,    setImportError]    = useState(null);
  const [confImportData, setConfImportData] = useState(null); // { nodes, edges, stats, suggestedName }

  // Modo de interface agora gerenciado pelo ConfigContext (ConfigProvider)
  // Tema gerenciado pelo ConfigContext via colorTheme ('terminal'|'matrix'|'dark')

  // Carrega projetos do IndexedDB na inicialização
  useEffect(() => {
    listarProjetos().then(setProjects).catch(() => {});
  }, []);

  // Recarrega a lista da home sempre que um projeto é salvo pelo Canvas
  const refreshProjects = useCallback(() => {
    listarProjetos().then(setProjects).catch(() => {});
  }, []);

  // ── Criar novo projeto ────────────────────────────────────────────────────
  const handleCreateProject = useCallback(async (name) => {
    const now     = new Date().toISOString();
    const project = { id: Date.now().toString(), name, dataCriacao: now, dataModificacao: now, flow: null };
    await salvarProjeto(project);
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    setPendingFlow(null);
    setScreen('canvas');
  }, []);

  // ── Abrir projeto existente ───────────────────────────────────────────────
  // Carrega automaticamente o layout da store 'layouts' e aplica sobre o flow.
  // Isso é não-crítico: se não houver layout salvo, usa as posições do project.flow.
  const handleOpenProject = useCallback(async (project) => {
    let flow = project.flow;
    if (flow?.nodes?.length) {
      try {
        const cFileName = `${project.name}.conf`;
        const layout = await loadLayout(cFileName);
        if (layout) {
          const result = applyLayout(flow.nodes, flow.edges || [], layout);
          // Mantém o viewport do project.flow (posição de câmera que o usuário deixou)
          flow = { ...flow, nodes: result.nodes, edges: result.edges };
        }
      } catch (_) { /* não-crítico — prossegue com flow original */ }
    }
    setCurrentProject(project);
    setPendingFlow(flow);
    setScreen('canvas');
  }, []);

  // ── Callback recebido do Canvas após auto-save ────────────────────────────
  const handleProjectSaved = useCallback((updatedProject) => {
    setCurrentProject(updatedProject);
    refreshProjects(); // sincroniza a lista com o IndexedDB
  }, [refreshProjects]);

  // ── Voltar para a Home ────────────────────────────────────────────────────
  const handleGoBack = useCallback(() => {
    setScreen('home');
    setCurrentProject(null);
    setPendingFlow(null);
  }, []);

  // ── Importar projeto via arquivo .JSON ────────────────────────────────────
  const handleImportProject = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.name || !data.dataCriacao || !data.flow?.nodes) {
          setImportError('arquivo inválido ou incompatível');
          return;
        }
        const project = {
          id:              Date.now().toString(),
          name:            data.name,
          dataCriacao:     data.dataCriacao,
          dataModificacao: data.dataModificacao || data.dataCriacao,
          flow:            data.flow,
        };
        await salvarProjeto(project);
        refreshProjects();
        setImportError(null);
      } catch {
        setImportError('arquivo inválido ou incompatível');
      }
    };
    reader.readAsText(file);
  }, [refreshProjects]);

  // ── Importar projeto via arquivo .CONF ────────────────────────────────────
  // Aceita um confFile obrigatório e um layoutFile opcional (detecção automática
  // pelo input múltiplo no HomeScreen).
  const handleImportConf = useCallback((confFile, layoutFile) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = importConf(e.target.result);
        let nodes         = result.flowState.nodes;
        let edges         = result.flowState.edges;
        let viewport      = { x: 0, y: 0, zoom: 0.7 };
        let layoutApplied = false;

        // Aplica o layout automaticamente se o arquivo foi detectado junto ao .conf
        if (layoutFile) {
          try {
            const layout = await importLayoutFile(layoutFile);
            const applied = applyLayout(nodes, edges, layout);
            nodes    = applied.nodes;
            edges    = applied.edges;
            viewport = applied.viewport || viewport;
            layoutApplied = true;
            // Persiste para sessões futuras (abertura via IndexedDB)
            const cFileName = result.suggestedName
              ? `${result.suggestedName}.conf`
              : confFile.name;
            saveLayout(cFileName, layout).catch(() => {});
          } catch (err) {
            console.warn('[layout] não foi possível aplicar o layout:', err.message);
            layoutApplied = false;
          }
        }

        setConfImportData({
          nodes,
          edges,
          viewport,
          stats:         result.stats,
          suggestedName: result.suggestedName,
          validation:    result.validation,
          fileName:      confFile.name,
          layoutApplied,
        });
        setImportError(null);
      } catch (err) {
        console.error('[confImporter] erro:', err);
        setImportError('erro ao processar o arquivo .conf');
      }
    };
    reader.readAsText(confFile);
  }, []);

  // Layout já foi aplicado dentro de handleImportConf — aqui apenas cria o projeto.
  const handleConfImportConfirm = useCallback(async (name) => {
    if (!confImportData) return;
    const now     = new Date().toISOString();
    const project = {
      id:              Date.now().toString(),
      name,
      dataCriacao:     now,
      dataModificacao: now,
      flow: {
        nodes:    confImportData.nodes,
        edges:    confImportData.edges,
        viewport: confImportData.viewport || { x: 0, y: 0, zoom: 0.7 },
      },
    };
    await salvarProjeto(project);
    setCurrentProject(project);
    setPendingFlow(project.flow);
    setConfImportData(null);
    refreshProjects();
    setScreen('canvas');
  }, [confImportData, refreshProjects]);

  // ── Excluir projeto ───────────────────────────────────────────────────────
  const handleDeleteProject = useCallback(async (id) => {
    const { excluirProjeto } = await import('./services/projectStorage');
    await excluirProjeto(id);
    refreshProjects();
  }, [refreshProjects]);

  // ── Renderização — ConfigProvider único envolve todo o roteamento ──────────
  // Provider estável entre trocas de tela: contexto de config/tema não remonta.
  return (
    <ConfigProvider>
      {screen === 'home' ? (
        <HomeScreen
          projects={projects}
          onCreateProject={handleCreateProject}
          onOpenProject={handleOpenProject}
          onImportProject={handleImportProject}
          onImportConf={handleImportConf}
          onDeleteProject={handleDeleteProject}
          importError={importError}
          confImportData={confImportData}
          onConfImportConfirm={handleConfImportConfirm}
          onConfImportCancel={() => setConfImportData(null)}
        />
      ) : (
        <div style={{ height: '100vh', width: '100vw', display: 'flex' }}>
          <ReactFlowProvider>
            {/* key força remount completo ao trocar de projeto */}
            <Canvas
              key={currentProject?.id || 'standalone'}
              initialFlow={pendingFlow}
              projectName={currentProject?.name}
              projectCreatedAt={currentProject?.dataCriacao}
              currentProjectId={currentProject?.id}
              onGoBack={handleGoBack}
              onProjectSaved={handleProjectSaved}
            />
          </ReactFlowProvider>
        </div>
      )}
    </ConfigProvider>
  );
}
