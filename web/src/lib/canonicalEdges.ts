import type { GraphLink } from '../api/graph';

// Inverse relations: map secondary side → canonical side. When the backend
// emits a link in the secondary direction, we flip source/target and rename
// the relation to the canonical form, then dedupe.
const INVERSE: Record<string, string> = {
  'skos:narrower': 'skos:broader',
  'dcterms:isPartOf': 'dcterms:hasPart',
  'dcterms:isRequiredBy': 'dcterms:requires',
  'dcterms:isReferencedBy': 'dcterms:references',
  'schema:previousItem': 'schema:nextItem',
};

/**
 * Merge inverse relation pairs into a single canonical edge per (source,
 * target, relation) triple. `skos:related` is symmetric so its endpoints are
 * normalized to lexical order.
 *
 * The returned links preserve `GraphLink` shape; `id` is regenerated from the
 * canonical triple so React-force-graph can key them stably after rebuild.
 */
export function canonicalEdges(links: readonly GraphLink[]): GraphLink[] {
  const seen = new Map<string, GraphLink>();

  for (const link of links) {
    const canonRel = INVERSE[link.relation];
    let src = link.source;
    let dst = link.target;
    let rel = link.relation;

    if (canonRel !== undefined) {
      rel = canonRel;
      const prevSrc = src;
      src = dst;
      dst = prevSrc;
    }

    if (rel === 'skos:related' && src > dst) {
      const prevSrc = src;
      src = dst;
      dst = prevSrc;
    }

    const key = `${src}|${rel}|${dst}`;
    if (!seen.has(key)) {
      seen.set(key, { id: key, source: src, target: dst, relation: rel });
    }
  }

  return Array.from(seen.values());
}
