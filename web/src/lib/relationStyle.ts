export type ArrowKind = 'filled-triangle' | 'diamond' | 'open-triangle' | 'small-arrow' | 'none';

export type RelationStyle = {
  relation: string;
  category: string;
  color: string;
  lineWidth: number;
  dash: number[]; // empty = solid
  arrow: ArrowKind;
};

export type RelationCategory = {
  id: string;
  label: string;
  color: string;
  relations: string[];
};

export const RELATION_CATEGORIES: RelationCategory[] = [
  {
    id: 'taxonomy',
    label: 'Taxonomy (Is-A)',
    color: '#3b82f6',
    relations: ['skos:broader', 'skos:narrower'],
  },
  {
    id: 'part-whole',
    label: 'Part-Whole',
    color: '#22c55e',
    relations: ['dcterms:hasPart', 'dcterms:isPartOf'],
  },
  {
    id: 'dependency',
    label: 'Dependency',
    color: '#ef4444',
    relations: ['dcterms:requires', 'dcterms:isRequiredBy'],
  },
  {
    id: 'reference',
    label: 'Reference',
    color: '#9ca3af',
    relations: ['dcterms:references', 'dcterms:isReferencedBy'],
  },
  {
    id: 'association',
    label: 'Association',
    color: '#6b7280',
    relations: ['skos:related'],
  },
  {
    id: 'sequence',
    label: 'Sequence',
    color: '#a855f7',
    relations: ['schema:previousItem', 'schema:nextItem'],
  },
];

const STYLES: Record<string, RelationStyle> = {
  'skos:broader': {
    relation: 'skos:broader',
    category: 'taxonomy',
    color: '#3b82f6',
    lineWidth: 1.8,
    dash: [],
    arrow: 'filled-triangle',
  },
  'skos:narrower': {
    relation: 'skos:narrower',
    category: 'taxonomy',
    color: '#3b82f6',
    lineWidth: 1.8,
    dash: [],
    arrow: 'filled-triangle',
  },
  'dcterms:hasPart': {
    relation: 'dcterms:hasPart',
    category: 'part-whole',
    color: '#22c55e',
    lineWidth: 1.5,
    dash: [],
    arrow: 'diamond',
  },
  'dcterms:isPartOf': {
    relation: 'dcterms:isPartOf',
    category: 'part-whole',
    color: '#22c55e',
    lineWidth: 1.5,
    dash: [],
    arrow: 'diamond',
  },
  'dcterms:requires': {
    relation: 'dcterms:requires',
    category: 'dependency',
    color: '#ef4444',
    lineWidth: 1.5,
    dash: [],
    arrow: 'open-triangle',
  },
  'dcterms:isRequiredBy': {
    relation: 'dcterms:isRequiredBy',
    category: 'dependency',
    color: '#ef4444',
    lineWidth: 1.5,
    dash: [],
    arrow: 'open-triangle',
  },
  'dcterms:references': {
    relation: 'dcterms:references',
    category: 'reference',
    color: '#9ca3af',
    lineWidth: 1.2,
    dash: [4, 3],
    arrow: 'small-arrow',
  },
  'dcterms:isReferencedBy': {
    relation: 'dcterms:isReferencedBy',
    category: 'reference',
    color: '#9ca3af',
    lineWidth: 1.2,
    dash: [4, 3],
    arrow: 'small-arrow',
  },
  'skos:related': {
    relation: 'skos:related',
    category: 'association',
    color: '#6b7280',
    lineWidth: 1.2,
    dash: [1, 3],
    arrow: 'none',
  },
  'schema:previousItem': {
    relation: 'schema:previousItem',
    category: 'sequence',
    color: '#a855f7',
    lineWidth: 1.5,
    dash: [],
    arrow: 'small-arrow',
  },
  'schema:nextItem': {
    relation: 'schema:nextItem',
    category: 'sequence',
    color: '#a855f7',
    lineWidth: 1.5,
    dash: [],
    arrow: 'small-arrow',
  },
};

const FALLBACK: RelationStyle = {
  relation: 'unknown',
  category: 'association',
  color: '#94a3b8',
  lineWidth: 1,
  dash: [2, 2],
  arrow: 'none',
};

export function relationStyle(name: string): RelationStyle {
  return STYLES[name] ?? FALLBACK;
}

export const ALL_RELATIONS: string[] = RELATION_CATEGORIES.flatMap((c) => c.relations);
