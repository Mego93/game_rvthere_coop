import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_STEP_HEIGHT, TICK_DT } from '../constants';
import { groundHeightAt } from '../groundProbe';
import { vec3 } from '../math';
import { NEUTRAL_INPUT, type PlayerInput } from '../protocol';
import { buildStatics } from '../statics';
import { SPOT_KINDS, type SpotKind } from '../story/days';
import { createWorld, type World } from '../world';
import { courseIds, getCourse } from './index';
import { villa } from './villa';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const gateSpot = () => villa.spots!.find((spot) => spot.kind === 'gate')!;

describe('V1: the course', () => {
  test('is registered as villa, labelled Villa, and kept out of the lobby list', () => {
    expect(getCourse('villa')).toBe(villa);
    expect(villa.id).toBe('villa');
    expect(villa.label).toBe('Villa');
    expect(courseIds()).not.toContain('villa');
  });

  test('has no race elements, corridor or ambient', () => {
    expect(villa.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(['cp-0']);
    expect(villa.coins).toEqual([]);
    expect(villa.pickups).toEqual([]);
    expect(villa.props).toEqual([]);
    expect(villa.stops).toEqual([]);
    expect(villa.ravines).toEqual([]);
    expect(villa.corridor).toBeUndefined();
    expect(villa.ambient).toBeUndefined();
    expect(villa.enemyDensity).toBeUndefined();
  });

  test('spans 80 m by 60 m of grounds, with a verge outside the gate', () => {
    const xs = villa.ground.flatMap((box) => [box.center.x - box.halfExtents.x, box.center.x + box.halfExtents.x]);
    const zs = villa.ground.flatMap((box) => [box.center.z - box.halfExtents.z, box.center.z + box.halfExtents.z]);
    expect(Math.min(...xs)).toBe(-40);
    expect(Math.max(...xs)).toBe(40);
    expect(Math.min(...zs)).toBe(-30);
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(30);
  });

  test('parks the Lodgy at the gate', () => {
    const gate = gateSpot();
    const spawn = villa.checkpoints[0]!.spawn;
    expect(Math.hypot(spawn.pos.x - gate.pos.x, spawn.pos.z - gate.pos.z)).toBeLessThanOrEqual(gate.radius);
  });

  test('builds into a world with a vehicle and a player that stay up', () => {
    const world = createWorld(RAPIER, { courseId: 'villa', vehicleId: 'lodgy', story: true });
    worlds.push(world);
    world.addPlayer('p1');
    for (let i = 0; i < 60; i++) world.step(new Map());
    const snapshot = world.snapshot();
    expect(snapshot.vehicle.pos.y).toBeGreaterThan(0);
    expect(snapshot.vehicle.pos.y).toBeLessThan(2);
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]!.pos.y).toBeGreaterThan(-0.1);
  });
});

describe('V2: the spots', () => {
  const spots = villa.spots!;
  const ofKind = (kind: SpotKind) => spots.filter((spot) => spot.kind === kind);

  test('counts per kind', () => {
    const counts = Object.fromEntries(SPOT_KINDS.map((kind) => [kind, ofKind(kind).length]));
    expect(counts).toEqual({ kitchen: 1, chef: 1, laptop: 6, bed: 6, couch: 6, board: 1, atm: 1, shop: 1, gate: 1 });
  });

  test('ids are unique and numbered per kind, the couch as couch-0 to couch-5', () => {
    expect(new Set(spots.map((spot) => spot.id)).size).toBe(spots.length);
    expect(ofKind('couch').map((spot) => spot.id)).toEqual(['couch-0', 'couch-1', 'couch-2', 'couch-3', 'couch-4', 'couch-5']);
    expect(ofKind('laptop').map((spot) => spot.id)).toEqual(Array.from({ length: 6 }, (_, i) => `laptop-${i}`));
    expect(ofKind('bed').map((spot) => spot.id)).toEqual(Array.from({ length: 6 }, (_, i) => `bed-${i}`));
  });

  test('every spot has a positive radius and stands on the ground', () => {
    for (const spot of spots) {
      expect(spot.radius).toBeGreaterThan(0);
      expect(groundHeightAt(villa.ground, spot.pos.x, spot.pos.z), spot.id).toBeCloseTo(spot.pos.y, 6);
    }
  });

  test('the ATM and the shop are outside the gate, the rest inside the grounds', () => {
    for (const spot of spots) {
      if (spot.kind === 'atm' || spot.kind === 'shop') expect(spot.pos.z, spot.id).toBeGreaterThan(30);
      else expect(spot.pos.z, spot.id).toBeLessThanOrEqual(30);
    }
  });

  test('spots of the same kind do not overlap', () => {
    for (const kind of SPOT_KINDS) {
      const same = ofKind(kind);
      for (let i = 0; i < same.length; i++)
        for (let j = i + 1; j < same.length; j++) {
          const a = same[i]!;
          const b = same[j]!;
          expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z), `${a.id} ${b.id}`).toBeGreaterThanOrEqual(a.radius + b.radius - 0.001);
        }
    }
  });
});

// A walkability grid over the static scene: a cell is free when a player capsule (two balls) fits, and neighbours connect when the ground differs by at most a step.
function reachable(from: { x: number; z: number }) {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  buildStatics(RAPIER, world, villa);
  world.step();
  const CELL = 0.5;
  const ball = new RAPIER.Ball(PLAYER_RADIUS);
  const key = (i: number, j: number) => `${i},${j}`;
  const heights = new Map<string, number | null>();
  const heightOf = (i: number, j: number): number | null => {
    const k = key(i, j);
    if (!heights.has(k)) {
      const h = groundHeightAt(villa.ground, i * CELL, j * CELL);
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

describe('V1: walking', () => {
  test('from the gate a player can walk to every spot', () => {
    const can = reachable(gateSpot().pos);
    for (const spot of villa.spots!) expect(can(spot.pos.x, spot.pos.z), spot.id).toBe(true);
  });

  test('a player on the pool floor can reach the gate, so the pool can be climbed out of', () => {
    expect(groundHeightAt(villa.ground, 17, 3)!).toBeLessThan(-0.5);
    expect(reachable({ x: 17, z: 3 })(gateSpot().pos.x, gateSpot().pos.z)).toBe(true);
  });

  test('the grid does not reach beyond the perimeter', () => {
    const can = reachable(gateSpot().pos);
    expect(can(-45, 0)).toBe(false);
    expect(can(0, -35)).toBe(false);
  });
});

describe('V1: walking in the physics', () => {
  const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
  const make = (): World => {
    const world = createWorld(RAPIER, { courseId: 'villa', vehicleId: 'lodgy', story: true });
    worlds.push(world);
    world.addPlayer('p1');
    return world;
  };
  const walk = (world: World, yaw: number, seconds: number) => {
    for (let i = 0; i < seconds / TICK_DT; i++) world.step(new Map([['p1', input({ moveY: 1, yaw })]]));
    return world.snapshot().players[0]!.pos;
  };

  test('a player climbs out of the pool by its steps', () => {
    const world = make();
    world.teleportPlayer('p1', vec3(19, -0.98, 3));
    world.step(new Map());
    const pos = walk(world, Math.PI / 2, 8);
    expect(pos.y).toBeGreaterThan(-0.05);
    expect(pos.x).toBeLessThan(12);
  });

  test('a player walks through a door gap of the house', () => {
    const world = make();
    world.teleportPlayer('p1', vec3(-7.5, 0.12, 3));
    world.step(new Map());
    const pos = walk(world, 0, 4);
    expect(pos.z).toBeLessThan(-6);
  });
});
