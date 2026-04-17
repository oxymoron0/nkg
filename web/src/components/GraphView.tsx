import { polygonHull } from 'd3-polygon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphLink, GraphNode } from '../api/graph';
import { canonicalEdges } from '../lib/canonicalEdges';
import { createDirectionalForce } from '../lib/directionalForce';
import type { GraphIndex } from '../lib/graphIndex';
import { bfsDescendants, CONTAINMENT_RELATIONS } from '../lib/graphIndex';
import { type ArrowKind, relationStyle } from '../lib/relationStyle';
// We keep the graph topology stable even when the user toggles relation
// filters, so react-force-graph does not re-initialise the simulation and
// nodes never get flung off-screen. Filtering happens at draw time only.

type Props = {
  data: GraphData;
  index: GraphIndex;
  selectedId: string | null;
  visibleRelations: Set<string>;
  onSelect: (id: string | null) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
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

// Link distance/strength tables. Relation closeness priority (1 = closest):
//   1. taxonomy   (broader/narrower)       — structural hierarchy
//   2. part-whole (hasPart/isPartOf)       — structural composition
//   3. sequence   (nextItem/previousItem)  — ordered adjacency
//   4. dependency (requires/isRequiredBy)  — logical dependency
//   5. reference  (references/isReferencedBy) — citation, weak
//   6. association (related)               — thematic, weakest
// "Focused" values apply only to edges connected to the selected node.
const LINK_CONFIG: Record<string, { dist: number; str: number }> = {
  'skos:broader': { dist: 50, str: 0.8 },
  'dcterms:hasPart': { dist: 50, str: 0.8 },
  'dcterms:requires': { dist: 100, str: 0.4 },
  'schema:nextItem': { dist: 80, str: 0.5 },
  'skos:related': { dist: 200, str: 0.1 },
  'dcterms:references': { dist: 200, str: 0.1 },
};
const FOCUSED_LINK_CONFIG: Record<string, { dist: number; str: number }> = {
  'skos:broader': { dist: 35, str: 1.0 },
  'dcterms:hasPart': { dist: 35, str: 1.0 },
  'dcterms:requires': { dist: 80, str: 0.5 },
  'schema:nextItem': { dist: 60, str: 0.6 },
  'skos:related': { dist: 280, str: 0.15 },
  'dcterms:references': { dist: 250, str: 0.12 },
};
const DEFAULT_LINK = { dist: 130, str: 0.3 };

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

export function GraphView({
  data,
  index,
  selectedId,
  visibleRelations,
  onSelect,
  onNodeRightClick,
}: Props) {
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

  // ── Force model ─────────────────────────────────────────────────
  //
  // Phase 1 (initial layout):
  //   charge -800            strong repulsion → no overlaps
  //   link   per-type        taxonomy 50/0.8, dependency 100/0.4,
  //                          association 200/0.1 → natural clusters
  //   center default         keeps center of mass on screen
  //   (no position memory yet — let simulation find good positions)
  //
  // Phase 2 (after onEngineStop):
  //   charge -150 + distMax 250   weak, short-range repulsion only
  //   position memory 0.08        each node pulled to its settled
  //                                position, NOT absolute (0,0)
  //   → drag moves the dragged node + connected neighbours respond
  //     via link force; far nodes stay at their home positions.

  type D3Charge = {
    strength: (v: number) => void;
    distanceMax: (v: number) => void;
  };
  type D3Link = {
    distance: (v: number | ((l: unknown) => number)) => void;
    strength: (v: number | ((l: unknown) => number)) => void;
  };

  const homePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const initialFitDone = useRef(false);
  // IDs of the selected node's direct neighbours — exempt from position
  // memory so directional force can move them freely to their sectors.
  const exemptFromMemory = useRef<Set<string>>(new Set());

  // Link accessors that read selectedIdRef to decide whether a link
  // gets default or focused parameters. d3-force caches the values,
  // so we re-register these functions whenever selection changes.
  const linkDistFn = useCallback((l: unknown): number => {
    const link = l as GraphLink;
    const rel = link.relation;
    const selId = selectedIdRef.current;
    if (selId !== null) {
      const srcId = typeof link.source === 'string' ? link.source : link.source.id;
      const tgtId = typeof link.target === 'string' ? link.target : link.target.id;
      if (srcId === selId || tgtId === selId) {
        return (FOCUSED_LINK_CONFIG[rel] ?? DEFAULT_LINK).dist;
      }
    }
    return (LINK_CONFIG[rel] ?? DEFAULT_LINK).dist;
  }, []);

  const linkStrFn = useCallback((l: unknown): number => {
    const link = l as GraphLink;
    const rel = link.relation;
    const selId = selectedIdRef.current;
    if (selId !== null) {
      const srcId = typeof link.source === 'string' ? link.source : link.source.id;
      const tgtId = typeof link.target === 'string' ? link.target : link.target.id;
      if (srcId === selId || tgtId === selId) {
        return (FOCUSED_LINK_CONFIG[rel] ?? DEFAULT_LINK).str;
      }
    }
    return (LINK_CONFIG[rel] ?? DEFAULT_LINK).str;
  }, []);

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

  // Phase 1 setup: charge, link, position memory.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force('charge') as unknown as D3Charge | undefined;
    const link = fg.d3Force('link') as unknown as D3Link | undefined;

    charge?.strength(-800);
    link?.distance(linkDistFn);
    link?.strength(linkStrFn);

    fg.d3Force('gravity', null);

    type MemNode = { id?: string; x?: number; y?: number; vx?: number; vy?: number };
    let memNodes: MemNode[] = [];
    const MEM_STRENGTH = 0.08;

    function positionMemory(alpha: number) {
      for (const n of memNodes) {
        const nid = String(n.id ?? '');
        // Exempt selected node's neighbours so directional force
        // can move them to their sectors without resistance.
        if (exemptFromMemory.current.has(nid)) continue;
        const home = homePositions.current.get(nid);
        if (!home || n.x === undefined || n.y === undefined) continue;
        n.vx! -= (n.x - home.x) * MEM_STRENGTH * alpha;
        n.vy! -= (n.y - home.y) * MEM_STRENGTH * alpha;
      }
    }
    positionMemory.initialize = (nodes: MemNode[]) => {
      memNodes = nodes;
    };

    fg.d3Force('positionMemory', positionMemory as never);
  }, [data, linkDistFn, linkStrFn]);

  // Re-register link distance/strength when selection changes so that
  // d3-force re-evaluates cached per-link values with focused params.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    const fg = fgRef.current;
    if (!fg) return;
    const link = fg.d3Force('link') as unknown as D3Link | undefined;
    link?.distance(linkDistFn);
    link?.strength(linkStrFn);

    // Compute exempt set: 1st-degree + 2nd-degree neighbours.
    // 2nd-degree also needs exemption so the secondary bias force in
    // directionalForce can move them to the outer side of their sector.
    if (selectedId !== null) {
      const primary = new Set<string>();
      for (const lnk of canonicalData.links) {
        const srcId = typeof lnk.source === 'string' ? lnk.source : lnk.source.id;
        const tgtId = typeof lnk.target === 'string' ? lnk.target : lnk.target.id;
        if (srcId === selectedId) primary.add(tgtId);
        else if (tgtId === selectedId) primary.add(srcId);
      }
      // 2nd-degree: nodes connected to primary but not selected/primary.
      const exempt = new Set(primary);
      for (const lnk of canonicalData.links) {
        const srcId = typeof lnk.source === 'string' ? lnk.source : lnk.source.id;
        const tgtId = typeof lnk.target === 'string' ? lnk.target : lnk.target.id;
        if (primary.has(srcId) && !primary.has(tgtId) && tgtId !== selectedId) exempt.add(tgtId);
        if (primary.has(tgtId) && !primary.has(srcId) && srcId !== selectedId) exempt.add(srcId);
      }
      exemptFromMemory.current = exempt;
      fg.d3ReheatSimulation();
    } else {
      exemptFromMemory.current = new Set();
      // Deselect: save current positions as new home.
      for (const node of data.nodes) {
        const n = node as Positioned;
        if (n.x !== undefined && n.y !== undefined) {
          homePositions.current.set(n.id, { x: n.x, y: n.y });
        }
      }
    }
  }, [selectedId, data.nodes, canonicalData.links, linkDistFn, linkStrFn]);

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
          cooldownTicks={200}
          onRenderFramePre={(ctx, scale) => drawHullOverlay(ctx, scale)}
          nodeVal={(node) => nodeRadius(node as GraphNode, index)}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          onEngineStop={() => {
            const fg = fgRef.current;
            if (!fg) return;
            // Snapshot home positions for position-memory force.
            homePositions.current.clear();
            for (const node of data.nodes) {
              const n = node as Positioned;
              if (n.x !== undefined && n.y !== undefined) {
                homePositions.current.set(n.id, { x: n.x, y: n.y });
              }
            }
            // Phase 2: weaken charge + limit range.
            const charge = fg.d3Force('charge') as unknown as D3Charge | undefined;
            charge?.strength(-150);
            charge?.distanceMax(250);
            // zoomToFit only on first layout — never reset user's zoom.
            if (!initialFitDone.current) {
              initialFitDone.current = true;
              fg.zoomToFit(400, 60);
            }
          }}
          onNodeDragEnd={() => {
            // Update home positions after drag so position-memory
            // doesn't pull nodes back to pre-drag positions.
            for (const n of data.nodes) {
              const p = n as Positioned;
              if (p.x !== undefined && p.y !== undefined) {
                homePositions.current.set(p.id, { x: p.x, y: p.y });
              }
            }
          }}
          onNodeClick={(node) => {
            const n = node as Positioned & { fx?: number; fy?: number };
            // Unpin previously selected node, if any.
            if (selectedIdRef.current) {
              for (const nd of data.nodes) {
                const p = nd as Positioned & { fx?: number; fy?: number };
                if (p.id === selectedIdRef.current) {
                  p.fx = undefined;
                  p.fy = undefined;
                  break;
                }
              }
            }
            // Pin the newly selected node as stable sector reference.
            n.fx = n.x;
            n.fy = n.y;
            onSelect(n.id);
            const fg = fgRef.current;
            if (fg) {
              fg.d3Force('directional', createDirectionalForce(n.id, canonicalData.links) as never);
              fg.d3ReheatSimulation();
            }
          }}
          onBackgroundClick={() => {
            // Unpin the selected node.
            if (selectedIdRef.current) {
              for (const nd of data.nodes) {
                const p = nd as Positioned & { fx?: number; fy?: number };
                if (p.id === selectedIdRef.current) {
                  p.fx = undefined;
                  p.fy = undefined;
                  break;
                }
              }
            }
            onSelect(null);
            const fg = fgRef.current;
            if (fg) {
              fg.d3Force('directional', null);
              // Keep arrangement, update homes.
              for (const n of data.nodes) {
                const p = n as Positioned;
                if (p.x !== undefined && p.y !== undefined) {
                  homePositions.current.set(p.id, { x: p.x, y: p.y });
                }
              }
            }
          }}
          onNodeHover={(node) => setHoverId(node ? (node as GraphNode).id : null)}
          onNodeRightClick={
            onNodeRightClick
              ? (node, event) => onNodeRightClick(node as GraphNode, event)
              : undefined
          }
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
