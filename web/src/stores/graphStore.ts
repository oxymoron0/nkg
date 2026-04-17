import { create } from 'zustand';

import type { GraphNode } from '@/shared/domain/types';
import { ALL_RELATIONS } from '@/shared/lib/relationStyle';

type ContextMenuState = { x: number; y: number; node: GraphNode } | null;

type GraphStore = {
  // --- Cross-cutting UI state ---
  selectedId: string | null;
  visibleRelations: Set<string>;
  contextMenu: ContextMenuState;

  // --- Actions ---
  setSelectedId: (id: string | null) => void;
  setVisibleRelations: (relations: Set<string>) => void;
  openContextMenu: (node: GraphNode, x: number, y: number) => void;
  closeContextMenu: () => void;
};

/**
 * Global UI state for the graph workspace. Graph data itself (nodes, edges,
 * index) is NOT stored here — it lives in App.tsx where its fetch lifecycle
 * belongs. This store only holds selection / filter / context-menu state
 * that multiple features read and mutate.
 *
 * Select one field per hook call to minimise re-renders:
 *   const selectedId = useGraphStore((s) => s.selectedId);
 */
export const useGraphStore = create<GraphStore>((set) => ({
  selectedId: null,
  visibleRelations: new Set(ALL_RELATIONS),
  contextMenu: null,

  setSelectedId: (id) => {
    set({ selectedId: id });
  },
  setVisibleRelations: (relations) => {
    set({ visibleRelations: relations });
  },
  openContextMenu: (node, x, y) => {
    set({ contextMenu: { x, y, node } });
  },
  closeContextMenu: () => {
    set({ contextMenu: null });
  },
}));
