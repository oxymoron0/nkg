import { useEffect, useMemo, useState } from 'react';

import { ContextMenu } from '@/features/context-menu';
import { DetailsPanel } from '@/features/details';
import { RelationFilter } from '@/features/filter';
import { GraphView } from '@/features/graph';
import { fetchGraph } from '@/shared/api/graph';
import type { GraphData } from '@/shared/domain/types';
import { buildIndex } from '@/shared/lib/graphIndex';
import { useGraphStore } from '@/stores/graphStore';

export default function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contextMenu = useGraphStore((s) => s.contextMenu);

  useEffect(() => {
    let cancelled = false;
    fetchGraph()
      .then((g) => {
        if (!cancelled) setData(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const index = useMemo(() => (data ? buildIndex(data) : null), [data]);

  return (
    <div className="app">
      <header className="header">
        <h1>NKG — Knowledge Graph</h1>
        {data && (
          <span className="meta">
            {data.meta.nodeCount} nodes · {data.meta.edgeCount} edges
          </span>
        )}
        <span className="spacer" />
        <a className="link" href="/api/v1/docs" target="_blank" rel="noreferrer">
          API docs
        </a>
      </header>
      {data && index && <RelationFilter counts={index.relationCount} />}
      <main className="main">
        {error ? (
          <div className="error">Failed to load graph: {error}</div>
        ) : !data || !index ? (
          <div className="status">Loading graph…</div>
        ) : (
          <>
            <GraphView data={data} index={index} />
            <DetailsPanel graph={data} index={index} />
          </>
        )}
      </main>
      {contextMenu && <ContextMenu />}
    </div>
  );
}
