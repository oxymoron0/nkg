import { describe, expect, it } from 'vitest';

import { controlPoint, pointOnQuadratic } from './geometry';

const EPS = 1e-9;

describe('pointOnQuadratic', () => {
  it('returns the start point when t = 0', () => {
    const p = pointOnQuadratic(1, 2, 3, 4, 5, 6, 0);
    expect(p.x).toBe(1);
    expect(p.y).toBe(2);
  });

  it('returns the end point when t = 1', () => {
    const p = pointOnQuadratic(1, 2, 3, 4, 5, 6, 1);
    expect(p.x).toBe(5);
    expect(p.y).toBe(6);
  });

  it('returns the midpoint on a straight (degenerate) Bezier when t = 0.5', () => {
    // When the control point sits on the chord midpoint, all t yield the
    // straight-line interpolation.
    const p = pointOnQuadratic(0, 0, 5, 0, 10, 0, 0.5);
    expect(p.x).toBeCloseTo(5, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });

  it('returns the algebraic midpoint for a general quadratic at t = 0.5', () => {
    // Formula at t=0.5: x = 0.25·s + 0.5·c + 0.25·e
    // (0, 0) start, (5, 10) control, (10, 0) end → x=5, y=5
    const p = pointOnQuadratic(0, 0, 5, 10, 10, 0, 0.5);
    expect(p.x).toBeCloseTo(5, 10);
    expect(p.y).toBeCloseTo(5, 10);
  });

  it('tangent angle is horizontal for a collinear horizontal Bezier', () => {
    const p = pointOnQuadratic(0, 0, 5, 0, 10, 0, 0.5);
    expect(Math.abs(p.angle)).toBeLessThan(EPS);
  });

  it('tangent angle is vertical (π/2) for a collinear vertical Bezier', () => {
    const p = pointOnQuadratic(0, 0, 0, 5, 0, 10, 0.5);
    expect(p.angle).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('controlPoint', () => {
  it('returns the chord midpoint when curvature is zero', () => {
    const { cx, cy } = controlPoint(0, 0, 10, 0, 0);
    expect(cx).toBeCloseTo(5, 10);
    expect(cy).toBeCloseTo(0, 10);
  });

  it('offsets perpendicular to the chord by curvature × length', () => {
    // Chord along +x axis, length 10, curvature 0.5 → perp offset = 5.
    // The perpendicular for (dx=10, dy=0) is (-dy, dx)/len = (0, 1).
    const { cx, cy } = controlPoint(0, 0, 10, 0, 0.5);
    expect(cx).toBeCloseTo(5, 10);
    expect(cy).toBeCloseTo(5, 10);
  });

  it('flips the offset sign when curvature is negative', () => {
    const { cx, cy } = controlPoint(0, 0, 10, 0, -0.5);
    expect(cx).toBeCloseTo(5, 10);
    expect(cy).toBeCloseTo(-5, 10);
  });

  it('handles vertical chord: offset lies along the x axis', () => {
    // Chord along +y axis, length 10, curvature 0.3 → (nx, ny) = (-1, 0) × 3
    const { cx, cy } = controlPoint(0, 0, 0, 10, 0.3);
    expect(cx).toBeCloseTo(-3, 10);
    expect(cy).toBeCloseTo(5, 10);
  });

  it('degenerate zero-length chord falls back gracefully (no NaN)', () => {
    const { cx, cy } = controlPoint(3, 4, 3, 4, 0.5);
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
  });
});
