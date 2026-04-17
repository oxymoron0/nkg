import { describe, expect, it } from 'vitest';

import type { GraphData, GraphLink, GraphNode } from '@/shared/domain/types';

import { bfsDescendants, buildIndex, CONTAINMENT_RELATIONS } from './graphIndex';

function node(id: string, label = id): GraphNode {
  return { id, label };
}

function link(id: string, source: string, target: string, relation: string): GraphLink {
  return { id, source, target, relation };
}

function mkData(nodes: GraphNode[], links: GraphLink[]): GraphData {
  return {
    nodes,
    links,
    meta: { nodeCount: nodes.length, edgeCount: links.length, relations: [] },
  };
}

describe('buildIndex', () => {
  it('keys every node by id in nodeById', () => {
    const data = mkData([node('a'), node('b', 'Beta')], []);
    const index = buildIndex(data);
    expect(index.nodeById.size).toBe(2);
    expect(index.nodeById.get('a')?.label).toBe('a');
    expect(index.nodeById.get('b')?.label).toBe('Beta');
  });

  it('counts degree on both endpoints of each link', () => {
    const data = mkData(
      [node('a'), node('b'), node('c')],
      [link('l1', 'a', 'b', 'skos:broader'), link('l2', 'a', 'c', 'skos:related')],
    );
    const index = buildIndex(data);
    expect(index.degree.get('a')).toBe(2);
    expect(index.degree.get('b')).toBe(1);
    expect(index.degree.get('c')).toBe(1);
  });

  it('groups outgoing/incoming edges by relation', () => {
    const data = mkData(
      [node('a'), node('b')],
      [link('l1', 'a', 'b', 'skos:broader'), link('l2', 'a', 'b', 'dcterms:hasPart')],
    );
    const index = buildIndex(data);
    expect(index.outgoing.get('a')?.get('skos:broader')?.has('b')).toBe(true);
    expect(index.outgoing.get('a')?.get('dcterms:hasPart')?.has('b')).toBe(true);
    expect(index.incoming.get('b')?.get('skos:broader')?.has('a')).toBe(true);
  });

  it('counts relations in relationCount', () => {
    const data = mkData(
      [node('a'), node('b'), node('c')],
      [
        link('l1', 'a', 'b', 'skos:broader'),
        link('l2', 'a', 'c', 'skos:broader'),
        link('l3', 'b', 'c', 'skos:related'),
      ],
    );
    const index = buildIndex(data);
    expect(index.relationCount.get('skos:broader')).toBe(2);
    expect(index.relationCount.get('skos:related')).toBe(1);
  });

  it('marks node as top-level when it has no outgoing skos:broader parent', () => {
    // a has no broader parent (top-level). b does (not top-level).
    const data = mkData([node('a'), node('b')], [link('l1', 'b', 'a', 'skos:broader')]);
    const index = buildIndex(data);
    expect(index.topLevel.has('a')).toBe(true);
    expect(index.topLevel.has('b')).toBe(false);
  });

  it('treats isolated nodes as top-level', () => {
    const data = mkData([node('solo')], []);
    const index = buildIndex(data);
    expect(index.topLevel.has('solo')).toBe(true);
  });

  it('handles links where source/target are already node refs (post-simulation shape)', () => {
    const data = mkData(
      [node('a'), node('b')],
      [
        {
          id: 'l',
          source: { id: 'a', label: 'A' },
          target: { id: 'b', label: 'B' },
          relation: 'skos:broader',
        },
      ],
    );
    const index = buildIndex(data);
    expect(index.outgoing.get('a')?.get('skos:broader')?.has('b')).toBe(true);
  });
});

describe('bfsDescendants', () => {
  it('returns just the root when no matching edges exist', () => {
    const data = mkData([node('a'), node('b')], []);
    const index = buildIndex(data);
    const result = bfsDescendants(index, 'a', ['skos:narrower']);
    expect(result).toEqual(new Set(['a']));
  });

  it('traverses the given relations in source→target direction', () => {
    // a --narrower--> b --narrower--> c (taxonomy parent descent)
    const data = mkData(
      [node('a'), node('b'), node('c')],
      [link('l1', 'a', 'b', 'skos:narrower'), link('l2', 'b', 'c', 'skos:narrower')],
    );
    const index = buildIndex(data);
    const result = bfsDescendants(index, 'a', ['skos:narrower']);
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('mixes multiple relations in a single BFS (CONTAINMENT_RELATIONS)', () => {
    const data = mkData(
      [node('root'), node('sub1'), node('sub2'), node('part')],
      [
        link('l1', 'root', 'sub1', 'skos:narrower'),
        link('l2', 'sub1', 'sub2', 'skos:narrower'),
        link('l3', 'root', 'part', 'dcterms:hasPart'),
      ],
    );
    const index = buildIndex(data);
    const result = bfsDescendants(index, 'root', CONTAINMENT_RELATIONS);
    expect(result).toEqual(new Set(['root', 'sub1', 'sub2', 'part']));
  });

  it('ignores edges with non-matching relations', () => {
    const data = mkData(
      [node('a'), node('b'), node('c')],
      [link('l1', 'a', 'b', 'skos:narrower'), link('l2', 'a', 'c', 'skos:related')],
    );
    const index = buildIndex(data);
    const result = bfsDescendants(index, 'a', ['skos:narrower']);
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('is safe against cycles', () => {
    const data = mkData(
      [node('a'), node('b')],
      [link('l1', 'a', 'b', 'skos:narrower'), link('l2', 'b', 'a', 'skos:narrower')],
    );
    const index = buildIndex(data);
    const result = bfsDescendants(index, 'a', ['skos:narrower']);
    expect(result).toEqual(new Set(['a', 'b']));
  });
});
