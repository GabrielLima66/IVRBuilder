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
import { applyContextRename } from './utils/renamePropagator';
import { isSemanticHandle } from './utils/edgeUtils';
import { EdgeModeContext } from './contexts/EdgeModeContext';
import HomeScreen from './screens/HomeScreen';
import { salvarProjeto, listarProjetos } from './services/projectStorage';
import { parseConfFile } from './utils/confParser';
import { useAlignmentGuides } from './hooks/useAlignmentGuides';
import AlignmentGuides from './components/canvas/AlignmentGuides';

// Ambos os tipos usam EdgeWithWaypoints:
// 'floating' — floating handles + waypoints editáveis (handles genéricos)
// 'smoothstep' — posições fixas de handle (ctx-start, d-*) sem waypoints editáveis
const edgeTypes = { floating: EdgeWithWaypoints, smoothstep: EdgeWithWaypoints };

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — estado global do grafo + lógica de DnD / reparenting
// Props de projeto (opcionais): permitem integração com HomeScreen.
// ─────────────────────────────────────────────────────────────────────────────
function Canvas({ initialFlow, projectName, projectCreatedAt, currentProjectId, onGoBack, onProjectSaved }) {
  const wrapperRef  = useRef(null);
  const rfInstance  = useReactFlow();

  // Referências estáveis — evita re-mount de componentes internos
  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const stableEdgeTypes = useMemo(() => edgeTypes, []);

  // Nós e edges iniciais: usa o flow carregado ou inicia com config padrão.
  // Calculados apenas uma vez no mount (o componente é "keyed" por projeto).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initNodes = useMemo(() => initialFlow?.nodes?.length ? initialFlow.nodes : [buildNode('config', { x: 60, y: 80 })], []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initEdges = useMemo(() => initialFlow?.edges || [], []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedId,      setSelectedId]      = useState(null);
  const [showExport,      setShowExport]      = useState(false);
  const [exportText,      setExportText]      = useState('');
  // Modo de roteamento das edges: 'free' | 'grid'
  const [edgeMode,        setEdgeMode]        = useState('free');
  // Context menu de edge (botão direito)
  const [edgeMenu, setEdgeMenu] = useState(null); // { x, y, edgeId }

  // ── Rastreamento de alterações + auto-save IndexedDB (debounce 2s) ──────
  const isDirtyRef   = useRef(false);
  const skipDirtyRef = useRef(true);
  const saveTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'

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
        })
        .catch(() => setSaveStatus(null));
    }, 2000);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal de confirmação para voltar com alterações não salvas ───────────
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // ── Conexões ──────────────────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    const { source, sourceHandle, targetHandle, target } = params;

    // Handle 'true' do TimeNode → direção EDGE → CAMPO
    if (sourceHandle === 'true') {
      const srcNode = nodes.find((n) => n.id === source);
      const tgtNode = nodes.find((n) => n.id === target);

      // Atualiza trueContext se destino é um ContextNode
      if (srcNode?.type === 'time' && tgtNode?.type === 'context') {
        setNodes((ns) =>
          ns.map((n) =>
            n.id === source
              ? { ...n, data: { ...n.data, trueContext: tgtNode.data.contextName } }
              : n
          )
        );
      }

      // Remove edge 'true' anterior e adiciona nova (amarela, floating com waypoints)
      setEdges((es) => {
        const filtered = es.filter(
          (e) => !(e.source === source && e.sourceHandle === 'true')
        );
        return addEdge(
          {
            ...params,
            type: 'floating',
            data: { waypoints: [] },
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
          // waypoints inicializados vazios → edge usa floating handles automaticamente
          ...(useFloating ? { data: { waypoints: [] } } : {}),
          animated: false,
          style: { stroke: '#00ff41', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff41' },
        },
        eds
      )
    );
  }, [setEdges, setNodes, nodes]);

  // ── Mudanças em edges — detecta deleção do handle 'true' → limpa campo ────
  const handleEdgesChange = useCallback((changes) => {
    for (const c of changes) {
      if (c.type === 'remove') {
        const edge = edges.find((e) => e.id === c.id);
        if (edge?.sourceHandle === 'true') {
          setNodes((ns) =>
            ns.map((n) =>
              n.id === edge.source
                ? { ...n, data: { ...n.data, trueContext: '' } }
                : n
            )
          );
        }
      }
    }
    // Fecha o context menu se qualquer edge foi removida
    if (changes.some((c) => c.type === 'remove')) setEdgeMenu(null);
    onEdgesChange(changes);
  }, [edges, onEdgesChange, setNodes]);

  // ── Context menu de botão direito em edge ────────────────────────────────
  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  // Limpa todos os waypoints de uma edge → volta ao trajeto automático dos floating handles
  const resetEdgeWaypoints = useCallback((edgeId) => {
    setEdges((es) =>
      es.map((e) =>
        e.id === edgeId ? { ...e, data: { ...(e.data || {}), waypoints: [] } } : e
      )
    );
    setEdgeMenu(null);
  }, [setEdges]);

  // Remove edge por ID — aplica o mesmo cleanup do handleEdgesChange
  const removeEdgeById = useCallback((edgeId) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (edge?.sourceHandle === 'true') {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === edge.source ? { ...n, data: { ...n.data, trueContext: '' } } : n
        )
      );
    }
    setEdges((es) => es.filter((e) => e.id !== edgeId));
    setEdgeMenu(null);
  }, [edges, setEdges, setNodes]);

  // ── Direção CAMPO → EDGE (chamado pelo PropertiesPanel no onBlur/Enter) ───
  const syncTrueContext = useCallback((timeNodeId, trueCtx) => {
    const trimmed = (trueCtx || '').trim();

    if (!trimmed) {
      setEdges((es) =>
        es.filter((e) => !(e.source === timeNodeId && e.sourceHandle === 'true'))
      );
      return;
    }

    const targetCtx = nodes.find(
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
          data: { waypoints: [] },
          animated: false,
          style: { stroke: '#ffcc00', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ffcc00' },
        },
        filtered
      );
    });
  }, [nodes, setEdges]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Helpers de posicionamento ─────────────────────────────────────────────
  const findContextAt = (absPos, currentNodes) => {
    const ctxs = currentNodes.filter((n) => n.type === 'context');
    for (let i = ctxs.length - 1; i >= 0; i--) {
      const c = ctxs[i];
      const w = (c.style && c.style.width)  || c.width  || 480;
      const h = (c.style && c.style.height) || c.height || 320;
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

    const rect = wrapperRef.current.getBoundingClientRect();
    const position = rfInstance.project({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    if (type === 'config' && nodes.some((n) => n.type === 'config')) {
      alert('⚠ Já existe um nó de Configuração. Apenas um é permitido.');
      return;
    }

    const newNode = buildNode(type, position);

    if (type !== 'context') {
      const parent = findContextAt(position, nodes);
      if (parent) {
        newNode.parentNode = parent.id;
        newNode.extent     = 'parent';
        newNode.position   = {
          x: position.x - parent.position.x,
          y: position.y - parent.position.y,
        };
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

    // Limpa waypoints de todas as edges conectadas aos nós movidos.
    // Feito ao soltar (não durante o drag) para evitar re-renders excessivos.
    setEdges((es) =>
      es.map((e) => {
        if (
          (movedIds.has(e.source) || movedIds.has(e.target)) &&
          (e.data?.waypoints?.length || 0) > 0
        ) {
          return { ...e, data: { ...(e.data || {}), waypoints: [] } };
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
      const updated = ns.map((n) => {
        if (n.id !== draggedNode.id) return n;
        if (targetId) {
          return {
            ...n,
            parentNode: targetId,
            extent:     'parent',
            position:   { x: absX - target.position.x, y: absY - target.position.y },
          };
        }
        const { parentNode, extent, ...rest } = n;
        return { ...rest, position: { x: absX, y: absY } };
      });

      // Garante que filho aparece DEPOIS do pai no array (exigência do React Flow)
      if (targetId) {
        const childIdx  = updated.findIndex((n) => n.id === draggedNode.id);
        const parentIdx = updated.findIndex((n) => n.id === targetId);
        if (childIdx !== -1 && parentIdx !== -1 && childIdx < parentIdx) {
          const [moved] = updated.splice(childIdx, 1);
          updated.push(moved);
        }
      }
      return updated;
    });
  }, [nodes, setNodes, setEdges]); // alignDragStop omitido — é estável (useCallback([setNodes]))

  // ── Seleção ───────────────────────────────────────────────────────────────
  const onNodeClick  = useCallback((_, n) => { setSelectedId(n.id); setEdgeMenu(null); setNodeMenu(null); }, []);
  const onPaneClick  = useCallback(() => { setSelectedId(null); setEdgeMenu(null); setNodeMenu(null); }, []);

  // ── Atualização de dados e estilo ─────────────────────────────────────────
  const updateNodeData = useCallback((id, data) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
  }, [setNodes]);

  const patchNodeStyle = useCallback((id, stylePatch) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, style: { ...(n.style || {}), ...stylePatch } } : n))
    );
  }, [setNodes]);

  // Sincroniza campo Goto.context com o contextName do nó destino conectado
  useEffect(() => {
    setNodes((ns) => {
      let changed = false;
      const upd = ns.map((n) => {
        if (n.type !== 'goto') return n;
        const e = edges.find((ed) => ed.source === n.id);
        if (!e) return n;
        const tgt = ns.find((x) => x.id === e.target);
        if (tgt && tgt.type === 'context' && tgt.data.contextName !== n.data.context) {
          changed = true;
          return { ...n, data: { ...n.data, context: tgt.data.contextName } };
        }
        return n;
      });
      return changed ? upd : ns;
    });
  }, [edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Propagação de rename de ContextNode ──────────────────────────────────
  // Chamado pelo PropertiesPanel quando contextName muda via painel de edição.
  // O ContextNode inline já propaga diretamente via useReactFlow + applyContextRename.
  const propagateContextRename = useCallback((oldName, newName) => {
    setNodes((ns) => applyContextRename(ns, oldName, newName));
  }, [setNodes]);

  // ── Deleção ───────────────────────────────────────────────────────────────
  const deleteNode = useCallback((id) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
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

  // ── Alignment guides + snap ───────────────────────────────────────────────
  const {
    guides,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop: alignDragStop,
  } = useAlignmentGuides(nodes, setNodes);

  // ── Context menu de clique direito em nó ─────────────────────────────────
  const [nodeMenu, setNodeMenu] = useState(null); // { x, y, nodeId }

  const onNodeContextMenu = useCallback((event, n) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeMenu({ x: event.clientX, y: event.clientY, nodeId: n.id });
    setSelectedId(n.id);
  }, []);

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
    if (onGoBack && isDirtyRef.current) {
      setShowBackConfirm(true);
    } else {
      onGoBack?.();
    }
  }, [onGoBack]);

  const handleSaveAndBack = useCallback(async () => {
    await flushSave();
    setShowBackConfirm(false);
    onGoBack?.();
  }, [flushSave, onGoBack]);

  // ── Exportação ────────────────────────────────────────────────────────────
  const doExport = () => {
    setExportText(generateDialplan(nodes, edges));
    setShowExport(true);
  };

  const downloadConf = () => {
    const lf   = exportText.replace(/\r\n/g, '\n');
    const blob = new Blob([lf], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'orpen-ura-gerada.conf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyConf = async () => {
    try { await navigator.clipboard.writeText(exportText); } catch (_) { /* ignore */ }
  };

  // Injeta selected visualmente sem armazenar em estado extra do React Flow
  const nodesWithSel = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId]
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  return (
    <EdgeModeContext.Provider value={edgeMode}>
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
          background: 'rgba(13,13,13,0.85)',
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
          <span>STATUS: <span style={{ color: '#00ff41' }}>● LIVE</span></span>
          {saveStatus && (
            <>
              <span style={{ color: 'var(--line)' }}>│</span>
              <span style={{
                color: saveStatus === 'saving' ? '#ffcc00' : 'var(--neon)',
                opacity: saveStatus === 'saving' ? 0.75 : 1,
                letterSpacing: 0.5,
              }}>
                {saveStatus === 'saving' ? '// salvando...' : '// salvo'}
              </span>
            </>
          )}
          <span style={{ color: 'var(--line)' }}>│</span>
          <span style={{ color: '#888' }}>
            SELECT +{' '}
            <kbd style={{ padding: '1px 5px', border: '1px solid var(--neon-dim)', borderRadius: 2, fontSize: 9, color: 'var(--neon)' }}>
              DEL
            </kbd>{' '}
            p/ excluir
          </span>
          <span style={{ color: 'var(--line)' }}>│</span>
          {/* Toggle de modo de roteamento: LIVRE ↔ GRADE */}
          <button
            onClick={() => setEdgeMode((m) => (m === 'free' ? 'grid' : 'free'))}
            title={edgeMode === 'grid' ? 'Modo Grade — clique para Livre' : 'Modo Livre — clique para Grade'}
            style={{
              background: edgeMode === 'grid' ? 'rgba(0,255,65,0.08)' : 'transparent',
              border: `1px solid ${edgeMode === 'grid' ? 'var(--neon)' : 'var(--line)'}`,
              color: edgeMode === 'grid' ? 'var(--neon)' : 'var(--neon-dim)',
              fontFamily: 'inherit', fontSize: 9, letterSpacing: 1,
              padding: '1px 7px', cursor: 'pointer', borderRadius: 2,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon)'; e.currentTarget.style.color = 'var(--neon)'; }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = edgeMode === 'grid' ? 'var(--neon)' : 'var(--line)';
              e.currentTarget.style.color = edgeMode === 'grid' ? 'var(--neon)' : 'var(--neon-dim)';
            }}
          >
            {edgeMode === 'grid' ? '⊞ GRADE' : '◌ LIVRE'}
          </button>
        </div>

        <ReactFlow
          nodes={nodesWithSel}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          nodeTypes={stableNodeTypes}
          edgeTypes={stableEdgeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          edgesFocusable
          elementsSelectable
          multiSelectionKeyCode={['Meta', 'Control']}
          connectionLineType="smoothstep"
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#00ff41', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff41' },
            focusable: true,
            selectable: true,
          }}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'config')  return '#00ff41';
              if (n.type === 'menu')    return '#00b32d';
              if (n.type === 'time')    return '#ffcc00';
              if (n.type === 'holiday') return '#ff5050';
              if (n.type === 'queue')   return '#ff8c00';
              if (ACTION_META[n.type])  return ACTION_META[n.type].color;
              return '#888';
            }}
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>

        {/* Alignment guide lines — rendered over canvas, below UI controls */}
        <AlignmentGuides guides={guides} />

        {/* Botão de exportação flutuante */}
        <button
          className="btn-neon"
          onClick={doExport}
          style={{
            position: 'absolute', bottom: 18, right: 18, zIndex: 5,
            padding: '12px 22px', fontSize: 13, letterSpacing: 2,
            boxShadow: '0 0 10px var(--neon), 0 0 20px rgba(0,255,65,0.4)',
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
      />

      {/* ── Context menu de edge (botão direito) ─────────────────────────── */}
      {edgeMenu && (() => {
        const menuEdge      = edges.find((e) => e.id === edgeMenu.edgeId);
        const isFloating    = menuEdge?.type === 'floating';
        const hasWaypoints  = (menuEdge?.data?.waypoints?.length || 0) > 0;

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
              boxShadow: '0 0 14px rgba(0,255,65,0.25), 0 4px 12px rgba(0,0,0,0.6)',
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

              {/* Redefinir trajeto — só para edges floating com waypoints */}
              {isFloating && hasWaypoints && (
                <button
                  style={{ ...menuBtnStyle, color: 'var(--neon)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#00ff4112'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => resetEdgeWaypoints(edgeMenu.edgeId)}
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
              boxShadow: '0 0 14px rgba(0,255,65,0.25), 0 4px 12px rgba(0,0,0,0.6)',
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = isCommented ? '#00ff4112' : '#ffcc0012'; }}
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

      {/* Modal de exportação */}
      {showExport && (
        <div className="modal-backdrop" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ letterSpacing: 2, fontSize: 12 }} className="neon-text">
                ▌ DIALPLAN GERADO :: orpen-ura-gerada.conf
              </div>
              <button className="btn-neon btn-danger" style={{ padding: '4px 10px' }}
                onClick={() => setShowExport(false)}>
                X
              </button>
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '14px',
              background: '#000',
              color: '#a7ffba',
              fontSize: 11,
              lineHeight: 1.55,
              whiteSpace: 'pre',
            }}>
              {exportText}
            </pre>
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--line)',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
            }}>
              <button className="btn-neon" onClick={copyConf}>⎘ COPIAR</button>
              <button className="btn-neon" onClick={downloadConf}>⤓ BAIXAR .conf</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </EdgeModeContext.Provider>
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
  const handleOpenProject = useCallback((project) => {
    setCurrentProject(project);
    setPendingFlow(project.flow);
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
  const handleImportConf = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = parseConfFile(e.target.result);
        setConfImportData({ ...result, fileName: file.name });
        setImportError(null);
      } catch {
        setImportError('erro ao processar o arquivo .conf');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleConfImportConfirm = useCallback(async (name) => {
    if (!confImportData) return;
    const now = new Date().toISOString();
    const project = {
      id:              Date.now().toString(),
      name,
      dataCriacao:     now,
      dataModificacao: now,
      flow:            { nodes: confImportData.nodes, edges: confImportData.edges, viewport: { x: 0, y: 0, zoom: 0.7 } },
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

  // ── Renderização ──────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
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
    );
  }

  return (
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
  );
}
