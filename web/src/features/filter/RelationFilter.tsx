import { ALL_RELATIONS, RELATION_CATEGORIES } from '@/shared/lib/relationStyle';

type Props = {
  visible: Set<string>;
  counts: Map<string, number>;
  onChange: (next: Set<string>) => void;
};

export function RelationFilter({ visible, counts, onChange }: Props) {
  const toggleCategory = (relations: string[]) => {
    const next = new Set(visible);
    const allOn = relations.every((r) => next.has(r));
    if (allOn) {
      for (const r of relations) next.delete(r);
    } else {
      for (const r of relations) next.add(r);
    }
    onChange(next);
  };

  const setAll = () => onChange(new Set(ALL_RELATIONS));
  const setNone = () => onChange(new Set());

  return (
    <div className="relation-filter">
      {RELATION_CATEGORIES.map((cat) => {
        const on = cat.relations.every((r) => visible.has(r));
        const partial = !on && cat.relations.some((r) => visible.has(r));
        const total = cat.relations.reduce((sum, r) => sum + (counts.get(r) ?? 0), 0);
        return (
          <button
            key={cat.id}
            type="button"
            className={`relation-chip ${on ? 'on' : partial ? 'partial' : 'off'}`}
            onClick={() => toggleCategory(cat.relations)}
            title={cat.relations.join(', ')}
          >
            <span className="swatch" style={{ backgroundColor: cat.color }} />
            <span className="label">{cat.label}</span>
            <span className="count">{total}</span>
          </button>
        );
      })}
      <div className="relation-filter-spacer" />
      <button type="button" className="relation-chip-action" onClick={setAll}>
        All
      </button>
      <button type="button" className="relation-chip-action" onClick={setNone}>
        None
      </button>
    </div>
  );
}
