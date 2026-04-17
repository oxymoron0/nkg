import { describe, expect, it } from 'vitest';

import type { GraphLink } from '@/shared/domain/types';

import { canonicalEdges } from './canonicalEdges';

function link(id: string, source: string, target: string, relation: string): GraphLink {
  return { id, source, target, relation };
}

function endpointId(end: GraphLink['source']): string {
  return typeof end === 'string' ? end : end.id;
}

describe('canonicalEdges', () => {
  it('flips skos:narrower into skos:broader with swapped endpoints', () => {
    const result = canonicalEdges([link('l1', 'child', 'parent', 'skos:narrower')]);
    expect(result).toHaveLength(1);
    expect(result[0].relation).toBe('skos:broader');
    expect(result[0].source).toBe('parent');
    expect(result[0].target).toBe('child');
  });

  it('flips dcterms:isPartOf → dcterms:hasPart', () => {
    const result = canonicalEdges([link('l', 'part', 'whole', 'dcterms:isPartOf')]);
    expect(result[0].relation).toBe('dcterms:hasPart');
    expect(result[0].source).toBe('whole');
    expect(result[0].target).toBe('part');
  });

  it('flips dcterms:isRequiredBy → dcterms:requires', () => {
    const result = canonicalEdges([link('l', 'needed', 'depender', 'dcterms:isRequiredBy')]);
    expect(result[0].relation).toBe('dcterms:requires');
    expect(result[0].source).toBe('depender');
    expect(result[0].target).toBe('needed');
  });

  it('flips dcterms:isReferencedBy → dcterms:references', () => {
    const result = canonicalEdges([link('l', 'cited', 'citer', 'dcterms:isReferencedBy')]);
    expect(result[0].relation).toBe('dcterms:references');
    expect(result[0].source).toBe('citer');
    expect(result[0].target).toBe('cited');
  });

  it('flips schema:previousItem → schema:nextItem', () => {
    const result = canonicalEdges([link('l', 'b', 'a', 'schema:previousItem')]);
    expect(result[0].relation).toBe('schema:nextItem');
    expect(result[0].source).toBe('a');
    expect(result[0].target).toBe('b');
  });

  it('deduplicates two halves of the same inverse pair', () => {
    // Backend emits both directions of a taxonomy relation; merge into one.
    const result = canonicalEdges([
      link('l1', 'child', 'parent', 'skos:narrower'),
      link('l2', 'parent', 'child', 'skos:broader'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].relation).toBe('skos:broader');
    expect(result[0].source).toBe('parent');
    expect(result[0].target).toBe('child');
  });

  it('normalizes skos:related endpoints to lexical order (symmetric)', () => {
    const forward = canonicalEdges([link('l', 'beta', 'alpha', 'skos:related')]);
    const reverse = canonicalEdges([link('l', 'alpha', 'beta', 'skos:related')]);
    expect(forward[0].source).toBe('alpha');
    expect(forward[0].target).toBe('beta');
    expect(reverse[0].source).toBe('alpha');
    expect(reverse[0].target).toBe('beta');
  });

  it('dedupes both directions of skos:related into a single canonical edge', () => {
    const result = canonicalEdges([
      link('l1', 'beta', 'alpha', 'skos:related'),
      link('l2', 'alpha', 'beta', 'skos:related'),
    ]);
    expect(result).toHaveLength(1);
  });

  it('leaves a non-inverse relation unchanged', () => {
    const result = canonicalEdges([link('l', 'a', 'b', 'skos:broader')]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('a');
    expect(result[0].target).toBe('b');
    expect(result[0].relation).toBe('skos:broader');
  });

  it('keeps distinct canonical triples separate', () => {
    const result = canonicalEdges([
      link('l1', 'a', 'b', 'skos:broader'),
      link('l2', 'a', 'b', 'dcterms:hasPart'),
      link('l3', 'c', 'd', 'skos:broader'),
    ]);
    expect(result).toHaveLength(3);
    const keys = result.map((l) => `${endpointId(l.source)}|${l.relation}|${endpointId(l.target)}`);
    expect(new Set(keys).size).toBe(3);
  });

  it('rebuilds link ids from the canonical triple for stable keying', () => {
    const result = canonicalEdges([link('original-id', 'x', 'y', 'skos:narrower')]);
    expect(result[0].id).toBe('y|skos:broader|x');
  });

  it('accepts links whose source/target have already been mutated into node objects', () => {
    // react-force-graph replaces string ids with node refs once it runs.
    const result = canonicalEdges([
      {
        id: 'l',
        source: { id: 'a', label: 'A' },
        target: { id: 'b', label: 'B' },
        relation: 'skos:broader',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('a');
    expect(result[0].target).toBe('b');
  });
});
