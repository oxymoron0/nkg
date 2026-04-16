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

  // ── Phase 1: identify 1st-degree neighbours and their sectors ──

  const primaryNeighbors: NeighborInfo[] = [];
  const primarySet = new Set<string>(); // IDs of 1st-degree neighbours

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

    if (primarySet.has(neighborId)) continue;
    primarySet.add(neighborId);
    primaryNeighbors.push({ nodeId: neighborId, sector });
  }

  // Group by sector and assign row/column indices.
  const sectorGroups = new Map<Exclude<Sector, 'outer'>, string[]>();
  for (const n of primaryNeighbors) {
    if (n.sector === 'outer') continue;
    const s = n.sector as Exclude<Sector, 'outer'>;
    let group = sectorGroups.get(s);
    if (!group) { group = []; sectorGroups.set(s, group); }
    group.push(n.nodeId);
  }

  const primaryLookup = new Map<string, {
    sector: Exclude<Sector, 'outer'>;
    index: number;
    total: number;
  }>();
  for (const [sector, ids] of sectorGroups) {
    for (let i = 0; i < ids.length; i++) {
      primaryLookup.set(ids[i], { sector, index: i, total: ids.length });
    }
  }

  // ── Phase 2: identify 2nd-degree neighbours ──
  //
  // For each 1st-degree neighbour B in sector S, find B's own neighbours
  // (C) that are NOT the selected node and NOT themselves 1st-degree.
  // These 2nd-degree nodes get a weak bias toward the OUTER side of S,
  // preventing their edges from crossing through the selected node.

  // Map: secondaryId → sector of its primary parent (for bias direction)
  const secondaryBias = new Map<string, Exclude<Sector, 'outer'>>();
  const SECONDARY_STRENGTH = 0.15; // weaker than primary (0.5)
  const SECONDARY_EXTRA_GAP = 80;  // additional distance beyond primary rows

  for (const link of links) {
    const srcId = typeof link.source === 'string' ? link.source : link.source.id;
    const tgtId = typeof link.target === 'string' ? link.target : link.target.id;

    // Find links where one end is a primary neighbour and the other is not selected/primary.
    let primaryId: string | null = null;
    let secondaryId: string | null = null;

    if (primarySet.has(srcId) && !primarySet.has(tgtId) && tgtId !== selectedId) {
      primaryId = srcId; secondaryId = tgtId;
    } else if (primarySet.has(tgtId) && !primarySet.has(srcId) && srcId !== selectedId) {
      primaryId = tgtId; secondaryId = srcId;
    }

    if (!primaryId || !secondaryId) continue;
    if (secondaryBias.has(secondaryId)) continue; // first primary parent wins

    const parentInfo = primaryLookup.get(primaryId);
    if (parentInfo) {
      secondaryBias.set(secondaryId, parentInfo.sector);
    }
  }

  // ── Force function ──

  function force(alpha: number) {
    const selected = nodeMap.get(selectedId);
    if (!selected || selected.x === undefined || selected.y === undefined) return;

    // 1st-degree: strong pull to grid positions.
    for (const [nodeId, info] of primaryLookup) {
      const node = nodeMap.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;

      const target = sectorTarget(
        selected.x, selected.y,
        info.sector, info.index, info.total,
      );

      node.vx! += (target.x - node.x) * strength * alpha;
      node.vy! += (target.y - node.y) * strength * alpha;
    }

    // 2nd-degree: weak bias toward the outer side of their parent's sector.
    // This prevents edges from crossing through the selected node.
    for (const [nodeId, sector] of secondaryBias) {
      const node = nodeMap.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;

      const cfg = SECTOR_CONFIGS[sector];
      // Push further out in the sector's primary direction.
      const totalRows = Math.ceil(
        (sectorGroups.get(sector)?.length ?? 1) / cfg.maxPerRow,
      );
      const extraDist = cfg.minGap + totalRows * cfg.rowSpacing + SECONDARY_EXTRA_GAP;

      let targetX = selected.x;
      let targetY = selected.y;
      switch (sector) {
        case 'up':    targetY = selected.y - extraDist; break;
        case 'down':  targetY = selected.y + extraDist; break;
        case 'left':  targetX = selected.x - extraDist; break;
        case 'right': targetX = selected.x + extraDist; break;
      }

      node.vx! += (targetX - node.x) * SECONDARY_STRENGTH * alpha;
      node.vy! += (targetY - node.y) * SECONDARY_STRENGTH * alpha;
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
