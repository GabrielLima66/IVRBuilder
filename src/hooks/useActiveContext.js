import { useState, useRef, useEffect } from 'react';
import { useStore } from 'reactflow';

/**
 * useActiveContext — detecta qual ContextNode está mais próximo do centro do viewport.
 *
 * Subscreve ao transform do React Flow via useStore (panX, panY, zoom) e às
 * dimensões do container. Recalcula com debounce de 150ms para não causar
 * re-renders excessivos durante o pan/zoom.
 *
 * @param {Node[]} nodes  Array de nós React Flow (useNodesState)
 * @returns {string|null}  ID do ContextNode mais central no viewport, ou null
 *
 * Deve ser chamado dentro de um componente filho de ReactFlowProvider.
 */
export function useActiveContext(nodes) {
  const [activeContextId, setActiveContextId] = useState(null);
  const timerRef = useRef(null);
  const nodesRef = useRef(nodes);

  // Mantém a ref dos nós atualizada sem re-criar o efeito principal
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Subscriptions individuais para evitar re-renders por referência de array
  const panX = useStore((s) => s.transform[0]);
  const panY = useStore((s) => s.transform[1]);
  const zoom = useStore((s) => s.transform[2]);
  const cW   = useStore((s) => s.width  || 900);
  const cH   = useStore((s) => s.height || 600);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      // Centro do viewport em coordenadas do canvas
      // transform[0]=panX, transform[1]=panY, transform[2]=zoom
      // screen position = canvas_pos * zoom + pan
      // ⟹ canvas_pos = (screen_pos - pan) / zoom
      const viewCX = (cW / 2 - panX) / zoom;
      const viewCY = (cH / 2 - panY) / zoom;

      const ctxs = nodesRef.current.filter((n) => n.type === 'context');
      if (!ctxs.length) { setActiveContextId(null); return; }

      let bestId   = null;
      let bestDist = Infinity;

      for (const n of ctxs) {
        // Dimensões: style tem prioridade sobre width/height (ContextNode usa style)
        const w  = n.style?.width  || n.width  || 320;
        const h  = n.style?.height || n.height || 100;
        // Centro absoluto do ContextNode
        const cx = n.position.x + w / 2;
        const cy = n.position.y + h / 2;
        const d  = Math.hypot(cx - viewCX, cy - viewCY);
        if (d < bestDist) { bestDist = d; bestId = n.id; }
      }

      setActiveContextId(bestId);
    }, 150);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [panX, panY, zoom, cW, cH]); // eslint-disable-line react-hooks/exhaustive-deps
  // nodes lidos via ref para evitar re-criar o efeito a cada mudança de nó

  return activeContextId;
}
