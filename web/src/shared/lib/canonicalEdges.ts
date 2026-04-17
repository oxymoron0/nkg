import type { GraphLink, GraphNode } from '@/shared/domain/types';

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

function endpointId(end: string | GraphNode): string {
  return typeof end === 'string' ? end : end.id;
}

/**
 * Merge inverse relation pairs into a single canonical edge per (source,
 * target, relation) triple. `skos:related` is symmetric so its endpoints are
 * normalized to lexical order.
 *
 * Callers should pass links **before** react-force-graph has mutated
 * source/target into node object references — the function reads id strings
 * regardless, but dedupe relies on stable string keys.
 *
 * The returned links preserve `GraphLink` shape; `id` is regenerated from the
 * canonical triple so React-force-graph can key them stably after rebuild.
 */
export function canonicalEdges(links: readonly GraphLink[]): GraphLink[] {
  const seen = new Map<string, GraphLink>();

  for (const link of links) {
    const canonRel = INVERSE[link.relation];
    let src = endpointId(link.source);
    let dst = endpointId(link.target);
    let rel = link.relation;

    if (canonRel !== undefined) {
      rel = canonRel;
      const prev = src;
      src = dst;
      dst = prev;
    }

    if (rel === 'skos:related' && src > dst) {
      const prev = src;
      src = dst;
      dst = prev;
    }

    const key = `${src}|${rel}|${dst}`;
    if (!seen.has(key)) {
      seen.set(key, { id: key, source: src, target: dst, relation: rel });
    }
  }

  return Array.from(seen.values());
}
