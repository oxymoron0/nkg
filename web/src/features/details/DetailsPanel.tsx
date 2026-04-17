import type { GraphData } from '@/shared/domain/types';
import type { GraphIndex } from '@/shared/lib/graphIndex';
import { RELATION_CATEGORIES, relationStyle } from '@/shared/lib/relationStyle';
import { useGraphStore } from '@/stores/graphStore';

type Props = {
  graph: GraphData;
  index: GraphIndex;
};

export function DetailsPanel({ graph, index }: Props) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const setSelectedId = useGraphStore((s) => s.setSelectedId);
  const selected = selectedId ? (index.nodeById.get(selectedId) ?? null) : null;
  if (!selected) {
    return (
      <aside className="details-panel">
        <div className="details-section">
          <h2>Overview</h2>
          <dl className="details-dl">
            <dt>Nodes</dt>
            <dd>{graph.meta.nodeCount}</dd>
            <dt>Edges</dt>
            <dd>{graph.meta.edgeCount}</dd>
            <dt>Top-level Is-A</dt>
            <dd>{index.topLevel.size}</dd>
          </dl>
        </div>
        <div className="details-section">
          <h2>Relations</h2>
          <ul className="relation-list">
            {RELATION_CATEGORIES.flatMap((cat) =>
              cat.relations.map((rel) => {
                const count = index.relationCount.get(rel) ?? 0;
                if (count === 0) return null;
                const style = relationStyle(rel);
                return (
                  <li key={rel}>
                    <span className="swatch" style={{ backgroundColor: style.color }} />
                    <code>{rel}</code>
                    <span className="count">{count}</span>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
        <div className="details-hint">Click a node to see its relations.</div>
      </aside>
    );
  }

  const outgoingByRel = index.outgoing.get(selected.id);
  const incomingByRel = index.incoming.get(selected.id);
  const degree = index.degree.get(selected.id) ?? 0;
  const shortId = selected.id.slice(0, 8) + '…';

  const renderRelationGroup = (
    direction: 'out' | 'in',
    byRel: Map<string, Set<string>> | undefined,
  ) => {
    if (!byRel || byRel.size === 0) {
      return (
        <div className="details-empty">
          No {direction === 'out' ? 'outgoing' : 'incoming'} relations
        </div>
      );
    }
    const entries = Array.from(byRel.entries()).sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([relation, targetIds]) => {
      const style = relationStyle(relation);
      return (
        <div key={relation} className="relation-group">
          <div className="relation-group-header">
            <span className="swatch" style={{ backgroundColor: style.color }} />
            <code>{relation}</code>
            <span className="count">{targetIds.size}</span>
          </div>
          <ul>
            {Array.from(targetIds).map((id) => {
              const target = index.nodeById.get(id);
              return (
                <li key={id}>
                  <button type="button" className="link-button" onClick={() => setSelectedId(id)}>
                    {target?.label ?? id.slice(0, 8) + '…'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      );
    });
  };

  return (
    <aside className="details-panel">
      <div className="details-section">
        <div className="details-close-row">
          <h2 className="details-title">{selected.label}</h2>
          <button
            type="button"
            className="details-close"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <dl className="details-dl">
          <dt>ID</dt>
          <dd>
            <code>{shortId}</code>
          </dd>
          <dt>Degree</dt>
          <dd>{degree}</dd>
          {index.topLevel.has(selected.id) && (
            <>
              <dt>Top-level</dt>
              <dd>yes</dd>
            </>
          )}
        </dl>
        {selected.summary && <p className="details-summary">{selected.summary}</p>}
      </div>

      <div className="details-section">
        <h3>Outgoing</h3>
        {renderRelationGroup('out', outgoingByRel)}
      </div>

      <div className="details-section">
        <h3>Incoming</h3>
        {renderRelationGroup('in', incomingByRel)}
      </div>
    </aside>
  );
}
