import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@lodgy/shared';
import { projectMarker } from './downedMarkers';

const at = (ndcX: number, ndcY: number) => () => ({ x: ndcX, y: ndcY, z: 0.5 });
const P: Vec3 = { x: 0, y: 0, z: 0 };

describe('projectMarker', () => {
  it('T14 in front and on screen maps NDC to pixels with y down', () => {
    const r = projectMarker(at(0.5, 0.5), () => -5, P, 800, 600);
    expect(r.behind).toBe(false);
    expect(r.x).toBeCloseTo(600);
    expect(r.y).toBeCloseTo(150);
  });

  it('T14 screen centre', () => {
    const r = projectMarker(at(0, 0), () => -1, P, 800, 600);
    expect(r).toEqual({ x: 400, y: 300, behind: false });
  });

  it('T14 camera-space z >= 0 is behind', () => {
    expect(projectMarker(at(0, 0), () => 0, P, 800, 600).behind).toBe(true);
    expect(projectMarker(at(0, 0), () => 3, P, 800, 600).behind).toBe(true);
  });

  it('R3 in front but off screen clamps to the border', () => {
    const r = projectMarker(at(3, -2), () => -5, P, 800, 600);
    expect(r.behind).toBe(false);
    expect(r.x).toBe(800);
    expect(r.y).toBe(600);
  });

  it('behind stays inside the screen bounds', () => {
    const r = projectMarker(at(-0.2, 0.1), () => 2, P, 800, 600);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(800);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeLessThanOrEqual(600);
  });
});
