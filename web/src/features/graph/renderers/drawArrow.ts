import type { ArrowKind } from '@/shared/lib/relationStyle';

/**
 * Draw an oriented arrow head at (tipX, tipY). Size scales inversely with
 * `globalScale` so the arrow maintains ~8 screen pixels at any zoom.
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  kind: ArrowKind,
  color: string,
  globalScale: number,
): void {
  if (kind === 'none') return;
  const size = 8 / globalScale;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / globalScale;

  switch (kind) {
    case 'filled-triangle':
    case 'small-arrow':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'open-triangle':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size / 2, -size / 2);
      ctx.lineTo(-size, 0);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}
