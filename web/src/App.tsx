import { useEffect, useState } from 'react';
import { fetchGraph, type GraphData } from './api/graph';
import { GraphView } from './components/GraphView';

export default function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="app">
      <header className="header">
        <h1>NKG — Knowledge Graph</h1>
        {data && (
          <span className="meta">
            {data.meta.nodeCount} nodes · {data.meta.edgeCount} edges ·{' '}
            {data.meta.relations.length} relations
          </span>
        )}
        <span className="spacer" />
        <a className="link" href="/api/v1/docs" target="_blank" rel="noreferrer">
          API docs
        </a>
      </header>
      {error ? (
        <div className="error">Failed to load graph: {error}</div>
      ) : !data ? (
        <div className="status">Loading graph…</div>
      ) : (
        <GraphView data={data} />
      )}
    </div>
  );
}
