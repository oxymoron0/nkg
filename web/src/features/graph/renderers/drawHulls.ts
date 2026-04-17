import { polygonHull } from 'd3-polygon';

import type { GraphIndex } from '@/shared/lib/graphIndex';

import { HULL_FILL, HULL_FILL_SELECTED, HULL_LABEL_COLOR, HULL_STROKE } from '../force/config';
import type { Hull, Positioned } from '../types';

type DrawHullsOptions = {
  hulls: Hull[];
  index: GraphIndex;
  selectedId: string | null;
};

/**
 * Convex-hull overlay around each containment root's BFS descendants. Runs
 * every render frame because node positions change during the simulation.
 */
export function drawHulls(
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  opts: DrawHullsOptions,
): void {
  const { hulls, index, selectedId } = opts;

  for (const hull of hulls) {
    const pts: [number, number][] = [];
    for (const memberId of hull.members) {
      const n = index.nodeById.get(memberId) as Positioned | undefined;
      if (!n || n.x === undefined || n.y === undefined) continue;
      pts.push([n.x, n.y]);
    }
    if (pts.length < 2) continue;

    // Pad each point outward from the cluster centroid so node glyphs sit
    // inside the filled area. Offset is scale-aware.
    const pad = 18 / globalScale;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of pts) {
      cx += x;
      cy += y;
    }
    cx /= pts.length;
    cy /= pts.length;
    const padded: [number, number][] = pts.map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * pad, y + (dy / len) * pad];
    });

    const hullPts = polygonHull(padded);
    if (!hullPts || hullPts.length === 0) continue;

    ctx.beginPath();
    ctx.moveTo(hullPts[0][0], hullPts[0][1]);
    for (let i = 1; i < hullPts.length; i++) {
      ctx.lineTo(hullPts[i][0], hullPts[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = selectedId === hull.rootId ? HULL_FILL_SELECTED : HULL_FILL;
    ctx.fill();
    ctx.strokeStyle = HULL_STROKE;
    ctx.lineWidth = 1.2 / globalScale;
    ctx.stroke();

    // Label near the top-most vertex of the hull polygon.
    let top = hullPts[0];
    for (const p of hullPts) {
      if (p[1] < top[1]) top = p;
    }
    const fontSize = 11 / globalScale;
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = HULL_LABEL_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(hull.rootLabel, top[0] + 4 / globalScale, top[1] - 4 / globalScale);
  }
}
