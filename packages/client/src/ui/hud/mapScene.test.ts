import { describe, expect, it } from 'vitest';
import type { HudModel } from './hudModel';
import { createMapPlan, mapScene } from './mapScene';

type Entity = HudModel['mapEntities'][number];

const longRoute: [number, number][] = Array.from({ length: 1101 }, (_, i) => [0, -i * 20]);
const shortRoute: [number, number][] = Array.from({ length: 131 }, (_, i) => [0, -i * 20]);
const finish = { x: 0, z: -22000 };
const SIZE = 140;

const vehicle = (z: number): Entity => ({ id: 'vehicle', kind: 'vehicle', x: 0, z });
const stop = (id: string, z: number): Entity => ({ id, kind: 'stop', x: 0, z, stopKind: 'fuel' });
const checkpoint = (id: string, z: number): Entity => ({ id, kind: 'checkpoint', x: 0, z });
const player = (id: string, z: number): Entity => ({ id, kind: 'player', x: 0, z });

describe('mapScene (R11, A8)', () => {
  it('T12 a route over 3 km is windowed on the vehicle and the view moves with it', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    expect(plan.windowed).toBe(true);
    const a = mapScene(plan, [vehicle(-5000)]);
    const b = mapScene(plan, [vehicle(-5110)]);
    expect(a.view.originZ).toBe(-5000);
    expect(b.view.originZ).toBe(-5110);
    expect(a.path).not.toBe(b.path);
    expect(a.items.find((i) => i.entity.id === 'vehicle')).toMatchObject({ x: 70, y: 70 });
  });

  it('T12 on foot, the window centres on the player, not the vehicle', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    const self: Entity = { id: 'p1', kind: 'self', x: 0, z: -7000, yaw: 0 };
    const scene = mapScene(plan, [vehicle(-7100), self]);
    expect(scene.view.originZ).toBe(-7000);
  });

  it('T12 stops, checkpoints and other players outside the window are hidden, not pinned', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    const scene = mapScene(plan, [vehicle(-5000), stop('near', -5300), stop('far', -6000), player('p2', -5900), player('p3', -5200), checkpoint('cp-far', -9000)]);
    const ids = scene.items.map((i) => i.entity.id);
    expect(ids).toContain('near');
    expect(ids).toContain('p3');
    expect(ids).not.toContain('far');
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('cp-far');
  });

  it('A6 checkpoint markers are hidden on a windowed map even inside the window', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    const ids = mapScene(plan, [vehicle(-5000), checkpoint('cp-near', -5100)]).items.map((i) => i.entity.id);
    expect(ids).not.toContain('cp-near');
  });

  it('T12 the finish is pinned to the circle edge when outside, and drawn in place when inside', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    const far = mapScene(plan, [vehicle(-5000)]).items.find((i) => i.entity.kind === 'finish')!;
    expect(Math.hypot(far.x - 70, far.y - 70)).toBeCloseTo(67);
    expect(far.y).toBeGreaterThan(70 - 67 - 1e-9);
    expect(far.y).toBeLessThan(70);
    const near = mapScene(plan, [vehicle(-21800)]).items.find((i) => i.entity.kind === 'finish')!;
    expect(Math.hypot(near.x - 70, near.y - 70)).toBeLessThan(67);
  });

  it('T12 a route of 3 km or less keeps the whole-route view: nothing is hidden, no finish marker, static path', () => {
    const plan = createMapPlan(shortRoute, { x: 0, z: -2600 }, SIZE, 8);
    expect(plan.windowed).toBe(false);
    const entities = [vehicle(-100), stop('s', -2500), checkpoint('c', -2000), player('p2', -2400)];
    const a = mapScene(plan, entities);
    const b = mapScene(plan, [vehicle(-900)]);
    expect(a.items.map((i) => i.entity.id)).toEqual(['vehicle', 's', 'c', 'p2']);
    expect(a.view).toBe(b.view);
    expect(a.path).toBe(b.path);
    expect(a.path.startsWith('M')).toBe(true);
  });

  it('T12 with no entities the window stays on the route start and the finish is still drawn', () => {
    const plan = createMapPlan(longRoute, finish, SIZE, 8);
    const scene = mapScene(plan, []);
    expect(scene.view.originZ).toBeCloseTo(0);
    expect(scene.items.map((i) => i.entity.kind)).toEqual(['finish']);
  });
});
