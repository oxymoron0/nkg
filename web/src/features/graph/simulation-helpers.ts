import type { GraphNode } from '@/shared/domain/types';

import type { Positioned } from './types';

/**
 * Pin/unpin helpers. react-force-graph maintains live `fx`/`fy` fields on the
 * node objects it receives, and the simulation treats those as stable anchors
 * (unset = free). Because d3-force mutates the same object identities, these
 * writes must go through the actual node in `data.nodes`, not a copy.
 *
 * These helpers live outside the component so React's hook-immutability lint
 * doesn't flag the intentional in-place writes — this is a deliberate FFI,
 * not accidental prop mutation.
 */

/** Clear fx/fy on the node whose id matches, if any. */
export function unpinNodeById(nodes: readonly GraphNode[], id: string): void {
  for (const nd of nodes) {
    const p = nd as Positioned;
    if (p.id === id) {
      p.fx = undefined;
      p.fy = undefined;
      return;
    }
  }
}

/** Set fx/fy to the node's current position so d3-force pins it in place. */
export function pinNode(node: Positioned): void {
  node.fx = node.x;
  node.fy = node.y;
}

/** Snapshot every positioned node's coordinates into the home positions map. */
export function snapshotHomes(
  nodes: readonly GraphNode[],
  homes: Map<string, { x: number; y: number }>,
): void {
  for (const n of nodes) {
    const p = n as Positioned;
    if (p.x !== undefined && p.y !== undefined) {
      homes.set(p.id, { x: p.x, y: p.y });
    }
  }
}
