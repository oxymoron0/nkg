import type { GraphLink } from '@/shared/domain/types';
import type { GraphIndex } from '@/shared/lib/graphIndex';
import { relationStyle } from '@/shared/lib/relationStyle';

import type { Positioned } from '../types';
import { drawArrow } from './drawArrow';
import { nodeRadius } from './drawNode';
import { controlPoint, pointOnQuadratic } from './geometry';

type DrawLinkOptions = {
  index: GraphIndex;
  visibleRelations: Set<string>;
  curvatureById: Map<string, number>;
  dimAlpha: number;
  isDimmed: (id: string) => boolean;
};

/** Visible canvas render for a single canonical link. */
export function drawLink(
  l: GraphLink,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  opts: DrawLinkOptions,
): void {
  const { index, visibleRelations, curvatureById, dimAlpha, isDimmed } = opts;
  if (!visibleRelations.has(l.relation)) return;

  const source = l.source as Positioned;
  const target = l.target as Positioned;
  if (
    typeof source !== 'object' ||
    typeof target !== 'object' ||
    source.x === undefined ||
    source.y === undefined ||
    target.x === undefined ||
    target.y === undefined
  ) {
    return;
  }

  const style = relationStyle(l.relation);
  const curvature = curvatureById.get(l.id) ?? 0;
  const sourceRadius = nodeRadius(source.id, index);
  const targetRadius = nodeRadius(target.id, index);

  const dimmed = isDimmed(source.id) || isDimmed(target.id);
  ctx.globalAlpha = dimmed ? dimAlpha : 1;

  // Quadratic Bezier with perpendicular control.
  const { cx, cy } = controlPoint(source.x, source.y, target.x, target.y, curvature);

  // Trim endpoints so the line doesn't overlap node circles.
  const angleSourceToTarget = Math.atan2(target.y - source.y, target.x - source.x);
  const startX = source.x + Math.cos(angleSourceToTarget) * sourceRadius;
  const startY = source.y + Math.sin(angleSourceToTarget) * sourceRadius;
  const endX = target.x - Math.cos(angleSourceToTarget) * (targetRadius + 2);
  const endY = target.y - Math.sin(angleSourceToTarget) * (targetRadius + 2);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(cx, cy, endX, endY);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth / globalScale;
  if (style.dash.length > 0) {
    ctx.setLineDash(style.dash.map((d) => d / globalScale));
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head at endX, endY.
  const tip = pointOnQuadratic(startX, startY, cx, cy, endX, endY, 1);
  drawArrow(ctx, tip.x, tip.y, tip.angle, style.arrow, style.color, globalScale);

  // Property box at midpoint (WebVOWL signature). Hide when zoomed out.
  if (globalScale >= 1.2) {
    const mid = pointOnQuadratic(startX, startY, cx, cy, endX, endY, 0.5);
    const fontSize = 10 / globalScale;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const text = l.relation;
    const textWidth = ctx.measureText(text).width;
    const padX = 4 / globalScale;
    const padY = 2 / globalScale;
    const boxW = textWidth + padX * 2;
    const boxH = fontSize + padY * 2;

    ctx.fillStyle = 'rgba(15, 20, 25, 0.92)';
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1 / globalScale;
    const bx = mid.x - boxW / 2;
    const by = mid.y - boxH / 2;
    ctx.beginPath();
    ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e6e6e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mid.x, mid.y);
  }
  ctx.globalAlpha = 1;
}

/** Extra pixels past the node's visible radius that still count as "on the node",
 *  not on the link. Must match the NODE_HIT_PADDING in drawNode.ts. */
const LINK_HIT_TRIM = 8;

/**
 * Invisible hit region used by react-force-graph's pointer picking. The
 * line is trimmed at both endpoints so it does not overlap the node hit
 * circles — otherwise the link's 6-px strip penetrates the node centre
 * and steals clicks from small-degree nodes.
 */
export function paintLinkPointerArea(
  l: GraphLink,
  color: string,
  ctx: CanvasRenderingContext2D,
  index: GraphIndex,
  visibleRelations: Set<string>,
): void {
  if (!visibleRelations.has(l.relation)) return;
  const source = l.source as Positioned;
  const target = l.target as Positioned;
  if (
    typeof source !== 'object' ||
    typeof target !== 'object' ||
    source.x === undefined ||
    source.y === undefined ||
    target.x === undefined ||
    target.y === undefined
  ) {
    return;
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.hypot(dx, dy);
  const sourceRadius = nodeRadius(source.id, index) + LINK_HIT_TRIM;
  const targetRadius = nodeRadius(target.id, index) + LINK_HIT_TRIM;
  // Skip degenerate / too-short links where the trims would meet or cross.
  if (len <= sourceRadius + targetRadius) return;

  const ux = dx / len;
  const uy = dy / len;
  const startX = source.x + ux * sourceRadius;
  const startY = source.y + uy * sourceRadius;
  const endX = target.x - ux * targetRadius;
  const endY = target.y - uy * targetRadius;

  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
}
