import { displayLabelFor, type GraphIndex } from '@/shared/lib/graphIndex';

import {
  LABEL_COLOR,
  NODE_COLOR,
  NODE_HOVER_RING,
  NODE_SELECTED_RING,
  NODE_TOP_LEVEL_COLOR,
} from '../force/config';
import type { Positioned } from '../types';

/** Node radius in simulation units: degree-scaled log curve. */
export function nodeRadius(id: string, index: GraphIndex): number {
  const degree = index.degree.get(id) ?? 0;
  return 6 + 2 * Math.log(1 + degree);
}

type DrawNodeOptions = {
  index: GraphIndex;
  selectedId: string | null;
  hoverId: string | null;
  dimAlpha: number;
  isDimmed: (id: string) => boolean;
};

export function drawNode(
  n: Positioned,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  opts: DrawNodeOptions,
): void {
  if (n.x === undefined || n.y === undefined) return;
  const { index, selectedId, hoverId, dimAlpha, isDimmed } = opts;

  const radius = nodeRadius(n.id, index);
  const isTopLevel = index.topLevel.has(n.id);
  const isSelected = n.id === selectedId;
  const dimmed = isDimmed(n.id);

  ctx.globalAlpha = dimmed ? dimAlpha : 1;
  ctx.beginPath();
  ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = isTopLevel ? NODE_TOP_LEVEL_COLOR : NODE_COLOR;
  ctx.fill();

  if (isSelected) {
    ctx.lineWidth = 2.4 / globalScale;
    ctx.strokeStyle = NODE_SELECTED_RING;
    ctx.stroke();
  } else if (isTopLevel) {
    ctx.lineWidth = 1.2 / globalScale;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } else if (hoverId === n.id) {
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = NODE_HOVER_RING;
    ctx.stroke();
  }

  const fontSize = 12 / globalScale;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = LABEL_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(displayLabelFor(index, n.id), n.x, n.y + radius + 2 / globalScale);
  ctx.globalAlpha = 1;
}

/** Extra pixels added to the node's visible radius to widen the hit target. */
const NODE_HIT_PADDING = 8;

export function paintNodePointerArea(
  n: Positioned,
  color: string,
  ctx: CanvasRenderingContext2D,
  index: GraphIndex,
): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  // Generous padding so small-degree nodes (radius 6) are not lost in the
  // noise of crossing link hit-strips. Paired with the trimmed link hit
  // line in drawLink.ts so the two regions don't overlap near the node.
  ctx.arc(n.x, n.y, nodeRadius(n.id, index) + NODE_HIT_PADDING, 0, Math.PI * 2);
  ctx.fill();
}
