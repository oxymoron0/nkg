import type { GraphLink } from '../api/graph';

/**
 * Directional layout for focused node selection.
 *
 * When a node is selected, its neighbours are arranged in ROWS/COLUMNS
 * by relation type, NOT radially:
 *
 *              child1  child2  child3      ← UP row (taxonomy parents, wholes)
 *                  ─────────────
 *   dep1           [SELECTED]          next1    ← LEFT col / RIGHT col
 *   dep2           ─────────────       next2
 *              part1  part2  part3     ← DOWN row (taxonomy children, parts)
 *
 *          ── OUTER (방향 없음, 거리만 멀게) ──
 *
 * Relation closeness priority (1 = closest):
 *   1. taxonomy  (broader/narrower)  — structural hierarchy
 *   2. part-whole (hasPart/isPartOf) — structural composition
 *   3. sequence  (nextItem/prev)     — ordered adjacency
 *   4. dependency (requires)         — functional dependency
 *   5. reference                     — citation (weak)
 *   6. association (related)         — thematic (weakest)
 */

type Sector = 'up' | 'down' | 'left' | 'right' | 'outer';

type SectorConfig = {
  sector: Sector;
  minGap: number;     // minimum distance from selected on the primary axis
  colSpacing: number;  // spacing between nodes along the secondary axis
  rowSpacing: number;  // spacing between rows/columns if wrapping
  maxPerRow: number;   // nodes per row before wrapping
};

const SECTOR_CONFIGS: Record<Exclude<Sector, 'outer'>, SectorConfig> = {
  up:    { sector: 'up',    minGap: 60,  colSpacing: 55, rowSpacing: 45, maxPerRow: 6 },
  down:  { sector: 'down',  minGap: 60,  colSpacing: 55, rowSpacing: 45, maxPerRow: 6 },
  left:  { sector: 'left',  minGap: 140, colSpacing: 45, rowSpacing: 55, maxPerRow: 4 },
  right: { sector: 'right', minGap: 140, colSpacing: 45, rowSpacing: 55, maxPerRow: 4 },
};

/**
 * Relation → sector mapping based on whether the selected node is
 * source or target of the canonical edge.
 */
const DIRECTION_MAP: Record<string, { asSource: Sector; asTarget: Sector }> = {
  'skos:broader':      { asSource: 'up',    asTarget: 'down' },
  'dcterms:hasPart':   { asSource: 'down',  asTarget: 'up' },
  'dcterms:requires':  { asSource: 'left',  asTarget: 'right' },
  'schema:nextItem':   { asSource: 'right', asTarget: 'left' },
  'dcterms:references': { asSource: 'outer', asTarget: 'outer' },
  'skos:related':      { asSource: 'outer', asTarget: 'outer' },
};

type ForceNode = {
  id?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

type NeighborInfo = {
  nodeId: string;
  sector: Sector;
};

/**
 * Compute the target (x, y) for a node at position `index` within a
 * sector that has `total` nodes, relative to the selected node at (sx, sy).
 */
function sectorTarget(
  sx: number, sy: number,
  sector: Exclude<Sector, 'outer'>,
  index: number, total: number,
): { x: number; y: number } {
  const cfg = SECTOR_CONFIGS[sector];
  const row = Math.floor(index / cfg.maxPerRow);
  const col = index % cfg.maxPerRow;
  const nodesInRow = Math.min(cfg.maxPerRow, total - row * cfg.maxPerRow);

  // Center the row around the selected node's secondary axis.
  const offset = col - (nodesInRow - 1) / 2;

  switch (sector) {
    case 'up':
      return {
        x: sx + offset * cfg.colSpacing,
        y: sy - cfg.minGap - row * cfg.rowSpacing,
      };
    case 'down':
      return {
        x: sx + offset * cfg.colSpacing,
        y: sy + cfg.minGap + row * cfg.rowSpacing,
      };
    case 'left':
      return {
        x: sx - cfg.minGap - row * cfg.rowSpacing,
        y: sy + offset * cfg.colSpacing,
      };
    case 'right':
      return {
        x: sx + cfg.minGap + row * cfg.rowSpacing,
        y: sy + offset * cfg.colSpacing,
      };
  }
}

/**
 * Create a d3-force-compatible directional force with ROW/COLUMN layout.
 */
export function createDirectionalForce(
  selectedId: string,
  links: readonly GraphLink[],
  strength: number = 0.5,
) {
  let forceNodes: ForceNode[] = [];
  let nodeMap = new Map<string, ForceNode>();

  // Pre-compute which sector each neighbour belongs to.
  const neighbors: NeighborInfo[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    const srcId = typeof link.source === 'string' ? link.source : link.source.id;
    const tgtId = typeof link.target === 'string' ? link.target : link.target.id;

    let neighborId: string;
    let isSource: boolean;
    if (srcId === selectedId) { neighborId = tgtId; isSource = true; }
    else if (tgtId === selectedId) { neighborId = srcId; isSource = false; }
    else continue;

    const dirConfig = DIRECTION_MAP[link.relation];
    if (!dirConfig) continue;

    const sector = isSource ? dirConfig.asSource : dirConfig.asTarget;
    if (sector === 'outer') continue;

    // If same node appears in multiple sectors, first (closest) wins.
    if (seen.has(neighborId)) continue;
    seen.add(neighborId);
    neighbors.push({ nodeId: neighborId, sector });
  }

  // Group by sector and assign indices.
  const sectorGroups = new Map<Exclude<Sector, 'outer'>, string[]>();
  for (const n of neighbors) {
    if (n.sector === 'outer') continue;
    const s = n.sector as Exclude<Sector, 'outer'>;
    let group = sectorGroups.get(s);
    if (!group) { group = []; sectorGroups.set(s, group); }
    group.push(n.nodeId);
  }

  // Build a lookup: nodeId → { sector, index, total }
  const targetLookup = new Map<string, {
    sector: Exclude<Sector, 'outer'>;
    index: number;
    total: number;
  }>();
  for (const [sector, ids] of sectorGroups) {
    for (let i = 0; i < ids.length; i++) {
      targetLookup.set(ids[i], { sector, index: i, total: ids.length });
    }
  }

  function force(alpha: number) {
    const selected = nodeMap.get(selectedId);
    if (!selected || selected.x === undefined || selected.y === undefined) return;

    for (const [nodeId, info] of targetLookup) {
      const node = nodeMap.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;

      const target = sectorTarget(
        selected.x, selected.y,
        info.sector, info.index, info.total,
      );

      node.vx! += (target.x - node.x) * strength * alpha;
      node.vy! += (target.y - node.y) * strength * alpha;
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
