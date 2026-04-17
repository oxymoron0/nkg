// Node palette (dark background #0f1419).
export const NODE_COLOR = '#5D6CC1';
export const NODE_TOP_LEVEL_COLOR = '#3A4894';
export const NODE_HOVER_RING = '#9ca3af';
export const NODE_SELECTED_RING = '#fbbf24';
export const LABEL_COLOR = '#e6e6e6';

// Non-connected nodes/edges fade to this alpha on hover.
export const DIM_ALPHA = 0.15;

// Hull overlay palette.
export const HULL_FILL = 'rgba(96, 165, 250, 0.10)';
export const HULL_FILL_SELECTED = 'rgba(96, 165, 250, 0.22)';
export const HULL_STROKE = 'rgba(96, 165, 250, 0.40)';
export const HULL_LABEL_COLOR = 'rgba(147, 197, 253, 0.85)';

// Link distance/strength tables. Relation closeness priority (1 = closest):
//   1. taxonomy   (broader/narrower)          — structural hierarchy
//   2. part-whole (hasPart/isPartOf)          — structural composition
//   3. sequence   (nextItem/previousItem)     — ordered adjacency
//   4. dependency (requires/isRequiredBy)     — logical dependency
//   5. reference  (references/isReferencedBy) — citation, weak
//   6. association (related)                  — thematic, weakest
// "Focused" values apply only to edges connected to the selected node.
export const LINK_CONFIG: Record<string, { dist: number; str: number }> = {
  'skos:broader': { dist: 50, str: 0.8 },
  'dcterms:hasPart': { dist: 50, str: 0.8 },
  'dcterms:requires': { dist: 100, str: 0.4 },
  'schema:nextItem': { dist: 80, str: 0.5 },
  'skos:related': { dist: 200, str: 0.1 },
  'dcterms:references': { dist: 200, str: 0.1 },
};
export const FOCUSED_LINK_CONFIG: Record<string, { dist: number; str: number }> = {
  'skos:broader': { dist: 35, str: 1.0 },
  'dcterms:hasPart': { dist: 35, str: 1.0 },
  'dcterms:requires': { dist: 80, str: 0.5 },
  'schema:nextItem': { dist: 60, str: 0.6 },
  'skos:related': { dist: 280, str: 0.15 },
  'dcterms:references': { dist: 250, str: 0.12 },
};
export const DEFAULT_LINK = { dist: 130, str: 0.3 };

// Phase 1 / Phase 2 simulation parameters.
export const PHASE1_CHARGE = -800;
export const PHASE2_CHARGE = -150;
export const PHASE2_CHARGE_DIST_MAX = 250;
export const POSITION_MEMORY_STRENGTH = 0.08;

// Bezier curvature magnitude for multi-edge pairs. 1st pair straight (0),
// 2nd/3rd ±0.18, etc.
export const CURVATURE_STEP = 0.18;
