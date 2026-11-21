import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { ENEMY_MAX_ALIVE, ENEMY_SPACING, GRAVITY, GUN_AMMO_START, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_STEP_HEIGHT, TICK_RATE } from '../constants';
import { planEnemies } from '../enemies';
import { groundHeightAt } from '../groundProbe';
import { vec3 } from '../math';
import { createRouteIndex } from '../routeAlong';
import { buildStatics } from '../statics';
import { createWorld, type World } from '../world';
import { ARRIVAL_ENEMY_DENSITY, arrival } from './arrival';
import { insideBox } from '../checkpoints';
import { courseIds, getCourse } from './index';
import { walkTo } from './soloRig';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const make = (options: { enemies?: boolean; players?: string[] } = {}): World => {
  const world = createWorld(RAPIER, { courseId: 'arrival', vehicleId: 'lodgy', story: true, ...(options.enemies ? { enemies: true } : {}) });
  worlds.push(world);
  for (const id of options.players ?? ['p1']) world.addPlayer(id);
  return world;
};
const idle = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) world.step(new Map());
};
const feet = (world: World, id: string) => world.snapshot().players.find((p) => p.playerId === id)!.pos;
const finishCentre = arrival.finish.center;
const routeLength = createRouteIndex(arrival.route).length;

describe('A1: the course', () => {
  test('is registered as arrival, kept out of the lobby list, and won by the players', () => {
    expect(getCourse('arrival')).toBe(arrival);
    expect(arrival.id).toBe('arrival');
    expect(courseIds()).not.toContain('arrival');
    expect(arrival.finishBy).toBe('players');
  });

  test('has no race elements, corridor or ambient, and one checkpoint', () => {
    expect(arrival.checkpoints.map((c) => c.id)).toEqual(['cp-0']);
    expect(arrival.coins).toEqual([]);
    expect(arrival.stops).toEqual([]);
    expect(arrival.ravines).toEqual([]);
    expect(arrival.corridor).toBeUndefined();
    expect(arrival.ambient).toBeUndefined();
  });

  test('is about 260 m long, from the hall to the rental stop', () => {
    expect(routeLength).toBeGreaterThan(250);
    expect(routeLength).toBeLessThan(275);
    expect(arrival.playerStart).toBeDefined();
    expect(insideBox(vec3(arrival.playerStart!.pos.x, arrival.playerStart!.pos.y + 1, arrival.playerStart!.pos.z), arrival.finish)).toBe(false);
  });

  test('has two crate walls, gates, a roadblock and debris', () => {
    const count = (kind: string) => arrival.props.filter((p) => p.kind === kind).length;
    expect(count('crate')).toBeGreaterThanOrEqual(24);
    expect(count('barrier')).toBeGreaterThanOrEqual(7);
  });

  test('has one ammo box, about half way', () => {
    const boxes = arrival.pickups.filter((p) => p.kind === 'ammo');
    expect(boxes).toHaveLength(1);
    expect(arrival.pickups).toHaveLength(1);
    const along = createRouteIndex(arrival.route).project(boxes[0]!.pose.pos.x, boxes[0]!.pose.pos.z).along;
    expect(along / routeLength).toBeGreaterThan(0.4);
    expect(along / routeLength).toBeLessThan(0.6);
  });
});

describe('A2: the start and the Lodgy', () => {
  test('the Lodgy is parked, unseated, inside the finish box of the rental stop', () => {
    const world = make();
    idle(world, 2 * TICK_RATE);
    const { vehicle, players } = world.snapshot();
    expect(players[0]!.seat).toBeNull();
    expect(insideBox(vehicle.pos, arrival.finish)).toBe(true);
    expect(vehicle.pos.y).toBeGreaterThan(0);
    expect(vehicle.pos.y).toBeLessThan(2);
  });

  test('every friend starts on foot in the arrival hall with a gun and the starting rounds', () => {
    const world = make({ players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] });
    idle(world, 30);
    const { players } = world.snapshot();
    expect(players).toHaveLength(6);
    for (const p of players) {
      expect(p.pos.z, p.playerId).toBeGreaterThan(-8);
      expect(p.pos.z, p.playerId).toBeLessThan(6);
      expect(Math.abs(p.pos.x), p.playerId).toBeLessThan(5);
      expect(p.seat).toBeNull();
      expect(p.gun, p.playerId).toBe(true);
      expect(p.ammo, p.playerId).toBe(GUN_AMMO_START);
    }
    expect(new Set(players.map((p) => `${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`)).size).toBe(6);
  });
});

// A walkability grid over the static scene, as in villa.test.ts.
function reachable(from: { x: number; z: number }) {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  buildStatics(RAPIER, world, arrival);
  world.step();
  const CELL = 0.5;
  const ball = new RAPIER.Ball(PLAYER_RADIUS);
  const key = (i: number, j: number) => `${i},${j}`;
  const heights = new Map<string, number | null>();
  const heightOf = (i: number, j: number): number | null => {
    const k = key(i, j);
    if (!heights.has(k)) {
      const h = groundHeightAt(arrival.ground, i * CELL, j * CELL);
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

describe('A3: walking', () => {
  test('from the start a player can walk to every point of the route and to the finish box', () => {
    const can = reachable(arrival.playerStart!.pos);
    for (const [x, z] of arrival.route) expect(can(x, z), `${x}, ${z}`).toBe(true);
    expect(can(finishCentre.x, finishCentre.z)).toBe(true);
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]] as const) expect(can(finishCentre.x + dx, finishCentre.z + dz), `${dx} ${dz}`).toBe(true);
  });

  test('the grid does not reach beyond the walls', () => {
    const can = reachable(arrival.playerStart!.pos);
    expect(can(-30, 0)).toBe(false);
    expect(can(0, 20)).toBe(false);
    expect(can(0, -300)).toBe(false);
  });

  test('a scripted walker goes round the crates and the roadblock to the finish, and wins', () => {
    const world = make();
    idle(world, 10);
    // Past the first crate wall on its right, the second on its left, down the lane of gates, through the gap of the roadblock.
    const path = [[3, -12], [3, -45], [-3, -50], [-3, -85], [0, -108], [0, -185], [5, -192], [5, -210], [0, -232], [0, finishCentre.z]] as const;
    for (const [x, z] of path) expect(walkTo(world, 'p1', { x, z }, 0.6, 40), `${x}, ${z}`).toBe(true);
    idle(world, 5);
    expect(world.status().state).toBe('won');
  }, 120_000);
});

describe('A4: enemies', () => {
  test('the plan at the arrival density has an event every ENEMY_SPACING / 6 m of the route', () => {
    expect(ARRIVAL_ENEMY_DENSITY).toBe(6);
    expect(arrival.enemyDensity).toBe(ARRIVAL_ENEMY_DENSITY);
    const plan = planEnemies(1, routeLength, null, arrival.enemyDensity);
    expect(plan.length).toBe(Math.ceil((routeLength - ENEMY_SPACING / ARRIVAL_ENEMY_DENSITY / 2) / (ENEMY_SPACING / ARRIVAL_ENEMY_DENSITY)));
    expect(plan.length).toBeGreaterThanOrEqual(6);
  });

  test('enemies appear round the players on foot at the start, though the Lodgy stands at the far end', () => {
    const world = make({ enemies: true });
    idle(world, 20);
    const enemies = world.snapshot().enemies;
    expect(enemies).toBeDefined();
    expect(enemies!.length).toBeGreaterThan(0);
    expect(enemies!.length).toBeLessThanOrEqual(ENEMY_MAX_ALIVE);
    for (const e of enemies!) expect(e.z, `enemy ${e.id}`).toBeGreaterThan(-135);
  });

  test('a player walking on keeps meeting enemies, and they are not all spawned at once', () => {
    const world = make({ enemies: true });
    idle(world, 20);
    const first = new Set(world.snapshot().enemies!.map((e) => e.id));
    walkTo(world, 'p1', { x: 3, z: -45 }, 0.6, 30);
    walkTo(world, 'p1', { x: 0, z: -110 }, 0.6, 30);
    const later = world.snapshot().enemies ?? [];
    expect(later.some((e) => !first.has(e.id))).toBe(true);
  }, 120_000);
});

describe('A5: finishBy players', () => {
  const inFinish = vec3(finishCentre.x + 3, 0.2, finishCentre.z + 3);
  const outside = vec3(0, 0.2, -120);

  test('the Lodgy standing in the finish box does not win by itself', () => {
    const world = make();
    idle(world, 3 * TICK_RATE);
    expect(world.status().state).toBe('running');
  });

  test('is won only when every present player is inside the box', () => {
    const world = make({ players: ['p1', 'p2'] });
    world.teleportPlayer('p1', inFinish);
    world.teleportPlayer('p2', outside);
    idle(world, 10);
    expect(world.status().state).toBe('running');
    world.teleportPlayer('p2', vec3(inFinish.x - 4, 0.2, inFinish.z));
    idle(world, 3);
    expect(world.status().state).toBe('won');
  });

  test('a player who is downed does not have to be there', () => {
    const world = make({ players: ['p1', 'p2'] });
    world.teleportPlayer('p1', inFinish);
    world.teleportPlayer('p2', outside);
    idle(world, 5);
    expect(world.status().state).toBe('running');
    world.debugHurt('p2', 1000);
    idle(world, 3);
    expect(world.status().state).toBe('won');
  });

  test('a player who leaves, or one who is there alone, does not hold it up', () => {
    const world = make({ players: ['p1', 'p2'] });
    world.teleportPlayer('p1', inFinish);
    world.teleportPlayer('p2', outside);
    idle(world, 5);
    expect(world.status().state).toBe('running');
    world.removePlayer('p2', 'hold');
    idle(world, 3);
    expect(world.status().state).toBe('won');
  });

  test('nobody present, nobody wins', () => {
    const world = make({ players: [] });
    idle(world, 10);
    expect(world.status().state).toBe('running');
  });

  test('the box is on the ground: a player in the air above it does not count', () => {
    const world = make();
    world.teleportPlayer('p1', vec3(inFinish.x, 12, inFinish.z));
    world.step(new Map());
    expect(world.status().state).toBe('running');
  });
});
