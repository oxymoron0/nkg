import type { GraphLink } from '../api/graph';

/**
 * Directional layout sectors for focused node selection.
 *
 * When a node is selected, its neighbours are gently pushed toward
 * semantically meaningful directions relative to the selected node:
 *
 *                 ABOVE (상위)
 *                 부모 / 소속 전체
 *                      ↑
 *   LEFT (선행)  ←──── ● ────→  RIGHT (후행)
 *   의존 대상             다음 단계
 *   이전 단계             의존자
 *                      ↓
 *                 BELOW (하위)
 *                 자식 / 구성 부품
 *
 *          ── OUTER (방향 없음, 거리만 멀게) ──
 *               related, references
 *
 * Angles use math convention: 0 = right, π/2 = down, π = left, 3π/2 = up.
 */

type Direction = {
  angle: number;
  distance: number;
};

// UP = 상위 (parents, wholes I belong to)
const UP: Direction = { angle: -Math.PI / 2, distance: 60 };
// DOWN = 하위 (children, parts I contain)
const DOWN: Direction = { angle: Math.PI / 2, distance: 60 };
// LEFT = 선행 (dependencies I need, previous step)
const LEFT: Direction = { angle: Math.PI, distance: 140 };
// RIGHT = 후행 (dependents that need me, next step)
const RIGHT: Direction = { angle: 0, distance: 140 };
// OUTER = 느슨한 연관 (no angular preference, distance only)
const OUTER: Direction | null = null;

/**
 * Relation → direction mapping.
 *
 * Each canonical relation is mapped to a direction based on whether the
 * selected node is the source or target of the edge.
 *
 * Relation closeness priority (1 = closest):
 *   1. taxonomy  (broader/narrower)  — structural hierarchy
 *   2. part-whole (hasPart/isPartOf) — structural composition
 *   3. sequence  (nextItem/prev)     — ordered adjacency
 *   4. dependency (requires)         — functional dependency
 *   5. reference                     — citation (weak)
 *   6. association (related)         — thematic (weakest)
 */
const DIRECTION_MAP: Record<string, { asSource: Direction | null; asTarget: Direction | null }> = {
  // skos:broader: source=child, target=parent
  'skos:broader': { asSource: UP, asTarget: DOWN },
  // dcterms:hasPart: source=whole, target=part
  'dcterms:hasPart': { asSource: DOWN, asTarget: UP },
  // dcterms:requires: source=requirer, target=dependency
  'dcterms:requires': { asSource: LEFT, asTarget: RIGHT },
  // schema:nextItem: source=current, target=next
  'schema:nextItem': { asSource: RIGHT, asTarget: LEFT },
  // No directional preference — distance only
  'dcterms:references': { asSource: OUTER, asTarget: OUTER },
  'skos:related': { asSource: OUTER, asTarget: OUTER },
};

type ForceNode = {
  id?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

/**
 * Create a d3-force-compatible directional force.
 *
 * When active, it pushes each neighbour of `selectedId` toward its
 * designated sector. The force is proportional to alpha, so it blends
 * naturally with charge, link, and position-memory forces.
 *
 * For OUTER relations (related, references), no angular force is applied
 * — the focused link distance (250–280) in the link force config already
 * pushes them far.
 *
 * @param selectedId  The currently focused node
 * @param links       Canonical link list
 * @param strength    How strongly to push toward sector (0.12 recommended)
 */
export function createDirectionalForce(
  selectedId: string,
  links: readonly GraphLink[],
  strength: number = 0.5,
) {
  let forceNodes: ForceNode[] = [];
  let nodeMap = new Map<string, ForceNode>();

  function force(alpha: number) {
    const selected = nodeMap.get(selectedId);
    if (!selected || selected.x === undefined || selected.y === undefined) return;

    for (const link of links) {
      const srcId = typeof link.source === 'string' ? link.source : link.source.id;
      const tgtId = typeof link.target === 'string' ? link.target : link.target.id;

      let neighborId: string;
      let isSource: boolean;
      if (srcId === selectedId) {
        neighborId = tgtId;
        isSource = true;
      } else if (tgtId === selectedId) {
        neighborId = srcId;
        isSource = false;
      } else {
        continue;
      }

      const dirConfig = DIRECTION_MAP[link.relation];
      if (!dirConfig) continue;

      const dir = isSource ? dirConfig.asSource : dirConfig.asTarget;
      if (!dir) continue; // OUTER — no angular force

      const neighbor = nodeMap.get(neighborId);
      if (!neighbor || neighbor.x === undefined || neighbor.y === undefined) continue;

      const desiredX = selected.x + Math.cos(dir.angle) * dir.distance;
      const desiredY = selected.y + Math.sin(dir.angle) * dir.distance;

      neighbor.vx! += (desiredX - neighbor.x) * strength * alpha;
      neighbor.vy! += (desiredY - neighbor.y) * strength * alpha;
    }
  }

  force.initialize = (nodes: ForceNode[]) => {
    forceNodes = nodes;
    nodeMap = new Map();
    for (const n of forceNodes) {
      if (n.id !== undefined) nodeMap.set(String(n.id), n);
    }
  };

  return force;
}
