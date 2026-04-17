export type ArrowKind = 'filled-triangle' | 'diamond' | 'open-triangle' | 'small-arrow' | 'none';

type RelationStyle = {
  relation: string;
  category: string;
  color: string;
  lineWidth: number;
  dash: number[]; // empty = solid
  arrow: ArrowKind;
};

type RelationCategory = {
  id: string;
  label: string;
  color: string;
  relations: string[];
};

// Palette tuned for a dark background (#0f1419). Tailwind 400/300 shades
// keep arrows and dashed lines visible without blowing out the contrast.
const COLOR = {
  taxonomy: '#60a5fa', // blue-400
  partWhole: '#4ade80', // green-400
  dependency: '#f87171', // red-400
  reference: '#cbd5e1', // slate-300
  association: '#94a3b8', // slate-400
  sequence: '#c084fc', // purple-400
} as const;

export const RELATION_CATEGORIES: RelationCategory[] = [
  {
    id: 'taxonomy',
    label: 'Taxonomy (Is-A)',
    color: COLOR.taxonomy,
    relations: ['skos:broader', 'skos:narrower'],
  },
  {
    id: 'part-whole',
    label: 'Part-Whole',
    color: COLOR.partWhole,
    relations: ['dcterms:hasPart', 'dcterms:isPartOf'],
  },
  {
    id: 'dependency',
    label: 'Dependency',
    color: COLOR.dependency,
    relations: ['dcterms:requires', 'dcterms:isRequiredBy'],
  },
  {
    id: 'reference',
    label: 'Reference',
    color: COLOR.reference,
    relations: ['dcterms:references', 'dcterms:isReferencedBy'],
  },
  {
    id: 'association',
    label: 'Association',
    color: COLOR.association,
    relations: ['skos:related'],
  },
  {
    id: 'sequence',
    label: 'Sequence',
    color: COLOR.sequence,
    relations: ['schema:previousItem', 'schema:nextItem'],
  },
];

const STYLES: Record<string, RelationStyle> = {
  'skos:broader': {
    relation: 'skos:broader',
    category: 'taxonomy',
    color: COLOR.taxonomy,
    lineWidth: 1.8,
    dash: [],
    arrow: 'filled-triangle',
  },
  'skos:narrower': {
    relation: 'skos:narrower',
    category: 'taxonomy',
    color: COLOR.taxonomy,
    lineWidth: 1.8,
    dash: [],
    arrow: 'filled-triangle',
  },
  'dcterms:hasPart': {
    relation: 'dcterms:hasPart',
    category: 'part-whole',
    color: COLOR.partWhole,
    lineWidth: 1.5,
    dash: [],
    arrow: 'diamond',
  },
  'dcterms:isPartOf': {
    relation: 'dcterms:isPartOf',
    category: 'part-whole',
    color: COLOR.partWhole,
    lineWidth: 1.5,
    dash: [],
    arrow: 'diamond',
  },
  'dcterms:requires': {
    relation: 'dcterms:requires',
    category: 'dependency',
    color: COLOR.dependency,
    lineWidth: 1.5,
    dash: [],
    arrow: 'open-triangle',
  },
  'dcterms:isRequiredBy': {
    relation: 'dcterms:isRequiredBy',
    category: 'dependency',
    color: COLOR.dependency,
    lineWidth: 1.5,
    dash: [],
    arrow: 'open-triangle',
  },
  'dcterms:references': {
    relation: 'dcterms:references',
    category: 'reference',
    color: COLOR.reference,
    lineWidth: 1.4,
    dash: [4, 3],
    arrow: 'small-arrow',
  },
  'dcterms:isReferencedBy': {
    relation: 'dcterms:isReferencedBy',
    category: 'reference',
    color: COLOR.reference,
    lineWidth: 1.4,
    dash: [4, 3],
    arrow: 'small-arrow',
  },
  'skos:related': {
    relation: 'skos:related',
    category: 'association',
    color: COLOR.association,
    lineWidth: 1.4,
    dash: [1, 3],
    arrow: 'none',
  },
  'schema:previousItem': {
    relation: 'schema:previousItem',
    category: 'sequence',
    color: COLOR.sequence,
    lineWidth: 1.5,
    dash: [],
    arrow: 'small-arrow',
  },
  'schema:nextItem': {
    relation: 'schema:nextItem',
    category: 'sequence',
    color: COLOR.sequence,
    lineWidth: 1.5,
    dash: [],
    arrow: 'small-arrow',
  },
};

const FALLBACK: RelationStyle = {
  relation: 'unknown',
  category: 'association',
  color: COLOR.association,
  lineWidth: 1,
  dash: [2, 2],
  arrow: 'none',
};

export function relationStyle(name: string): RelationStyle {
  return STYLES[name] ?? FALLBACK;
}

export const ALL_RELATIONS: string[] = RELATION_CATEGORIES.flatMap((c) => c.relations);
