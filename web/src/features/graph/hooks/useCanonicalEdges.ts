import { useMemo } from 'react';

import type { GraphData } from '@/shared/domain/types';
import { canonicalEdges } from '@/shared/lib/canonicalEdges';

import { CURVATURE_STEP } from '../force/config';

/**
 * Memoise the canonical edge list (inverse pairs merged) plus a curvature
 * lookup so overlapping pairs render on distinct Bezier lanes.
 *
 * Curvature rule:
 *   1st concrete edge straight (0), 2nd ±CURVATURE_STEP, 3rd ±2·STEP, …
 *   sign alternates so pairs fan out symmetrically around the chord.
 */
export function useCanonicalEdges(data: GraphData) {
  return useMemo(() => {
    const canon = canonicalEdges(data.links);
    const pairCount = new Map<string, number>();
    const curvature = new Map<string, number>();
    for (const link of canon) {
      const src = typeof link.source === 'string' ? link.source : link.source.id;
      const tgt = typeof link.target === 'string' ? link.target : link.target.id;
      const key = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`;
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);
      const magnitude = CURVATURE_STEP * ((idx + 1) >> 1);
      const sign = idx % 2 === 0 ? 1 : -1;
      const c = idx === 0 ? 0 : magnitude * sign;
      curvature.set(link.id, c);
    }
    return {
      canonicalData: { nodes: data.nodes, links: canon },
      curvatureById: curvature,
    };
  }, [data.nodes, data.links]);
}
