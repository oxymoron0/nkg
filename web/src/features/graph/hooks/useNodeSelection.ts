import { useEffect } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphLink } from '@/shared/domain/types';

import type { D3Link, Positioned } from '../types';

type Params = {
  fgRef: React.RefObject<ForceGraphMethods | undefined>;
  data: GraphData;
  canonicalLinks: GraphLink[];
  selectedId: string | null;
  selectedIdRef: React.MutableRefObject<string | null>;
  homePositionsRef: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  exemptFromMemoryRef: React.MutableRefObject<Set<string>>;
  linkDistFn: (l: unknown) => number;
  linkStrFn: (l: unknown) => number;
};

/**
 * Reacts to selection changes:
 *   1. Mirrors `selectedId` into the ref that d3-force accessors read.
 *   2. Re-registers link distance/strength so cached per-link values are
 *      re-evaluated with focused vs. default parameters.
 *   3. Computes the 1st+2nd-degree neighbour set and exempts them from
 *      position-memory so `directionalForce` can pull them freely into
 *      their sectors.
 *   4. On deselect, snapshots current positions as the new home baseline
 *      so the arrangement is preserved instead of pulled back.
 */
export function useNodeSelection({
  fgRef,
  data,
  canonicalLinks,
  selectedId,
  selectedIdRef,
  homePositionsRef,
  exemptFromMemoryRef,
  linkDistFn,
  linkStrFn,
}: Params): void {
  useEffect(() => {
    selectedIdRef.current = selectedId;
    const fg = fgRef.current;
    if (!fg) return;
    const link = fg.d3Force('link') as unknown as D3Link | undefined;
    link?.distance(linkDistFn);
    link?.strength(linkStrFn);

    if (selectedId !== null) {
      const primary = new Set<string>();
      for (const lnk of canonicalLinks) {
        const srcId = typeof lnk.source === 'string' ? lnk.source : lnk.source.id;
        const tgtId = typeof lnk.target === 'string' ? lnk.target : lnk.target.id;
        if (srcId === selectedId) primary.add(tgtId);
        else if (tgtId === selectedId) primary.add(srcId);
      }
      // 2nd-degree: nodes adjacent to primary but not the selected node.
      const exempt = new Set(primary);
      for (const lnk of canonicalLinks) {
        const srcId = typeof lnk.source === 'string' ? lnk.source : lnk.source.id;
        const tgtId = typeof lnk.target === 'string' ? lnk.target : lnk.target.id;
        if (primary.has(srcId) && !primary.has(tgtId) && tgtId !== selectedId) exempt.add(tgtId);
        if (primary.has(tgtId) && !primary.has(srcId) && srcId !== selectedId) exempt.add(srcId);
      }
      exemptFromMemoryRef.current = exempt;
      fg.d3ReheatSimulation();
    } else {
      exemptFromMemoryRef.current = new Set();
      // Deselect: persist current positions as the new home baseline.
      for (const node of data.nodes) {
        const n = node as Positioned;
        if (n.x !== undefined && n.y !== undefined) {
          homePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      }
    }
  }, [
    fgRef,
    data.nodes,
    canonicalLinks,
    selectedId,
    selectedIdRef,
    homePositionsRef,
    exemptFromMemoryRef,
    linkDistFn,
    linkStrFn,
  ]);
}
