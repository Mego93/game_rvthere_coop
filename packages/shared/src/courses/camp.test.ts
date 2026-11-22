import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_STEP_HEIGHT } from '../constants';
import { groundHeightAt } from '../groundProbe';
import { buildStatics } from '../statics';
import { createWorld, type World } from '../world';
import { camp } from './camp';
import { courseIds, getCourse } from './index';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const table = () => camp.spots!.find((spot) => spot.id === 'camp-table')!;
const spawn = () => camp.checkpoints[0]!.spawn.pos;

describe('the camp', () => {
  test('is registered as camp and kept out of the lobby list', () => {
    expect(getCourse('camp')).toBe(camp);
    expect(camp.id).toBe('camp');
    expect(courseIds()).not.toContain('camp');
  });

  test('has no race elements, corridor or ambient', () => {
    expect(camp.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(['cp-0']);
    expect(camp.coins).toEqual([]);
    expect(camp.pickups).toEqual([]);
    expect(camp.props).toEqual([]);
    expect(camp.stops).toEqual([]);
    expect(camp.corridor).toBeUndefined();
    expect(camp.ambient).toBeUndefined();
  });

  test('spans about 40 m by 30 m', () => {
    const xs = camp.ground.flatMap((box) => [box.center.x - box.halfExtents.x, box.center.x + box.halfExtents.x]);
    const zs = camp.ground.flatMap((box) => [box.center.z - box.halfExtents.z, box.center.z + box.halfExtents.z]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(40);
    expect(Math.max(...zs) - Math.min(...zs)).toBe(30);
  });

  test('holds only the table spot, standing on the ground', () => {
    expect(camp.spots).toHaveLength(1);
    expect(table()).toMatchObject({ id: 'camp-table', kind: 'kitchen' });
    expect(groundHeightAt(camp.ground, table().pos.x, table().pos.z)).toBeCloseTo(table().pos.y, 6);
  });

  test('builds into a world with the buggy parked and a player that stay up', () => {
    const world = createWorld(RAPIER, { courseId: 'camp', vehicleId: 'buggy', story: true });
    worlds.push(world);
    world.addPlayer('p1');
    for (let i = 0; i < 60; i++) world.step(new Map());
    const snapshot = world.snapshot();
    expect(snapshot.vehicle.pos.y).toBeGreaterThan(0);
    expect(snapshot.vehicle.pos.y).toBeLessThan(2);
    expect(snapshot.players[0]!.pos.y).toBeGreaterThan(-0.1);
  });
});

// A walkability grid over the static scene: a cell is free when a player capsule (two balls) fits, and neighbours connect when the ground differs by at most a step.
function reachable(from: { x: number; z: number }) {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  buildStatics(RAPIER, world, camp);
  world.step();
  const CELL = 0.5;
  const ball = new RAPIER.Ball(PLAYER_RADIUS);
  const key = (i: number, j: number) => `${i},${j}`;
  const heights = new Map<string, number | null>();
  const heightOf = (i: number, j: number): number | null => {
    const k = key(i, j);
    if (!heights.has(k)) {
      const h = groundHeightAt(camp.ground, i * CELL, j * CELL);
      const blocked =
        h === null ||
        [PLAYER_STEP_HEIGHT + PLAYER_RADIUS + 0.02, PLAYER_HEIGHT - PLAYER_RADIUS].some(
          (up) => world.intersectionWithShape({ x: i * CELL, y: h + up, z: j * CELL }, { x: 0, y: 0, z: 0, w: 1 }, ball) !== null,
        );
      heights.set(k, blocked ? null : h);
    }
    return heights.get(k)!;
  };
  const start: [number, number] = [Math.round(from.x / CELL), Math.round(from.z / CELL)];
  const seen = new Set([key(...start)]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const [i, j] = queue[at]!;
    const h = heightOf(i, j)!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = heightOf(i + di, j + dj);
      if (next === null || Math.abs(next - h) > PLAYER_STEP_HEIGHT || seen.has(key(i + di, j + dj))) continue;
      seen.add(key(i + di, j + dj));
      queue.push([i + di, j + dj]);
    }
  }
  world.free();
  return (x: number, z: number) => seen.has(key(Math.round(x / CELL), Math.round(z / CELL)));
}

describe('the camp: walking', () => {
  test('from the spawn a player can walk to the table', () => {
    expect(reachable(spawn())(table().pos.x, table().pos.z)).toBe(true);
  });

  test('the grid does not reach beyond the fence', () => {
    const can = reachable(spawn());
    expect(can(-25, 0)).toBe(false);
    expect(can(0, -20)).toBe(false);
  });

  test('the table is inside the tent, which is closed except for its door', () => {
    const can = reachable({ x: table().pos.x, z: table().pos.z });
    expect(can(spawn().x, spawn().z)).toBe(true);
    expect(can(-10, -8)).toBe(true);
    expect(can(-8, -8), 'the tent wall').toBe(false);
  });
});
