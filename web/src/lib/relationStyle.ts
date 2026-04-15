export type RelationStyle = {
  label: string;
  color: string;
  dash: number[];
  width: number;
  arrowLength: number;
};

const DEFAULT_STYLE: RelationStyle = {
  label: 'related',
  color: '#6b7280',
  dash: [2, 4],
  width: 1,
  arrowLength: 0,
};

export const RELATION_STYLES: Record<string, RelationStyle> = {
  'skos:broader': { label: 'broader', color: '#3b82f6', dash: [], width: 2.5, arrowLength: 6 },
  'skos:narrower': { label: 'narrower', color: '#3b82f6', dash: [], width: 2.5, arrowLength: 6 },
  'dcterms:hasPart': { label: 'hasPart', color: '#22c55e', dash: [], width: 2, arrowLength: 5 },
  'dcterms:isPartOf': { label: 'isPartOf', color: '#22c55e', dash: [], width: 2, arrowLength: 5 },
  'dcterms:requires': { label: 'requires', color: '#ef4444', dash: [], width: 2, arrowLength: 5 },
  'dcterms:isRequiredBy': {
    label: 'isRequiredBy',
    color: '#ef4444',
    dash: [],
    width: 2,
    arrowLength: 5,
  },
  'dcterms:references': {
    label: 'references',
    color: '#9ca3af',
    dash: [6, 4],
    width: 1.5,
    arrowLength: 4,
  },
  'dcterms:isReferencedBy': {
    label: 'isReferencedBy',
    color: '#9ca3af',
    dash: [6, 4],
    width: 1.5,
    arrowLength: 4,
  },
  'skos:related': { label: 'related', color: '#9ca3af', dash: [2, 4], width: 1, arrowLength: 0 },
  'schema:previousItem': {
    label: 'previous',
    color: '#a855f7',
    dash: [],
    width: 2,
    arrowLength: 5,
  },
  'schema:nextItem': { label: 'next', color: '#a855f7', dash: [], width: 2, arrowLength: 5 },
};

export function getRelationStyle(relation: string): RelationStyle {
  return RELATION_STYLES[relation] ?? DEFAULT_STYLE;
}
