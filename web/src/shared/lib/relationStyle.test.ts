import { describe, expect, it } from 'vitest';

import { ALL_RELATIONS, RELATION_CATEGORIES, relationStyle } from './relationStyle';

describe('relationStyle', () => {
  it('returns the taxonomy style for skos:broader', () => {
    const s = relationStyle('skos:broader');
    expect(s.category).toBe('taxonomy');
    expect(s.arrow).toBe('filled-triangle');
    expect(s.dash).toEqual([]);
  });

  it('returns the part-whole style with diamond arrow', () => {
    const s = relationStyle('dcterms:hasPart');
    expect(s.category).toBe('part-whole');
    expect(s.arrow).toBe('diamond');
  });

  it('returns the dependency style with open-triangle arrow', () => {
    const s = relationStyle('dcterms:requires');
    expect(s.category).toBe('dependency');
    expect(s.arrow).toBe('open-triangle');
  });

  it('returns the reference style with a dashed line', () => {
    const s = relationStyle('dcterms:references');
    expect(s.category).toBe('reference');
    expect(s.dash.length).toBeGreaterThan(0);
  });

  it('returns the association style with no arrow', () => {
    const s = relationStyle('skos:related');
    expect(s.category).toBe('association');
    expect(s.arrow).toBe('none');
  });

  it('returns the sequence style for schema:nextItem', () => {
    const s = relationStyle('schema:nextItem');
    expect(s.category).toBe('sequence');
  });

  it('falls back to the association category for unknown relations', () => {
    const s = relationStyle('unknown:relation');
    expect(s.category).toBe('association');
    expect(s.arrow).toBe('none');
    // Fallback must be distinguishable visually (dashed, thin).
    expect(s.dash.length).toBeGreaterThan(0);
  });

  it('keeps category colors consistent within a category', () => {
    const broader = relationStyle('skos:broader');
    const narrower = relationStyle('skos:narrower');
    expect(narrower.color).toBe(broader.color);
  });
});

describe('RELATION_CATEGORIES', () => {
  it('has the six documented categories', () => {
    expect(RELATION_CATEGORIES.map((c) => c.id)).toEqual([
      'taxonomy',
      'part-whole',
      'dependency',
      'reference',
      'association',
      'sequence',
    ]);
  });

  it('every listed relation has a matching style entry', () => {
    for (const category of RELATION_CATEGORIES) {
      for (const relation of category.relations) {
        const style = relationStyle(relation);
        expect(style.relation).toBe(relation);
        expect(style.category).toBe(category.id);
      }
    }
  });
});

describe('ALL_RELATIONS', () => {
  it('flattens every category into a single list with no duplicates', () => {
    expect(ALL_RELATIONS.length).toBe(new Set(ALL_RELATIONS).size);
  });

  it('covers every SKOS/DCTERMS/Schema relation declared in RELATION_CATEGORIES', () => {
    const expected = RELATION_CATEGORIES.flatMap((c) => c.relations);
    expect(ALL_RELATIONS).toEqual(expected);
  });
});
