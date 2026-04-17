/**
 * Point on a quadratic Bezier at parameter `t ∈ [0, 1]` plus the tangent
 * angle at that point (for oriented arrow heads).
 */
export function pointOnQuadratic(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  t: number,
): { x: number; y: number; angle: number } {
  const mt = 1 - t;
  const x = mt * mt * sx + 2 * mt * t * cx + t * t * tx;
  const y = mt * mt * sy + 2 * mt * t * cy + t * t * ty;
  const dx = 2 * mt * (cx - sx) + 2 * t * (tx - cx);
  const dy = 2 * mt * (cy - sy) + 2 * t * (ty - cy);
  return { x, y, angle: Math.atan2(dy, dx) };
}

/**
 * Control point for a quadratic Bezier: midpoint of the chord offset
 * perpendicularly by `curvature × chord length`.
 */
export function controlPoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvature: number,
): { cx: number; cy: number } {
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = len * curvature;
  return { cx: mx + nx * offset, cy: my + ny * offset };
}
