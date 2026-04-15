import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphNode } from '../api/graph';

type Props = {
  data: GraphData;
};

export function GraphView({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="graph">
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          graphData={data}
          width={size.width}
          height={size.height}
          nodeId="id"
          nodeLabel={(n) => (n as GraphNode).label}
          nodeAutoColorBy="group"
          linkLabel={(l: { relation?: string }) => l.relation ?? ''}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={100}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            if (n.x === undefined || n.y === undefined) return;
            const label = n.label;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px system-ui, sans-serif`;

            ctx.beginPath();
            ctx.arc(n.x, n.y, 4, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#60a5fa';
            ctx.fill();

            ctx.fillStyle = '#e6e6e6';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, n.x + 6, n.y);
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode & { x?: number; y?: number };
            if (n.x === undefined || n.y === undefined) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, 6, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
}
