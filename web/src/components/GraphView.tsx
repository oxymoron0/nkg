import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphData, GraphLink, GraphNode } from '../api/graph';
import { canonicalEdges } from '../lib/canonicalEdges';
import { getRelationStyle } from '../lib/relationStyle';

type Props = {
  data: GraphData;
};

type InternalNode = GraphNode & {
  degree: number;
  radius: number;
  x?: number;
  y?: number;
};

type InternalLink = GraphLink & {
  curvature: number;
};

type InternalData = {
  nodes: InternalNode[];
  links: InternalLink[];
};

const MIN_RADIUS = 7;
const MAX_RADIUS = 22;
const DIM_ALPHA = 0.15;
const EDGE_LABEL_MIN_SCALE = 1.2;
const NODE_LABEL_MIN_SCALE = 0.85;
const HUB_DEGREE = 4;

function computeInternalData(data: GraphData): InternalData {
  const canonical = canonicalEdges(data.links);

  const degree = new Map<string, number>();
  for (const link of canonical) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodes: InternalNode[] = data.nodes.map((n) => {
    const d = degree.get(n.id) ?? 0;
    const radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, MIN_RADIUS + Math.sqrt(d) * 2.5));
    return { ...n, degree: d, radius };
  });

  // Spread multi-edges between the same unordered pair along different
  // curvatures so arrows don't overlap.
  const pairCount = new Map<string, number>();
  const links: InternalLink[] = canonical.map((link) => {
    const key = link.source < link.target
      ? `${link.source}|${link.target}`
      : `${link.target}|${link.source}`;
    const index = pairCount.get(key) ?? 0;
    pairCount.set(key, index + 1);
    const curvature = index === 0 ? 0 : 0.12 * ((index + 1) >> 1) * (index % 2 === 0 ? 1 : -1);
    return { ...link, curvature };
  });

  return { nodes, links };
}

function linkEndpointId(end: string | { id?: string } | undefined): string | undefined {
  if (end == null) return undefined;
  if (typeof end === 'string') return end;
  return end.id;
}

export function GraphView({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<InternalNode, InternalLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  const processed = useMemo(() => computeInternalData(data), [data]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of processed.links) {
      if (!map.has(link.source)) map.set(link.source, new Set());
      if (!map.has(link.target)) map.set(link.target, new Set());
      map.get(link.source)!.add(link.target);
      map.get(link.target)!.add(link.source);
    }
    return map;
  }, [processed]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force('charge') as unknown as
      | { strength: (v: number) => unknown }
      | undefined;
    charge?.strength(-700);
    const linkForce = fg.d3Force('link') as unknown as
      | { distance: (v: number) => unknown }
      | undefined;
    linkForce?.distance(130);
  }, [processed]);

  const isDimmed = (nodeId: string): boolean => {
    if (!hoveredId) return false;
    if (nodeId === hoveredId) return false;
    return !adjacency.get(hoveredId)?.has(nodeId);
  };

  const linkIsDimmed = (link: InternalLink): boolean => {
    if (!hoveredId) return false;
    const src = linkEndpointId(link.source as unknown as string | { id?: string });
    const dst = linkEndpointId(link.target as unknown as string | { id?: string });
    return src !== hoveredId && dst !== hoveredId;
  };

  return (
    <div ref={containerRef} className="graph">
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D<InternalNode, InternalLink>
          ref={fgRef}
          graphData={processed}
          width={size.width}
          height={size.height}
          backgroundColor="#0f1419"
          nodeId="id"
          nodeVal={(n) => (n as InternalNode).radius}
          nodeRelSize={1}
          cooldownTicks={200}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          onNodeHover={(node) => setHoveredId(node?.id ?? null)}
          onEngineStop={() => {
            fgRef.current?.zoomToFit(400, 60);
          }}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(rawNode, ctx, globalScale) => {
            const node = rawNode as InternalNode;
            if (node.x === undefined || node.y === undefined) return;
            const dimmed = isDimmed(node.id);
            const alpha = dimmed ? DIM_ALPHA : 1;
            const isHover = hoveredId === node.id;

            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#1f2937';
            ctx.fill();
            ctx.lineWidth = isHover ? 2.5 : 1.5;
            ctx.strokeStyle = isHover ? '#facc15' : '#60a5fa';
            ctx.stroke();

            const showLabel =
              isHover ||
              globalScale >= NODE_LABEL_MIN_SCALE ||
              node.degree >= HUB_DEGREE;

            if (showLabel) {
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const label = node.label;
              const textWidth = ctx.measureText(label).width;
              const padding = 4;

              if (textWidth + padding * 2 <= node.radius * 2) {
                ctx.fillStyle = '#e6e6e6';
                ctx.fillText(label, node.x, node.y);
              } else {
                const labelY = node.y + node.radius + fontSize * 0.8;
                ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
                ctx.fillRect(
                  node.x - textWidth / 2 - padding,
                  labelY - fontSize / 2 - 1,
                  textWidth + padding * 2,
                  fontSize + 2,
                );
                ctx.fillStyle = '#e6e6e6';
                ctx.fillText(label, node.x, labelY);
              }
            }

            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(rawNode, color, ctx) => {
            const node = rawNode as InternalNode;
            if (node.x === undefined || node.y === undefined) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 2, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkColor={(link) => {
            const style = getRelationStyle((link as InternalLink).relation);
            return linkIsDimmed(link as InternalLink)
              ? applyAlpha(style.color, DIM_ALPHA)
              : style.color;
          }}
          linkLineDash={(link) => getRelationStyle((link as InternalLink).relation).dash}
          linkWidth={(link) => getRelationStyle((link as InternalLink).relation).width}
          linkCurvature={(link) => (link as InternalLink).curvature}
          linkDirectionalArrowLength={(link) =>
            getRelationStyle((link as InternalLink).relation).arrowLength
          }
          linkDirectionalArrowRelPos={0.95}
          linkDirectionalArrowColor={(link) =>
            getRelationStyle((link as InternalLink).relation).color
          }
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(rawLink, ctx, globalScale) => {
            if (globalScale < EDGE_LABEL_MIN_SCALE) return;
            const link = rawLink as InternalLink;
            const source = link.source as unknown as { x?: number; y?: number };
            const target = link.target as unknown as { x?: number; y?: number };
            if (
              source?.x === undefined ||
              source?.y === undefined ||
              target?.x === undefined ||
              target?.y === undefined
            ) {
              return;
            }

            const style = getRelationStyle(link.relation);
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const fontSize = 9 / globalScale;
            ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const text = style.label;
            const textWidth = ctx.measureText(text).width;
            const padding = 2;

            ctx.globalAlpha = linkIsDimmed(link) ? DIM_ALPHA : 0.92;
            ctx.fillStyle = 'rgba(15, 20, 25, 0.8)';
            ctx.fillRect(
              midX - textWidth / 2 - padding,
              midY - fontSize / 2 - padding,
              textWidth + padding * 2,
              fontSize + padding * 2,
            );
            ctx.fillStyle = style.color;
            ctx.fillText(text, midX, midY);
            ctx.globalAlpha = 1;
          }}
        />
      )}
    </div>
  );
}

/**
 * Apply an alpha multiplier to a 6-digit hex color. Returns an rgba() string.
 * Falls back to the original color when parsing fails.
 */
function applyAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
