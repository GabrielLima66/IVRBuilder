import { useState, useCallback, useRef, useEffect } from 'react';

/** Threshold (flow-coordinate px) below which edge alignment is detected */
export const ALIGNMENT_THRESHOLD = 8;

/**
 * Returns the set of nodes to compare against during alignment, based on scope rules:
 *  - Child node (has parentNode): siblings + the parent ContextNode
 *  - ContextNode / GlobalConfigNode (type context|config, no parent): other top-level
 *    ContextNodes and the GlobalConfigNode
 *  - Standalone action node: other top-level nodes
 */
function getCandidates(draggedNode, allNodes, movedIds) {
  const { type, parentNode } = draggedNode;

  if (parentNode) {
    return allNodes.filter(
      (n) => !movedIds.has(n.id) && (n.parentNode === parentNode || n.id === parentNode)
    );
  }

  if (type === 'context' || type === 'config') {
    return allNodes.filter(
      (n) => !movedIds.has(n.id) && !n.parentNode && (n.type === 'context' || n.type === 'config')
    );
  }

  return allNodes.filter((n) => !movedIds.has(n.id) && !n.parentNode);
}

/** Resolves width and height, accounting for ContextNode's style-based dimensions */
function getNodeDimensions(n) {
  return {
    w: n.style?.width  || n.width  || 0,
    h: n.style?.height || n.height || 0,
  };
}

/**
 * Computes the absolute (canvas) position of a node by walking its parent chain.
 * Used at drag start to build the static bounds cache from the nodes state array,
 * which may not always have positionAbsolute populated by React Flow.
 */
function getAbsolutePos(node, nodesMap) {
  if (!node.parentNode) return { x: node.position.x, y: node.position.y };
  const parent = nodesMap.get(node.parentNode);
  if (!parent) return { x: node.position.x, y: node.position.y };
  const pAbs = getAbsolutePos(parent, nodesMap);
  return { x: pAbs.x + node.position.x, y: pAbs.y + node.position.y };
}

/**
 * Compares the dragged node's edges against each static bound and returns:
 *  - guides: array of { x } (vertical) or { y } (horizontal) guide positions
 *  - snapX: absolute left-edge position if snapping on X axis, or null
 *  - snapY: absolute top-edge position if snapping on Y axis, or null
 *
 * Multiple guides per axis are deduplicated. The closest match wins for snap.
 */
function computeGuides(draggedNode, staticBounds) {
  const abs = draggedNode.positionAbsolute;
  if (!abs || !draggedNode.width || !draggedNode.height) {
    return { guides: [], snapX: null, snapY: null };
  }

  const { width: w, height: h } = draggedNode;
  const dl = abs.x, dr = abs.x + w;
  const dt = abs.y, db = abs.y + h;

  const xSnaps = [];
  const ySnaps = [];

  for (const sb of staticBounds) {
    for (const [dEdge, sEdge, snapLeft] of [
      [dl, sb.left,  sb.left      ],
      [dl, sb.right, sb.right     ],
      [dr, sb.left,  sb.left  - w ],
      [dr, sb.right, sb.right - w ],
    ]) {
      const dist = Math.abs(dEdge - sEdge);
      if (dist < ALIGNMENT_THRESHOLD) xSnaps.push({ guidePos: sEdge, snapLeft, dist });
    }

    for (const [dEdge, sEdge, snapTop] of [
      [dt, sb.top,    sb.top        ],
      [dt, sb.bottom, sb.bottom     ],
      [db, sb.top,    sb.top    - h ],
      [db, sb.bottom, sb.bottom - h ],
    ]) {
      const dist = Math.abs(dEdge - sEdge);
      if (dist < ALIGNMENT_THRESHOLD) ySnaps.push({ guidePos: sEdge, snapTop, dist });
    }
  }

  xSnaps.sort((a, b) => a.dist - b.dist);
  ySnaps.sort((a, b) => a.dist - b.dist);

  const guides = [];
  const seenX = new Set();
  const seenY = new Set();

  for (const s of xSnaps) {
    const k = Math.round(s.guidePos);
    if (!seenX.has(k)) { seenX.add(k); guides.push({ x: s.guidePos }); }
  }
  for (const s of ySnaps) {
    const k = Math.round(s.guidePos);
    if (!seenY.has(k)) { seenY.add(k); guides.push({ y: s.guidePos }); }
  }

  return {
    guides,
    snapX: xSnaps.length > 0 ? xSnaps[0].snapLeft : null,
    snapY: ySnaps.length > 0 ? ySnaps[0].snapTop  : null,
  };
}

/**
 * useAlignmentGuides — Figma-style smart guides + snap for the React Flow canvas.
 *
 * @param {Node[]} nodes   Current nodes from useNodesState
 * @param {Function} setNodes  Setter from useNodesState
 *
 * Returns:
 *  - guides         Active guide lines for rendering  ({ x } | { y })[]
 *  - onNodeDragStart  Wire to <ReactFlow onNodeDragStart>
 *  - onNodeDrag       Wire to <ReactFlow onNodeDrag>
 *  - onNodeDragStop   Wire to <ReactFlow onNodeDragStop> (combine with existing handler)
 *
 * Scope rules:
 *  - Child nodes align only with siblings + their parent ContextNode
 *  - ContextNodes align only with other ContextNodes + GlobalConfigNode (config)
 *  - Snap on drag stop: node jumps to exact aligned position when guide is active
 */
export function useAlignmentGuides(nodes, setNodes) {
  const [guides, setGuides] = useState([]);

  // Refs — let callbacks stay stable while always accessing fresh data
  const nodesRef        = useRef(nodes);
  const staticBoundsRef = useRef([]);
  const snapRef         = useRef({ x: null, y: null });
  const rafRef          = useRef(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // ── onNodeDragStart — build static bounds cache once per drag ──────────────
  const onNodeDragStart = useCallback((_, draggedNode) => {
    const currentNodes = nodesRef.current;
    const nodesMap = new Map(currentNodes.map((n) => [n.id, n]));

    const movedIds = new Set([draggedNode.id]);
    if (draggedNode.type === 'context') {
      currentNodes.forEach((n) => { if (n.parentNode === draggedNode.id) movedIds.add(n.id); });
    }

    const candidates = getCandidates(draggedNode, currentNodes, movedIds);

    staticBoundsRef.current = candidates
      .filter((n) => {
        const { w, h } = getNodeDimensions(n);
        return w > 0 && h > 0;
      })
      .map((n) => {
        const { w, h } = getNodeDimensions(n);
        const abs = getAbsolutePos(n, nodesMap);
        return { left: abs.x, right: abs.x + w, top: abs.y, bottom: abs.y + h };
      });

    snapRef.current = { x: null, y: null };
  }, []); // stable — reads from refs only

  // ── onNodeDrag — recompute guides each frame (throttled via rAF) ───────────
  const onNodeDrag = useCallback((_, draggedNode) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const { guides: newGuides, snapX, snapY } = computeGuides(
        draggedNode, staticBoundsRef.current
      );
      snapRef.current = { x: snapX, y: snapY };
      setGuides(newGuides);
      rafRef.current = null;
    });
  }, []); // stable

  // ── onNodeDragStop — apply snap and clear guides ───────────────────────────
  const onNodeDragStop = useCallback((_, draggedNode) => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setGuides([]);

    const { x: snapAbsLeft, y: snapAbsTop } = snapRef.current;
    snapRef.current = { x: null, y: null };

    if (snapAbsLeft === null && snapAbsTop === null) return;

    setNodes((ns) => {
      const dragged = ns.find((n) => n.id === draggedNode.id);
      if (!dragged) return ns;

      // Compute parent's absolute position for converting back to relative coords
      let pAbsX = 0, pAbsY = 0;
      if (dragged.parentNode) {
        const parent = ns.find((n) => n.id === dragged.parentNode);
        if (parent) {
          const gp = parent.parentNode ? ns.find((n) => n.id === parent.parentNode) : null;
          pAbsX = (gp?.position.x ?? 0) + parent.position.x;
          pAbsY = (gp?.position.y ?? 0) + parent.position.y;
        }
      }

      const curAbsX = draggedNode.positionAbsolute?.x ?? (dragged.position.x + pAbsX);
      const curAbsY = draggedNode.positionAbsolute?.y ?? (dragged.position.y + pAbsY);

      const newAbsX = snapAbsLeft !== null ? snapAbsLeft : curAbsX;
      const newAbsY = snapAbsTop  !== null ? snapAbsTop  : curAbsY;

      return ns.map((n) =>
        n.id === draggedNode.id
          ? { ...n, position: { x: newAbsX - pAbsX, y: newAbsY - pAbsY } }
          : n
      );
    });
  }, [setNodes]); // stable — setNodes is stable from useNodesState

  return { guides, onNodeDragStart, onNodeDrag, onNodeDragStop };
}
