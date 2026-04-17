import { useCallback, useEffect, useMemo, useState } from 'react';

import { ContextMenu } from '@/features/context-menu';
import { DetailsPanel } from '@/features/details';
import { RelationFilter } from '@/features/filter';
import { fetchGraph } from '@/shared/api/graph';
import type { GraphData, GraphNode } from '@/shared/domain/types';
import { buildIndex } from '@/shared/lib/graphIndex';
import { ALL_RELATIONS } from '@/shared/lib/relationStyle';

import { GraphView } from './components/GraphView';

type ContextMenuState = {
  x: number;
  y: number;
  node: GraphNode;
} | null;

export default function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleRelations, setVisibleRelations] = useState<Set<string>>(
    () => new Set(ALL_RELATIONS),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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
  const selected = selectedId && index ? (index.nodeById.get(selectedId) ?? null) : null;

  const handleContextMenu = useCallback((node: GraphNode, event: MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
      {data && index && (
        <RelationFilter
          visible={visibleRelations}
          counts={index.relationCount}
          onChange={setVisibleRelations}
        />
      )}
      <main className="main">
        {error ? (
          <div className="error">Failed to load graph: {error}</div>
        ) : !data || !index ? (
          <div className="status">Loading graph…</div>
        ) : (
          <>
            <GraphView
              data={data}
              index={index}
              selectedId={selectedId}
              visibleRelations={visibleRelations}
              onSelect={setSelectedId}
              onNodeRightClick={handleContextMenu}
            />
            <DetailsPanel selected={selected} graph={data} index={index} onSelect={setSelectedId} />
          </>
        )}
      </main>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
