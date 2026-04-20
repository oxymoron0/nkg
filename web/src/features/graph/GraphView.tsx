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
  const closeContextMenu = useGraphStore((s) => s.closeContextMenu);

  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Gesture tracking for manual outside-click handling. We do NOT pass
  // `onBackgroundClick` to ForceGraph2D because that prop re-activates
  // force-graph's over-eager mouse-drag detector (any pointermove between
  // mousedown and mouseup drops the click callback). Instead we track
  // pointer events at the document level so one place decides:
  //   1. Was the context menu open at pointerdown? → close it (and swallow
  //      the "clear selection" side effect this gesture).
  //   2. Did the gesture hit a node or link? → handlers set
  //      `objectClickedRef`; pointerup leaves the selection alone.
  //   3. Otherwise: small-delta click on empty graph area → clearSelection.
  const pointerDownStateRef = useRef<{
    x: number;
    y: number;
    button: number;
    closedMenu: boolean;
  } | null>(null);
  const objectClickedRef = useRef(false);

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
      objectClickedRef.current = true;
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

  // No-op handler whose only job is to mark the current gesture as an
  // object click so pointerup does not treat it as a background click.
  // Clicks on edges should NOT clear the node selection.
  const handleLinkClick = useCallback(() => {
    objectClickedRef.current = true;
  }, []);

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

  // Unified document-level pointer + keyboard handler.
  //
  // IMPORTANT: do NOT pass `onBackgroundClick` to ForceGraph2D. That prop
  // flips an internal `state.onBackgroundClick` check which activates an
  // over-eager mouse-drag detector inside force-graph — any pointermove
  // between mousedown and mouseup marks the gesture as a drag and drops
  // every click callback (force-graph.js:12540). Symptom: users had to
  // click ~10 times before onNodeClick fired. The listeners below
  // reproduce "click empty canvas clears selection" and
  // "click outside the context menu closes it" without re-activating
  // that detector.
  useEffect(() => {
    const CLICK_TOLERANCE_PX = 4;

    const inside = (el: EventTarget | null, selector: string): boolean =>
      el instanceof Element && el.closest(selector) !== null;

    const handlePointerDown = (e: PointerEvent) => {
      objectClickedRef.current = false;
      const menuWasOpen = useGraphStore.getState().contextMenu !== null;
      const clickInsideMenu = inside(e.target, '.context-menu');
      let closedMenu = false;
      if (menuWasOpen && !clickInsideMenu) {
        closeContextMenu();
        closedMenu = true;
      }
      pointerDownStateRef.current = {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
        closedMenu,
      };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const start = pointerDownStateRef.current;
      pointerDownStateRef.current = null;
      if (!start || start.button !== 0) return; // only left-button gestures
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > CLICK_TOLERANCE_PX) return; // drag / pan
      if (start.closedMenu) return; // first click only closes the menu
      if (!inside(e.target, '.graph')) return; // click outside canvas

      // force-graph schedules onNodeClick / onLinkClick via rAF, so defer
      // one frame before consulting `objectClickedRef`.
      requestAnimationFrame(() => {
        if (!objectClickedRef.current) clearSelection();
      });
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKey);
    };
  }, [clearSelection, closeContextMenu]);

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
          onLinkClick={handleLinkClick}
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
