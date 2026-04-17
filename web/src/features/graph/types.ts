import type { GraphNode } from '@/shared/domain/types';

/** GraphNode augmented with live simulation coordinates. */
export type Positioned = GraphNode & { x?: number; y?: number; fx?: number; fy?: number };

/** A containment cluster whose members are drawn under a convex hull overlay. */
export type Hull = {
  rootId: string;
  rootLabel: string;
  members: Set<string>;
};

/** Subset of d3-force charge API the simulation hook uses. */
export type D3Charge = {
  strength: (v: number) => void;
  distanceMax: (v: number) => void;
};

/** Subset of d3-force link API the simulation hook uses. */
export type D3Link = {
  distance: (v: number | ((l: unknown) => number)) => void;
  strength: (v: number | ((l: unknown) => number)) => void;
};
