import { ALL_RELATIONS, RELATION_CATEGORIES } from '@/shared/lib/relationStyle';
import { useGraphStore } from '@/stores/graphStore';

type Props = {
  counts: Map<string, number>;
};

export function RelationFilter({ counts }: Props) {
  const visible = useGraphStore((s) => s.visibleRelations);
  const setVisible = useGraphStore((s) => s.setVisibleRelations);

  const toggleCategory = (relations: string[]) => {
    const next = new Set(visible);
    const allOn = relations.every((r) => next.has(r));
    if (allOn) {
      for (const r of relations) next.delete(r);
    } else {
      for (const r of relations) next.add(r);
    }
    setVisible(next);
  };

  const setAll = () => {
    setVisible(new Set(ALL_RELATIONS));
  };
  const setNone = () => {
    setVisible(new Set());
  };

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
