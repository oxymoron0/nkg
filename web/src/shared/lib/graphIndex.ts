import type { GraphData, GraphLink, GraphNode } from '@/shared/domain/types';

// Containment relations are used for hull BFS. We keep `skos:narrower` here
// because it is the natural "parent → child" descent direction in the raw
// backend data (before canonical merge). `dcterms:hasPart` is already in the
// parent → child direction by definition.
export const CONTAINMENT_RELATIONS = ['skos:narrower', 'dcterms:hasPart'] as const;

export type GraphIndex = {
  nodeById: Map<string, GraphNode>;
  degree: Map<string, number>;
  // outgoing[nodeId].get(relation) = set of target node ids (uses raw data,
  // both inverse directions preserved)
  outgoing: Map<string, Map<string, Set<string>>>;
  incoming: Map<string, Map<string, Set<string>>>;
  // top-level = no outgoing skos:broader edge (i.e., no known parent in taxonomy)
  topLevel: Set<string>;
  // per-relation count (raw, both directions)
  relationCount: Map<string, number>;
};

function ensureNestedSet(
  map: Map<string, Map<string, Set<string>>>,
  nodeId: string,
  relation: string,
): Set<string> {
  let byRel = map.get(nodeId);
  if (!byRel) {
    byRel = new Map();
    map.set(nodeId, byRel);
  }
  let set = byRel.get(relation);
  if (!set) {
    set = new Set();
    byRel.set(relation, set);
  }
  return set;
}

function linkEndpointId(endpoint: GraphLink['source']): string {
  if (typeof endpoint === 'string') return endpoint;
  return endpoint.id;
}

export function buildIndex(data: GraphData): GraphIndex {
  const nodeById = new Map<string, GraphNode>();
  for (const node of data.nodes) {
    nodeById.set(node.id, node);
  }

  const degree = new Map<string, number>();
  const outgoing = new Map<string, Map<string, Set<string>>>();
  const incoming = new Map<string, Map<string, Set<string>>>();
  const relationCount = new Map<string, number>();

  for (const link of data.links) {
    const src = linkEndpointId(link.source);
    const tgt = linkEndpointId(link.target);
    ensureNestedSet(outgoing, src, link.relation).add(tgt);
    ensureNestedSet(incoming, tgt, link.relation).add(src);
    degree.set(src, (degree.get(src) ?? 0) + 1);
    degree.set(tgt, (degree.get(tgt) ?? 0) + 1);
    relationCount.set(link.relation, (relationCount.get(link.relation) ?? 0) + 1);
  }

  const topLevel = new Set<string>();
  for (const node of data.nodes) {
    const out = outgoing.get(node.id);
    const hasBroaderParent = out?.get('skos:broader')?.size ?? 0;
    if (hasBroaderParent === 0) {
      topLevel.add(node.id);
    }
  }

  return { nodeById, degree, outgoing, incoming, topLevel, relationCount };
}

export function bfsDescendants(
  index: GraphIndex,
  rootId: string,
  relations: readonly string[],
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [rootId];
  visited.add(rootId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outByRel = index.outgoing.get(current);
    if (!outByRel) continue;
    for (const rel of relations) {
      const targets = outByRel.get(rel);
      if (!targets) continue;
      for (const t of targets) {
        if (!visited.has(t)) {
          visited.add(t);
          queue.push(t);
        }
      }
    }
  }

  return visited;
}
