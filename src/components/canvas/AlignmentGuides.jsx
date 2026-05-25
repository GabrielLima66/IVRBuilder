import React, { memo } from 'react';
import { useStore } from 'reactflow';

const GUIDE_COLOR = 'var(--canvas-guide)';

/**
 * GuideLines — inner component subscribed to the viewport transform.
 * Only mounted when guides are active, keeping the transform subscription
 * inactive during pan/zoom when no drag is in progress.
 */
function GuideLines({ guides }) {
  const [tx, ty, zoom] = useStore((s) => s.transform);

  return (
    <>
      {guides.map((g, i) => {
        if (g.x !== undefined) {
          const screenX = Math.round(g.x * zoom + tx);
          return (
            <div
              key={`gx-${i}`}
              style={{
                position: 'absolute',
                left: screenX,
                top: 0,
                width: 1,
                height: '100%',
                background: GUIDE_COLOR,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          );
        }

        if (g.y !== undefined) {
          const screenY = Math.round(g.y * zoom + ty);
          return (
            <div
              key={`gy-${i}`}
              style={{
                position: 'absolute',
                top: screenY,
                left: 0,
                height: 1,
                width: '100%',
                background: GUIDE_COLOR,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          );
        }

        return null;
      })}
    </>
  );
}

/**
 * AlignmentGuides — renders smart guide lines over the React Flow canvas.
 *
 * Must be rendered inside a ReactFlowProvider (uses useStore for viewport transform).
 * Guide lines are positioned in screen coordinates, converting from flow coordinates
 * using the current viewport transform (pan + zoom).
 *
 * Returns null when no guides are active — avoids subscribing to transform updates
 * during pan/zoom when guides are not needed.
 *
 * @param {{ x?: number, y?: number }[]} guides  Active guides from useAlignmentGuides
 */
const AlignmentGuides = memo(function AlignmentGuides({ guides }) {
  if (guides.length === 0) return null;
  return <GuideLines guides={guides} />;
});

AlignmentGuides.displayName = 'AlignmentGuides';
export default AlignmentGuides;
