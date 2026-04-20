import { describe, expect, it } from 'vitest';

import type { GraphNode } from '@/shared/domain/types';

import { buildDisplayLabels } from './displayLabel';

function node(id: string, label: string): GraphNode {
  return { id, label };
}

function nodeById(nodes: readonly GraphNode[]): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

function outgoing(
  entries: ReadonlyArray<[string, string, string]>,
): Map<string, Map<string, Set<string>>> {
  const map = new Map<string, Map<string, Set<string>>>();
  for (const [src, rel, tgt] of entries) {
    let byRel = map.get(src);
    if (!byRel) {
      byRel = new Map();
      map.set(src, byRel);
    }
    let set = byRel.get(rel);
    if (!set) {
      set = new Set();
      byRel.set(rel, set);
    }
    set.add(tgt);
  }
  return map;
}

describe('buildDisplayLabels', () => {
  it('returns empty map when no duplicate labels exist', () => {
    const nodes = [node('a', 'Alpha'), node('b', 'Beta')];
    const result = buildDisplayLabels(nodes, new Map(), nodeById(nodes));
    expect(result.size).toBe(0);
  });

  it('appends skos:broader parent label for each homonym', () => {
    const nodes = [
      node('g1', '그래프'),
      node('g2', '그래프'),
      node('stat', '통계학'),
      node('discrete', '이산수학'),
    ];
    const out = outgoing([
      ['g1', 'skos:broader', 'stat'],
      ['g2', 'skos:broader', 'discrete'],
    ]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('g1')).toBe('그래프 (통계학)');
    expect(result.get('g2')).toBe('그래프 (이산수학)');
    expect(result.has('stat')).toBe(false);
    expect(result.has('discrete')).toBe(false);
  });

  it('falls back to dcterms:isPartOf when skos:broader is absent', () => {
    const nodes = [
      node('a1', 'Module'),
      node('a2', 'Module'),
      node('sys1', 'SystemA'),
      node('sys2', 'SystemB'),
    ];
    const out = outgoing([
      ['a1', 'dcterms:isPartOf', 'sys1'],
      ['a2', 'dcterms:isPartOf', 'sys2'],
    ]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('a1')).toBe('Module (SystemA)');
    expect(result.get('a2')).toBe('Module (SystemB)');
  });

  it('prefers skos:broader over dcterms:isPartOf when both exist', () => {
    const nodes = [
      node('a1', 'X'),
      node('a2', 'X'),
      node('broader', 'BroaderParent'),
      node('whole', 'WholeParent'),
      node('other', 'OtherParent'),
    ];
    const out = outgoing([
      ['a1', 'skos:broader', 'broader'],
      ['a1', 'dcterms:isPartOf', 'whole'],
      ['a2', 'skos:broader', 'other'],
    ]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('a1')).toBe('X (BroaderParent)');
    expect(result.get('a2')).toBe('X (OtherParent)');
  });

  it('skips nodes whose homonym siblings have no parent at all', () => {
    const nodes = [node('a1', 'X'), node('a2', 'X'), node('p', 'Parent')];
    const out = outgoing([['a1', 'skos:broader', 'p']]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('a1')).toBe('X (Parent)');
    expect(result.has('a2')).toBe(false);
  });

  it('picks the alphabetically first parent when a node has multiple parents', () => {
    const nodes = [
      node('a1', 'X'),
      node('a2', 'X'),
      node('zeta', 'Zeta'),
      node('alpha', 'Alpha'),
      node('beta', 'Beta'),
    ];
    const out = outgoing([
      ['a1', 'skos:broader', 'zeta'],
      ['a1', 'skos:broader', 'alpha'],
      ['a1', 'skos:broader', 'beta'],
      ['a2', 'skos:broader', 'zeta'],
    ]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('a1')).toBe('X (Alpha)');
    expect(result.get('a2')).toBe('X (Zeta)');
  });

  it('treats whitespace-differing labels as the same key (trim)', () => {
    const nodes = [node('a1', '그래프'), node('a2', ' 그래프 '), node('p', 'Parent')];
    const out = outgoing([
      ['a1', 'skos:broader', 'p'],
      ['a2', 'skos:broader', 'p'],
    ]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.get('a1')).toBe('그래프 (Parent)');
    expect(result.get('a2')).toBe(' 그래프  (Parent)');
  });

  it('does not emit entries for unique labels even when they have parents', () => {
    const nodes = [node('a', 'Unique'), node('p', 'Parent')];
    const out = outgoing([['a', 'skos:broader', 'p']]);
    const result = buildDisplayLabels(nodes, out, nodeById(nodes));
    expect(result.size).toBe(0);
  });
});
