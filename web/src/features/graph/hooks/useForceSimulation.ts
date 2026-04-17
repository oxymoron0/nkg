import { useCallback, useEffect, useRef } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphLink } from '@/shared/domain/types';

import {
  DEFAULT_LINK,
  FOCUSED_LINK_CONFIG,
  LINK_CONFIG,
  PHASE1_CHARGE,
  PHASE2_CHARGE,
  PHASE2_CHARGE_DIST_MAX,
  POSITION_MEMORY_STRENGTH,
} from '../force/config';
import type { D3Charge, D3Link, Positioned } from '../types';

type Params = {
  fgRef: React.RefObject<ForceGraphMethods | undefined>;
  data: GraphData;
};

type SimulationApi = {
  /** Call on every `onEngineStop` to snapshot homes + flip to Phase 2. */
  handleEngineStop: () => void;
  /** Call on `onNodeDragEnd` so position-memory doesn't pull drags back. */
  handleNodeDragEnd: () => void;
  /** Accessor used by selection effect to read/mutate home snapshots. */
  homePositionsRef: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  /** Accessor used by selection effect to exempt neighbours. */
  exemptFromMemoryRef: React.MutableRefObject<Set<string>>;
  /** Mirror of `selectedId` used inside d3-force link accessors (cache-sensitive). */
  selectedIdRef: React.MutableRefObject<string | null>;
  /** Link distance function (memoised, reads selectedIdRef). */
  linkDistFn: (l: unknown) => number;
  /** Link strength function (memoised, reads selectedIdRef). */
  linkStrFn: (l: unknown) => number;
};

/**
 * Installs the two-phase force simulation onto the ForceGraph2D instance.
 *
 * Phase 1 (initial layout, runs once per `data` change):
 *   charge -800, per-relation link dist/str, no gravity, positionMemory force.
 *
 * Phase 2 (on `handleEngineStop`):
 *   charge -150 + distanceMax 250, homes snapshotted so positionMemory
 *   pulls nodes back to their settled positions (not absolute (0,0)).
 *   First stop additionally runs `zoomToFit` (never resets user zoom afterwards).
 *
 * The returned refs (`homePositionsRef`, `exemptFromMemoryRef`, `selectedIdRef`)
 * and link fns are consumed by `useNodeSelection` and the canvas click
 * handlers in the orchestrator component.
 */
export function useForceSimulation({ fgRef, data }: Params): SimulationApi {
  const homePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const initialFitDone = useRef(false);
  const exemptFromMemoryRef = useRef<Set<string>>(new Set());

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

  // Phase 1 setup — runs on mount and whenever `data` swaps.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force('charge') as unknown as D3Charge | undefined;
    const link = fg.d3Force('link') as unknown as D3Link | undefined;

    charge?.strength(PHASE1_CHARGE);
    link?.distance(linkDistFn);
    link?.strength(linkStrFn);

    fg.d3Force('gravity', null);

    type MemNode = { id?: string; x?: number; y?: number; vx?: number; vy?: number };
    let memNodes: MemNode[] = [];

    function positionMemory(alpha: number) {
      for (const n of memNodes) {
        const nid = String(n.id ?? '');
        // Exempt selected node's neighbours so directional force can move
        // them into their sectors without resistance.
        if (exemptFromMemoryRef.current.has(nid)) continue;
        const home = homePositionsRef.current.get(nid);
        if (!home || n.x === undefined || n.y === undefined) continue;
        n.vx! -= (n.x - home.x) * POSITION_MEMORY_STRENGTH * alpha;
        n.vy! -= (n.y - home.y) * POSITION_MEMORY_STRENGTH * alpha;
      }
    }
    positionMemory.initialize = (nodes: MemNode[]) => {
      memNodes = nodes;
    };

    fg.d3Force('positionMemory', positionMemory as never);
  }, [fgRef, data, linkDistFn, linkStrFn]);

  const handleEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Snapshot homes so position-memory pulls each node back to its own
    // settled location on subsequent drag/reheat cycles.
    homePositionsRef.current.clear();
    for (const node of data.nodes) {
      const n = node as Positioned;
      if (n.x !== undefined && n.y !== undefined) {
        homePositionsRef.current.set(n.id, { x: n.x, y: n.y });
      }
    }
    const charge = fg.d3Force('charge') as unknown as D3Charge | undefined;
    charge?.strength(PHASE2_CHARGE);
    charge?.distanceMax(PHASE2_CHARGE_DIST_MAX);
    if (!initialFitDone.current) {
      initialFitDone.current = true;
      fg.zoomToFit(400, 60);
    }
  }, [fgRef, data]);

  const handleNodeDragEnd = useCallback(() => {
    for (const n of data.nodes) {
      const p = n as Positioned;
      if (p.x !== undefined && p.y !== undefined) {
        homePositionsRef.current.set(p.id, { x: p.x, y: p.y });
      }
    }
  }, [data]);

  return {
    handleEngineStop,
    handleNodeDragEnd,
    homePositionsRef,
    exemptFromMemoryRef,
    selectedIdRef,
    linkDistFn,
    linkStrFn,
  };
}
