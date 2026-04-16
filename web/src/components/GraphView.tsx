import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { polygonHull } from 'd3-polygon';
import type { GraphData, GraphLink, GraphNode } from '../api/graph';
import type { GraphIndex } from '../lib/graphIndex';
import { CONTAINMENT_RELATIONS, bfsDescendants } from '../lib/graphIndex';
import { canonicalEdges } from '../lib/canonicalEdges';
import { relationStyle, type ArrowKind } from '../lib/relationStyle';
// We keep the graph topology stable even when the user toggles relation
// filters, so react-force-graph does not re-initialise the simulation and
// nodes never get flung off-screen. Filtering happens at draw time only.

type Props = {
  data: GraphData;
  index: GraphIndex;
  selectedId: string | null;
  visibleRelations: Set<string>;
  onSelect: (id: string | null) => void;
};

type Positioned = GraphNode & { x?: number; y?: number };

type Hull = {
  rootId: string;
  rootLabel: string;
  members: Set<string>;
};

const NODE_COLOR = '#5D6CC1';
const NODE_TOP_LEVEL_COLOR = '#3A4894';
const NODE_HOVER_RING = '#9ca3af';
const NODE_SELECTED_RING = '#fbbf24';
const LABEL_COLOR = '#e6e6e6';
const DIM_ALPHA = 0.15;

const HULL_FILL = 'rgba(96, 165, 250, 0.10)';
const HULL_FILL_SELECTED = 'rgba(96, 165, 250, 0.22)';
const HULL_STROKE = 'rgba(96, 165, 250, 0.40)';
const HULL_LABEL_COLOR = 'rgba(147, 197, 253, 0.85)';

function nodeRadius(node: GraphNode, index: GraphIndex): number {
  const degree = index.degree.get(node.id) ?? 0;
  return 6 + 2 * Math.log(1 + degree);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  kind: ArrowKind,
  color: string,
  globalScale: number,
) {
  if (kind === 'none') return;
  // Scale inversely so the arrow maintains ~8 screen pixels at any zoom.
  const size = 8 / globalScale;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / globalScale;

  switch (kind) {
    case 'filled-triangle':
    case 'small-arrow':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'open-triangle':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size / 2, -size / 2);
      ctx.lineTo(-size, 0);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

function pointOnQuadratic(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  t: number,
): { x: number; y: number; angle: number } {
  const mt = 1 - t;
  const x = mt * mt * sx + 2 * mt * t * cx + t * t * tx;
  const y = mt * mt * sy + 2 * mt * t * cy + t * t * ty;
  // derivative for angle
  const dx = 2 * mt * (cx - sx) + 2 * t * (tx - cx);
  const dy = 2 * mt * (cy - sy) + 2 * t * (ty - cy);
  return { x, y, angle: Math.atan2(dy, dx) };
}

function controlPoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvature: number,
): { cx: number; cy: number } {
  // Perpendicular offset at the midpoint.
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = len * curvature;
  return { cx: mx + nx * offset, cy: my + ny * offset };
}

export function GraphView({ data, index, selectedId, visibleRelations, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);

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

  // After the initial force layout converges, pin every node so that
  // subsequent interactions (click, drag) never displace unrelated nodes.
  // On drag we temporarily unpin the dragged node + its close neighbours
  // so local collision avoidance still works.
  const settledRef = useRef(false);
  const LOCAL_UNPIN_RADIUS = 120; // world units — roughly 1 edge length

  const pinAllNodes = () => {
    for (const node of data.nodes) {
      const n = node as Positioned;
      if (n.x !== undefined) (n as { fx?: number }).fx = n.x;
      if (n.y !== undefined) (n as { fy?: number }).fy = n.y;
    }
  };

  const unpinNear = (center: Positioned) => {
    if (center.x === undefined || center.y === undefined) return;
    for (const node of data.nodes) {
      const n = node as Positioned & { fx?: number; fy?: number };
      if (n.x === undefined || n.y === undefined) continue;
      const dist = Math.hypot(n.x - center.x!, n.y - center.y!);
      if (dist < LOCAL_UNPIN_RADIUS) {
        n.fx = undefined;
        n.fy = undefined;
      }
    }
  };

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Limit charge range as a secondary safety net.
    const charge = fg.d3Force('charge') as unknown as
      | { distanceMax?: (d: number) => void }
      | undefined;
    charge?.distanceMax?.(200);
  }, [data]);

  // Canonical links: merge inverse pairs (skos:broader↔narrower, etc.) into a
  // single direction, then give each concrete canonical link a stable
  // curvature so overlapping pairs render on different lanes.
  const { canonicalData, curvatureById } = useMemo(() => {
    const canon = canonicalEdges(data.links);
    const pairCount = new Map<string, number>();
    const curvature = new Map<string, number>();
    for (const link of canon) {
      const src = typeof link.source === 'string' ? link.source : link.source.id;
      const tgt = typeof link.target === 'string' ? link.target : link.target.id;
      const key = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`;
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);
      // 1st concrete edge straight, 2nd ±0.18, 3rd ±0.35, …
      const magnitude = 0.18 * ((idx + 1) >> 1);
      const sign = idx % 2 === 0 ? 1 : -1;
      const c = idx === 0 ? 0 : magnitude * sign;
      curvature.set(link.id, c);
    }
    return {
      canonicalData: { nodes: data.nodes, links: canon },
      curvatureById: curvature,
    };
  }, [data.nodes, data.links]);

  const linkCurvatureFor = (link: GraphLink): number => {
    return curvatureById.get(link.id) ?? 0;
  };

  // Compute which members/roots need hulls. Actual polygon geometry is
  // recomputed every render frame because node positions change during the
  // force simulation.
  const hullPlan: Hull[] = useMemo(() => {
    const roots = selectedId ? [selectedId] : Array.from(index.topLevel);
    const plan: Hull[] = [];
    for (const rootId of roots) {
      const members = bfsDescendants(index, rootId, CONTAINMENT_RELATIONS);
      if (members.size < 2) continue;
      const root = index.nodeById.get(rootId);
      plan.push({ rootId, rootLabel: root?.label ?? rootId, members });
    }
    return plan;
  }, [index, selectedId]);

  const connectedIds: Set<string> | null = useMemo(() => {
    if (!hoverId) return null;
    const s = new Set<string>([hoverId]);
    for (const link of canonicalData.links) {
      if (!visibleRelations.has(link.relation)) continue;
      const sid = typeof link.source === 'string' ? link.source : link.source.id;
      const tid = typeof link.target === 'string' ? link.target : link.target.id;
      if (sid === hoverId) s.add(tid);
      if (tid === hoverId) s.add(sid);
    }
    return s;
  }, [hoverId, canonicalData.links, visibleRelations]);

  const isNodeDimmed = (id: string) => connectedIds !== null && !connectedIds.has(id);

  const drawHullOverlay = (ctx: CanvasRenderingContext2D, globalScale: number) => {
    for (const hull of hullPlan) {
      const pts: [number, number][] = [];
      for (const memberId of hull.members) {
        const n = index.nodeById.get(memberId) as Positioned | undefined;
        if (!n || n.x === undefined || n.y === undefined) continue;
        pts.push([n.x, n.y]);
      }
      if (pts.length < 2) continue;

      // Pad: push each point outward from its own mean by a scale-aware
      // offset so nodes sit inside the hull.
      const pad = 18 / globalScale;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of pts) {
        cx += x;
        cy += y;
      }
      cx /= pts.length;
      cy /= pts.length;
      const padded: [number, number][] = pts.map(([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return [x + (dx / len) * pad, y + (dy / len) * pad];
      });

      const hullPts = polygonHull(padded);
      if (!hullPts || hullPts.length === 0) continue;

      ctx.beginPath();
      ctx.moveTo(hullPts[0][0], hullPts[0][1]);
      for (let i = 1; i < hullPts.length; i++) {
        ctx.lineTo(hullPts[i][0], hullPts[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = selectedId === hull.rootId ? HULL_FILL_SELECTED : HULL_FILL;
      ctx.fill();
      ctx.strokeStyle = HULL_STROKE;
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();

      // Label near top-most vertex.
      let top = hullPts[0];
      for (const p of hullPts) {
        if (p[1] < top[1]) top = p;
      }
      const fontSize = 11 / globalScale;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = HULL_LABEL_COLOR;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(hull.rootLabel, top[0] + 4 / globalScale, top[1] - 4 / globalScale);
    }
  };

  return (
    <div ref={containerRef} className="graph">
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={canonicalData}
          width={size.width}
          height={size.height}
          backgroundColor="#0f1419"
          nodeId="id"
          nodeLabel={(n) => (n as GraphNode).label}
          linkCurvature={(link) => linkCurvatureFor(link as GraphLink)}
          cooldownTicks={120}
          onRenderFramePre={(ctx, scale) => drawHullOverlay(ctx, scale)}
          onEngineStop={() => {
            if (!settledRef.current) {
              settledRef.current = true;
              pinAllNodes();
            }
          }}
          onNodeDrag={(node) => {
            const n = node as Positioned;
            unpinNear(n);
          }}
          onNodeDragEnd={(node) => {
            const n = node as Positioned & { fx?: number; fy?: number };
            n.fx = n.x;
            n.fy = n.y;
            pinAllNodes();
          }}
          onNodeClick={(node) => onSelect((node as GraphNode).id)}
          onBackgroundClick={() => onSelect(null)}
          onNodeHover={(node) => setHoverId(node ? (node as GraphNode).id : null)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as Positioned;
            if (n.x === undefined || n.y === undefined) return;
            const radius = nodeRadius(n, index);
            const isTopLevel = index.topLevel.has(n.id);
            const isSelected = n.id === selectedId;
            const dimmed = isNodeDimmed(n.id);

            ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isTopLevel ? NODE_TOP_LEVEL_COLOR : NODE_COLOR;
            ctx.fill();

            if (isSelected) {
              ctx.lineWidth = 2.4 / globalScale;
              ctx.strokeStyle = NODE_SELECTED_RING;
              ctx.stroke();
            } else if (isTopLevel) {
              ctx.lineWidth = 1.2 / globalScale;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
            } else if (hoverId === n.id) {
              ctx.lineWidth = 1.5 / globalScale;
              ctx.strokeStyle = NODE_HOVER_RING;
              ctx.stroke();
            }

            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px system-ui, sans-serif`;
            ctx.fillStyle = LABEL_COLOR;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(n.label, n.x, n.y + radius + 2 / globalScale);
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as Positioned;
            if (n.x === undefined || n.y === undefined) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, nodeRadius(n, index) + 2, 0, Math.PI * 2);
            ctx.fill();
          }}
          linkCanvasObjectMode={() => 'replace'}
          linkCanvasObject={(link, ctx, globalScale) => {
            const l = link as GraphLink;
            if (!visibleRelations.has(l.relation)) return;
            const source = l.source as Positioned;
            const target = l.target as Positioned;
            if (
              typeof source !== 'object' ||
              typeof target !== 'object' ||
              source.x === undefined ||
              source.y === undefined ||
              target.x === undefined ||
              target.y === undefined
            ) {
              return;
            }

            const style = relationStyle(l.relation);
            const curvature = linkCurvatureFor(l);
            const sourceRadius = nodeRadius(source, index);
            const targetRadius = nodeRadius(target, index);

            const sourceDimmed = isNodeDimmed(source.id);
            const targetDimmed = isNodeDimmed(target.id);
            const dimmed = sourceDimmed || targetDimmed;
            ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;

            // Compute curved geometry. Quadratic Bezier with perpendicular control.
            const { cx, cy } = controlPoint(source.x, source.y, target.x, target.y, curvature);

            // Trim endpoints so the line doesn't overlap the node circles.
            const angleSourceToTarget = Math.atan2(target.y - source.y, target.x - source.x);
            const startX = source.x + Math.cos(angleSourceToTarget) * sourceRadius;
            const startY = source.y + Math.sin(angleSourceToTarget) * sourceRadius;
            const endX = target.x - Math.cos(angleSourceToTarget) * (targetRadius + 2);
            const endY = target.y - Math.sin(angleSourceToTarget) * (targetRadius + 2);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(cx, cy, endX, endY);
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.lineWidth / globalScale;
            if (style.dash.length > 0) {
              ctx.setLineDash(style.dash.map((d) => d / globalScale));
            } else {
              ctx.setLineDash([]);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Arrow head at endX, endY.
            const tip = pointOnQuadratic(startX, startY, cx, cy, endX, endY, 1);
            drawArrow(ctx, tip.x, tip.y, tip.angle, style.arrow, style.color, globalScale);

            // Property box at midpoint (WebVOWL signature). Hide when zoomed out.
            if (globalScale >= 1.2) {
              const mid = pointOnQuadratic(startX, startY, cx, cy, endX, endY, 0.5);
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              const text = l.relation;
              const textWidth = ctx.measureText(text).width;
              const padX = 4 / globalScale;
              const padY = 2 / globalScale;
              const boxW = textWidth + padX * 2;
              const boxH = fontSize + padY * 2;

              ctx.fillStyle = 'rgba(15, 20, 25, 0.92)';
              ctx.strokeStyle = style.color;
              ctx.lineWidth = 1 / globalScale;
              const bx = mid.x - boxW / 2;
              const by = mid.y - boxH / 2;
              ctx.beginPath();
              ctx.rect(bx, by, boxW, boxH);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#e6e6e6';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(text, mid.x, mid.y);
            }
            ctx.globalAlpha = 1;
          }}
          linkPointerAreaPaint={(link, color, ctx) => {
            const l = link as GraphLink;
            if (!visibleRelations.has(l.relation)) return;
            const source = l.source as Positioned;
            const target = l.target as Positioned;
            if (
              typeof source !== 'object' ||
              typeof target !== 'object' ||
              source.x === undefined ||
              source.y === undefined ||
              target.x === undefined ||
              target.y === undefined
            ) {
              return;
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
          }}
        />
      )}
    </div>
  );
}
