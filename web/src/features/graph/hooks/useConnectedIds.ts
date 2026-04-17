import { useMemo } from 'react';

import type { GraphLink } from '@/shared/domain/types';

/**
 * Compute the set of IDs adjacent (via visible relations) to the currently
 * hovered node, including the hover target itself. Returns `null` when
 * nothing is hovered — non-null result signals the renderer to dim every
 * node/edge outside the set.
 */
export function useConnectedIds(
  hoverId: string | null,
  links: readonly GraphLink[],
  visibleRelations: Set<string>,
): Set<string> | null {
  return useMemo(() => {
    if (!hoverId) return null;
    const s = new Set<string>([hoverId]);
    for (const link of links) {
      if (!visibleRelations.has(link.relation)) continue;
      const sid = typeof link.source === 'string' ? link.source : link.source.id;
      const tid = typeof link.target === 'string' ? link.target : link.target.id;
      if (sid === hoverId) s.add(tid);
      if (tid === hoverId) s.add(sid);
    }
    return s;
  }, [hoverId, links, visibleRelations]);
}
