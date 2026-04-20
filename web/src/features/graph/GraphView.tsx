import { useCallback, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphLink, GraphNode } from '@/shared/domain/types';
import { useResizeObserver } from '@/shared/hooks/useResizeObserver';
import type { GraphIndex } from '@/shared/lib/graphIndex';
import { useGraphStore } from '@/stores/graphStore';

import { DIM_ALPHA } from './force/config';
import { createDirectionalForce } from './force/directionalForce';
import { useCanonicalEdges } from './hooks/useCanonicalEdges';
import { useConnectedIds } from './hooks/useConnectedIds';
import { useForceSimulation } from './hooks/useForceSimulation';
import { useHulls } from './hooks/useHulls';
import { useNodeSelection } from './hooks/useNodeSelection';
import { drawHulls } from './renderers/drawHulls';
import { drawLink, paintLinkPointerArea } from './renderers/drawLink';
import { drawNode, nodeRadius, paintNodePointerArea } from './renderers/drawNode';
import { pinNode, snapshotHomes, unpinNodeById } from './simulation-helpers';
import type { Positioned } from './types';

type Props = {
  data: GraphData;
  index: GraphIndex;
};

export function GraphView({ data, index }: Props) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const visibleRelations = useGraphStore((s) => s.visibleRelations);
  const setSelectedId = useGraphStore((s) => s.setSelectedId);
  const openContextMenu = useGraphStore((s) => s.openContextMenu);

  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { canonicalData, curvatureById } = useCanonicalEdges(data);

  const {
    handleEngineStop,
    handleNodeDragEnd,
    homePositionsRef,
    exemptFromMemoryRef,
    selectedIdRef,
    linkDistFn,
    linkStrFn,
  } = useForceSimulation({ fgRef, data });

  useNodeSelection({
    fgRef,
    data,
    canonicalLinks: canonicalData.links,
    selectedId,
    selectedIdRef,
    homePositionsRef,
    exemptFromMemoryRef,
    linkDistFn,
    linkStrFn,
  });

  const hulls = useHulls(index, selectedId);
  const connectedIds = useConnectedIds(hoverId, canonicalData.links, visibleRelations);

  const isDimmed = useCallback(
    (id: string) => connectedIds !== null && !connectedIds.has(id),
    [connectedIds],
  );

  const handleNodeClick = useCallback(
    (node: object) => {
      const n = node as Positioned;
      if (selectedIdRef.current) {
        unpinNodeById(data.nodes, selectedIdRef.current);
      }
      pinNode(n);
      setSelectedId(n.id);
      const fg = fgRef.current;
      if (fg) {
        fg.d3Force('directional', createDirectionalForce(n.id, canonicalData.links) as never);
        fg.d3ReheatSimulation();
      }
    },
    [data.nodes, canonicalData.links, setSelectedId, selectedIdRef],
  );

  const clearSelection = useCallback(() => {
    if (selectedIdRef.current) {
      unpinNodeById(data.nodes, selectedIdRef.current);
    }
    setSelectedId(null);
    const fg = fgRef.current;
    if (fg) {
      fg.d3Force('directional', null);
      snapshotHomes(data.nodes, homePositionsRef.current);
    }
  }, [data.nodes, setSelectedId, selectedIdRef, homePositionsRef]);

  // Escape clears the current selection. We deliberately do NOT pass
  // `onBackgroundClick` to ForceGraph2D: that prop flips an internal
  // `state.onBackgroundClick` check that activates an over-eager
  // mouse-drag detector in force-graph — any pointermove between
  // mousedown and mouseup marks the gesture as a drag and drops the
  // click callback, so users had to click ~10 times before onNodeClick
  // fired. See force-graph.js:12540. The DetailsPanel × button and this
  // keyboard shortcut replace the "click empty canvas" UX.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [clearSelection]);

  const handleNodeRightClick = useCallback(
    (node: object, event: MouseEvent) => {
      event.preventDefault();
      const n = node as GraphNode;
      openContextMenu(n, event.clientX, event.clientY);
    },
    [openContextMenu],
  );

  return (
    <div ref={containerRef} className="graph">
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={canonicalData}
          width={size.width}
          height={size.height}
          backgroundColor="#0f1419"
          nodeId="id"
          nodeLabel={(n) => (n as GraphNode).label}
          linkCurvature={(link) => curvatureById.get((link as GraphLink).id) ?? 0}
          cooldownTicks={200}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          nodeVal={(node) => nodeRadius((node as GraphNode).id, index)}
          onRenderFramePre={(ctx, scale) => {
            drawHulls(ctx, scale, { hulls, index, selectedId });
          }}
          onEngineStop={handleEngineStop}
          onNodeDragEnd={handleNodeDragEnd}
          onNodeClick={handleNodeClick}
          onNodeHover={(node) => setHoverId(node ? (node as GraphNode).id : null)}
          onNodeRightClick={handleNodeRightClick}
          nodeCanvasObject={(node, ctx, scale) => {
            drawNode(node as Positioned, ctx, scale, {
              index,
              selectedId,
              hoverId,
              dimAlpha: DIM_ALPHA,
              isDimmed,
            });
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            paintNodePointerArea(node as Positioned, color, ctx, index);
          }}
          linkCanvasObjectMode={() => 'replace'}
          linkCanvasObject={(link, ctx, scale) => {
            drawLink(link as GraphLink, ctx, scale, {
              index,
              visibleRelations,
              curvatureById,
              dimAlpha: DIM_ALPHA,
              isDimmed,
            });
          }}
          linkPointerAreaPaint={(link, color, ctx) => {
            paintLinkPointerArea(link as GraphLink, color, ctx, index, visibleRelations);
          }}
        />
      )}
    </div>
  );
}
