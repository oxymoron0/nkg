import type { GraphNode } from '@/shared/domain/types';

type OutgoingByNode = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;

const PARENT_RELATION_PRIORITY = ['skos:broader', 'dcterms:isPartOf'] as const;

export function buildDisplayLabels(
  nodes: readonly GraphNode[],
  outgoing: OutgoingByNode,
  nodeById: ReadonlyMap<string, GraphNode>,
): Map<string, string> {
  const buckets = new Map<string, string[]>();
  for (const n of nodes) {
    const key = n.label.trim();
    const list = buckets.get(key);
    if (list) list.push(n.id);
    else buckets.set(key, [n.id]);
  }

  const result = new Map<string, string>();
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const parentLabel = findParentLabel(id, outgoing, nodeById);
      if (!parentLabel) continue;
      const node = nodeById.get(id);
      if (!node) continue;
      result.set(id, `${node.label} (${parentLabel})`);
    }
  }
  return result;
}

function findParentLabel(
  id: string,
  outgoing: OutgoingByNode,
  nodeById: ReadonlyMap<string, GraphNode>,
): string | null {
  const out = outgoing.get(id);
  if (!out) return null;
  for (const relation of PARENT_RELATION_PRIORITY) {
    const targets = out.get(relation);
    if (!targets || targets.size === 0) continue;
    const parentLabels: string[] = [];
    for (const targetId of targets) {
      const target = nodeById.get(targetId);
      if (target) parentLabels.push(target.label);
    }
    if (parentLabels.length === 0) continue;
    parentLabels.sort((a, b) => a.localeCompare(b));
    return parentLabels[0];
  }
  return null;
}
