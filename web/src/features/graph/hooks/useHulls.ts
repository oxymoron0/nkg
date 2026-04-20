import { useMemo } from 'react';

import {
  bfsDescendants,
  CONTAINMENT_RELATIONS,
  displayLabelFor,
  type GraphIndex,
} from '@/shared/lib/graphIndex';

import type { Hull } from '../types';

/**
 * Compute the set of containment-hull roots and their BFS members.
 *
 * - When a node is selected, show only that node's containment cluster.
 * - Otherwise, show one hull per top-level Is-A root.
 * - Clusters with fewer than 2 members are skipped (no hull from a single point).
 *
 * Hull geometry itself is recomputed each render frame inside `drawHulls`
 * because node positions mutate during the simulation; only the membership
 * plan is memoised here.
 */
export function useHulls(index: GraphIndex, selectedId: string | null): Hull[] {
  return useMemo(() => {
    const roots = selectedId ? [selectedId] : Array.from(index.topLevel);
    const plan: Hull[] = [];
    for (const rootId of roots) {
      const members = bfsDescendants(index, rootId, CONTAINMENT_RELATIONS);
      if (members.size < 2) continue;
      plan.push({ rootId, rootLabel: displayLabelFor(index, rootId), members });
    }
    return plan;
  }, [index, selectedId]);
}
