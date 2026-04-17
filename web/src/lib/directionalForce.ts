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
  minGap: number; // minimum distance from selected on the primary axis
  colSpacing: number; // spacing between nodes along the secondary axis
  rowSpacing: number; // spacing between rows/columns if wrapping
  maxPerRow: number; // nodes per row before wrapping
};

const SECTOR_CONFIGS: Record<Exclude<Sector, 'outer'>, SectorConfig> = {
  up: { sector: 'up', minGap: 60, colSpacing: 55, rowSpacing: 45, maxPerRow: 6 },
  down: { sector: 'down', minGap: 60, colSpacing: 55, rowSpacing: 45, maxPerRow: 6 },
  left: { sector: 'left', minGap: 140, colSpacing: 45, rowSpacing: 55, maxPerRow: 4 },
  right: { sector: 'right', minGap: 140, colSpacing: 45, rowSpacing: 55, maxPerRow: 4 },
};

/**
 * Relation → sector mapping based on whether the selected node is
 * source or target of the canonical edge.
 */
const DIRECTION_MAP: Record<string, { asSource: Sector; asTarget: Sector }> = {
  'skos:broader': { asSource: 'up', asTarget: 'down' },
  'dcterms:hasPart': { asSource: 'down', asTarget: 'up' },
  'dcterms:requires': { asSource: 'left', asTarget: 'right' },
  'schema:nextItem': { asSource: 'right', asTarget: 'left' },
  'dcterms:references': { asSource: 'outer', asTarget: 'outer' },
  'skos:related': { asSource: 'outer', asTarget: 'outer' },
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
/**
 * Compute the target (x, y) for a 2nd-degree node placed around its
 * parent (px, py). Uses smaller distances than sectorTarget so child
 * arrangements don't overlap with parent rows.
 */
function subSectorTarget(
  px: number,
  py: number,
  sector: Exclude<Sector, 'outer'>,
  index: number,
  total: number,
): { x: number; y: number } {
  const SUB_GAP = 50;
  const SUB_COL = 40;
  const SUB_MAX = 4;
  const row = Math.floor(index / SUB_MAX);
  const col = index % SUB_MAX;
  const nodesInRow = Math.min(SUB_MAX, total - row * SUB_MAX);
  const offset = col - (nodesInRow - 1) / 2;

  switch (sector) {
    case 'up':
      return { x: px + offset * SUB_COL, y: py - SUB_GAP - row * SUB_COL };
    case 'down':
      return { x: px + offset * SUB_COL, y: py + SUB_GAP + row * SUB_COL };
    case 'left':
      return { x: px - SUB_GAP - row * SUB_COL, y: py + offset * SUB_COL };
    case 'right':
      return { x: px + SUB_GAP + row * SUB_COL, y: py + offset * SUB_COL };
  }
}

function sectorTarget(
  sx: number,
  sy: number,
  sector: Exclude<Sector, 'outer'>,
  index: number,
  total: number,
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
    if (srcId === selectedId) {
      neighborId = tgtId;
      isSource = true;
    } else if (tgtId === selectedId) {
      neighborId = srcId;
      isSource = false;
    } else continue;

    const dirConfig = DIRECTION_MAP[link.relation];
    if (!dirConfig) continue;

    const sector = isSource ? dirConfig.asSource : dirConfig.asTarget;
    if (sector === 'outer') continue;

    if (primarySet.has(neighborId)) continue;
    primarySet.add(neighborId);
    primaryNeighbors.push({ nodeId: neighborId, sector });
  }

  // Group by sector.
  const sectorGroups = new Map<Exclude<Sector, 'outer'>, string[]>();
  for (const n of primaryNeighbors) {
    if (n.sector === 'outer') continue;
    const s = n.sector;
    let group = sectorGroups.get(s);
    if (!group) {
      group = [];
      sectorGroups.set(s, group);
    }
    group.push(n.nodeId);
  }

  // ── Barycenter ordering ──────────────────────────────────────
  //
  // Sort nodes within each sector by the average position of their
  // connections (excluding the selected node). For UP/DOWN (horizontal
  // rows), sort by average X. For LEFT/RIGHT (vertical columns), sort
  // by average Y. This minimises edge crossings within each row/column.
  //
  // We build a per-node adjacency position average from the current
  // simulation state. The nodeMap is populated in force.initialize(),
  // but at creation time it may be empty — so we build a temporary
  // position map from forceNodes if available, otherwise fall back to
  // insertion order (first render).

  const barycenter = (nodeId: string, axis: 'x' | 'y'): number => {
    let sum = 0;
    let count = 0;
    for (const link of links) {
      const srcId = typeof link.source === 'string' ? link.source : link.source.id;
      const tgtId = typeof link.target === 'string' ? link.target : link.target.id;
      let otherId: string | null = null;
      if (srcId === nodeId) otherId = tgtId;
      else if (tgtId === nodeId) otherId = srcId;
      if (!otherId || otherId === selectedId) continue;
      const other = nodeMap.get(otherId);
      if (!other) continue;
      const val = axis === 'x' ? other.x : other.y;
      if (val !== undefined) {
        sum += val;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  };

  for (const [sector, ids] of sectorGroups) {
    const axis: 'x' | 'y' = sector === 'up' || sector === 'down' ? 'x' : 'y';
    ids.sort((a, b) => barycenter(a, axis) - barycenter(b, axis));
  }

  // Assign row/column indices after sorting.
  const primaryLookup = new Map<
    string,
    {
      sector: Exclude<Sector, 'outer'>;
      index: number;
      total: number;
    }
  >();
  for (const [sector, ids] of sectorGroups) {
    for (let i = 0; i < ids.length; i++) {
      primaryLookup.set(ids[i], { sector, index: i, total: ids.length });
    }
  }

  // ── Phase 2: identify 2nd-degree neighbours ──
  //
  // Each 2nd-degree node C is connected to a 1st-degree parent B. We
  // place C in a SUB-SECTOR around B, mirroring the directional logic
  // but at smaller scale and weaker strength. Sub-sector direction is
  // chosen to:
  //   1. Honour the relation type between B and C (if structural)
  //   2. Continue the parent's primary axis direction (avoid edge crossing)
  //
  // For example: A is selected, B is at A's DOWN sector, B has a
  // taxonomy child C → C goes to B's DOWN sub-sector (continues axis).
  // B has a related D → D goes to OUTER (weak fallback bias).

  type SecondaryInfo = {
    parentId: string;
    parentSector: Exclude<Sector, 'outer'>;
    subSector: Exclude<Sector, 'outer'> | 'outer';
    subRelation: string;
  };
  const secondaryInfo = new Map<string, SecondaryInfo>();
  const SECONDARY_STRENGTH = 0.2;
  const SECONDARY_OUTER_GAP = 80;

  // Helper: derive sub-sector for C around B given relation B↔C and B's
  // own primary sector. We use DIRECTION_MAP to map the B-C relation
  // into a direction relative to B, then return that direction.
  function deriveSubSector(
    relation: string,
    bIsSource: boolean,
    parentSector: Exclude<Sector, 'outer'>,
  ): Exclude<Sector, 'outer'> | 'outer' {
    const dirConfig = DIRECTION_MAP[relation];
    if (!dirConfig) return parentSector; // unknown relation → continue axis
    const dir = bIsSource ? dirConfig.asSource : dirConfig.asTarget;
    return dir; // taxonomy/part-whole/dependency/sequence map to a direction;
    // related/references map to 'outer'
  }

  for (const link of links) {
    const srcId = typeof link.source === 'string' ? link.source : link.source.id;
    const tgtId = typeof link.target === 'string' ? link.target : link.target.id;

    // Find links where one end is a primary neighbour and the other is
    // not selected and not itself 1st-degree.
    let primaryId: string | null = null;
    let secondaryId: string | null = null;
    let bIsSource = false;
    if (primarySet.has(srcId) && !primarySet.has(tgtId) && tgtId !== selectedId) {
      primaryId = srcId;
      secondaryId = tgtId;
      bIsSource = true;
    } else if (primarySet.has(tgtId) && !primarySet.has(srcId) && srcId !== selectedId) {
      primaryId = tgtId;
      secondaryId = srcId;
      bIsSource = false;
    }
    if (!primaryId || !secondaryId) continue;
    if (secondaryInfo.has(secondaryId)) continue; // first parent wins

    const parentInfo = primaryLookup.get(primaryId);
    if (!parentInfo) continue;

    const subSector = deriveSubSector(link.relation, bIsSource, parentInfo.sector);
    secondaryInfo.set(secondaryId, {
      parentId: primaryId,
      parentSector: parentInfo.sector,
      subSector,
      subRelation: link.relation,
    });
  }

  // Group 2nd-degree nodes by parent + sub-sector for barycenter sort.
  const secondaryGroups = new Map<string, string[]>(); // key: "parentId|subSector"
  for (const [nodeId, info] of secondaryInfo) {
    if (info.subSector === 'outer') continue;
    const key = `${info.parentId}|${info.subSector}`;
    let group = secondaryGroups.get(key);
    if (!group) {
      group = [];
      secondaryGroups.set(key, group);
    }
    group.push(nodeId);
  }
  // Sort each group by barycenter (excluding selected and parent).
  const secondaryIndex = new Map<string, { index: number; total: number }>();
  for (const [key, ids] of secondaryGroups) {
    const subSector = key.split('|')[1] as Exclude<Sector, 'outer'>;
    const axis: 'x' | 'y' = subSector === 'up' || subSector === 'down' ? 'x' : 'y';
    ids.sort((a, b) => barycenter(a, axis) - barycenter(b, axis));
    for (let i = 0; i < ids.length; i++) {
      secondaryIndex.set(ids[i], { index: i, total: ids.length });
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

      const target = sectorTarget(selected.x, selected.y, info.sector, info.index, info.total);

      node.vx! += (target.x - node.x) * strength * alpha;
      node.vy! += (target.y - node.y) * strength * alpha;
    }

    // 2nd-degree: place around their parent in a sub-sector, mirroring
    // the directional logic. Strength is weaker than primary so parent's
    // own sector position dominates.
    for (const [nodeId, info] of secondaryInfo) {
      const node = nodeMap.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;
      const parent = nodeMap.get(info.parentId);
      if (!parent || parent.x === undefined || parent.y === undefined) continue;

      let targetX: number;
      let targetY: number;

      if (info.subSector === 'outer') {
        // Outer fallback: push along parent's primary axis, beyond parent.
        const parentCfg = SECTOR_CONFIGS[info.parentSector];
        const totalRows = Math.ceil(
          (sectorGroups.get(info.parentSector)?.length ?? 1) / parentCfg.maxPerRow,
        );
        const extraDist = parentCfg.minGap + totalRows * parentCfg.rowSpacing + SECONDARY_OUTER_GAP;
        targetX = selected.x;
        targetY = selected.y;
        switch (info.parentSector) {
          case 'up':
            targetY = selected.y - extraDist;
            break;
          case 'down':
            targetY = selected.y + extraDist;
            break;
          case 'left':
            targetX = selected.x - extraDist;
            break;
          case 'right':
            targetX = selected.x + extraDist;
            break;
        }
      } else {
        // Sub-sector: position around parent in computed direction with barycenter index.
        const idx = secondaryIndex.get(nodeId) ?? { index: 0, total: 1 };
        const sub = subSectorTarget(parent.x, parent.y, info.subSector, idx.index, idx.total);
        targetX = sub.x;
        targetY = sub.y;
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
