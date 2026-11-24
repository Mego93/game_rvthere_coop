import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { ENEMY_HALF, ENEMY_MAX_ALIVE, ENEMY_SPACING, GRAVITY, GUN_AMMO_START, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_STEP_HEIGHT, TICK_RATE } from '../constants';
import { groundHeightAt } from '../groundProbe';
import { terrainHeightAt } from '../terrain';
import { vec3, type Vec3 } from '../math';
import { createRouteIndex } from '../routeAlong';
import { buildStatics } from '../statics';
import { createWorld, type World } from '../world';
import { ARRIVAL_BUILDINGS, ARRIVAL_ENEMY_DENSITY, ARRIVAL_ROUTES, arrival } from './arrival';
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

  test('is a district of about 220 x 160 m with a start inside the arrivals hall', () => {
    const xs = arrival.ground.flatMap((g) => [g.center.x - g.halfExtents.x, g.center.x + g.halfExtents.x]);
    const zs = arrival.ground.flatMap((g) => [g.center.z - g.halfExtents.z, g.center.z + g.halfExtents.z]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(240);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(150);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(175);
    expect(arrival.playerStart).toBeDefined();
    const terminal = ARRIVAL_BUILDINGS.find((b) => b.key === 'terminal')!;
    expect(Math.abs(arrival.playerStart!.pos.x - terminal.center.x)).toBeLessThan(terminal.size.x / 2);
    expect(Math.abs(arrival.playerStart!.pos.z - terminal.center.z)).toBeLessThan(terminal.size.z / 2);
    expect(insideBox(vec3(arrival.playerStart!.pos.x, arrival.playerStart!.pos.y + 1, arrival.playerStart!.pos.z), arrival.finish)).toBe(false);
  });

  test('has uneven ground patches 1 to 1.5 m high on the forecourt, and a raised car park 3.5 m up', () => {
    expect(arrival.terrain!.length).toBeGreaterThanOrEqual(2);
    const peak = Math.max(...arrival.terrain!.flatMap((p) => p.heights));
    expect(peak).toBeGreaterThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(1.5);
    const deck = ARRIVAL_BUILDINGS.find((b) => b.key === 'carPark')!;
    expect(deck.center.y + deck.size.y / 2).toBeCloseTo(3.5, 5);
  });

  test('exports three buildings with footprints, and three routes from the hall to the rental stop', () => {
    expect(ARRIVAL_BUILDINGS.map((b) => b.key).sort()).toEqual(['carPark', 'rentalOffice', 'terminal']);
    expect(ARRIVAL_ROUTES.map((r) => r.id).sort()).toEqual(['carpark', 'service', 'taxi']);
    for (const r of ARRIVAL_ROUTES) {
      expect(Math.hypot(r.points[0]!.x - arrival.playerStart!.pos.x, r.points[0]!.z - arrival.playerStart!.pos.z), r.id).toBeLessThan(3);
      expect(insideBox(vec3(r.points.at(-1)!.x, 1, r.points.at(-1)!.z), arrival.finish), r.id).toBe(true);
    }
  });

  test('has crate piles, a service roadblock and the gates of the taxi lane', () => {
    const count = (kind: string) => arrival.props.filter((p) => p.kind === kind).length;
    expect(count('crate')).toBeGreaterThanOrEqual(5);
    expect(count('barrier')).toBeGreaterThanOrEqual(6);
  });

  test('has two ammo boxes: one on the forecourt and one on the raised car park', () => {
    const boxes = arrival.pickups.filter((p) => p.kind === 'ammo');
    expect(boxes).toHaveLength(2);
    expect(arrival.pickups).toHaveLength(2);
    const [forecourt, deck] = boxes.map((b) => b.pose.pos).sort((a, b) => a.y - b.y) as [Vec3, Vec3];
    expect(forecourt.y).toBeLessThan(1.6);
    expect(forecourt.z).toBeLessThan(-24);
    expect(forecourt.z).toBeGreaterThan(-62);
    expect(Math.abs(forecourt.x)).toBeLessThan(62);
    expect(deck.y).toBeGreaterThanOrEqual(3.4);
    const car = ARRIVAL_BUILDINGS.find((b) => b.key === 'carPark')!;
    expect(Math.abs(deck.x - car.center.x)).toBeLessThan(car.size.x / 2);
    expect(Math.abs(deck.z - car.center.z)).toBeLessThan(car.size.z / 2);
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

// The top of the ground at (x, z): the highest ground box or patch.
const heightAt = (x: number, z: number): number | null => {
  const box = groundHeightAt(arrival.ground, x, z);
  const patch = terrainHeightAt(arrival, x, z);
  return box === null ? patch : patch === null ? box : Math.max(box, patch);
};

const CELL = 0.5;
function walkGrid() {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  buildStatics(RAPIER, world, arrival);
  world.step();
  const ball = new RAPIER.Ball(PLAYER_RADIUS);
  const key = (i: number, j: number) => `${i},${j}`;
  const cache = new Map<string, number | null>();
  // The height of the walkable cell centred on (i, j), or null where it is blocked or has no ground.
  const heightOf = (i: number, j: number): number | null => {
    const k = key(i, j);
    if (!cache.has(k)) {
      const h = heightAt(i * CELL, j * CELL);
      const blocked =
        h === null ||
        [PLAYER_STEP_HEIGHT + PLAYER_RADIUS + 0.02, PLAYER_HEIGHT - PLAYER_RADIUS].some(
          (up) => world.intersectionWithShape({ x: i * CELL, y: h + up, z: j * CELL }, { x: 0, y: 0, z: 0, w: 1 }, ball) !== null,
        );
      cache.set(k, blocked ? null : h);
    }
    return cache.get(k)!;
  };
  return { heightOf, free: () => world.free() };
}

// Every cell a flood fill from `from` reaches, one cell at a time with the step limit.
function reachable(from: { x: number; z: number }) {
  const grid = walkGrid();
  const key = (i: number, j: number) => `${i},${j}`;
  const start: [number, number] = [Math.round(from.x / CELL), Math.round(from.z / CELL)];
  const seen = new Set([key(...start)]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const [i, j] = queue[at]!;
    const h = grid.heightOf(i, j)!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = grid.heightOf(i + di, j + dj);
      if (next === null || Math.abs(next - h) > PLAYER_STEP_HEIGHT || seen.has(key(i + di, j + dj))) continue;
      seen.add(key(i + di, j + dj));
      queue.push([i + di, j + dj]);
    }
  }
  grid.free();
  return (x: number, z: number) => seen.has(key(Math.round(x / CELL), Math.round(z / CELL)));
}

let reach: ReturnType<typeof reachable> | null = null;
const canReach = (x: number, z: number): boolean => (reach ??= reachable(arrival.playerStart!.pos))(x, z);

describe('A3: walking', () => {
  test.each(['carpark', 'taxi', 'service'])('the %s route is walkable, cell by cell, with the step limit, from the hall to the finish', (id) => {
    const route = ARRIVAL_ROUTES.find((r) => r.id === id)!;
    const grid = walkGrid();
    let last: number | null = null;
    let top = 0;
    let steepest = 0;
    let samples = 0;
    for (let s = 0; s + 1 < route.points.length; s++) {
      const a = route.points[s]!;
      const b = route.points[s + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / CELL));
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        const h = grid.heightOf(Math.round(x / CELL), Math.round(z / CELL));
        expect(h, `${id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).not.toBeNull();
        if (last !== null) {
          steepest = Math.max(steepest, Math.abs(h! - last));
          expect(Math.abs(h! - last), `${id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThanOrEqual(PLAYER_STEP_HEIGHT + 1e-9);
        }
        last = h;
        top = Math.max(top, h!);
        samples++;
      }
    }
    grid.free();
    expect(samples).toBeGreaterThan(100);
    if (id === 'carpark') {
      // The ramp up to the deck and the stairs down from it.
      expect(top).toBeGreaterThan(3.4);
      expect(steepest).toBeGreaterThan(0.2);
    }
    if (id === 'taxi') expect(top).toBeGreaterThanOrEqual(0.99);
  });

  test('the stairs from the forecourt to the raised car park are walkable too', () => {
    const grid = walkGrid();
    let last: number | null = null;
    for (let x = 46; x <= 60; x += CELL) {
      const h = grid.heightOf(Math.round(x / CELL), Math.round(-65 / CELL));
      expect(h, `x ${x}`).not.toBeNull();
      if (last !== null) expect(Math.abs(h! - last), `x ${x}`).toBeLessThanOrEqual(PLAYER_STEP_HEIGHT + 1e-9);
      last = h;
    }
    expect(last).toBeCloseTo(3.5, 1);
    grid.free();
  });

  test('from the start a player can walk to the finish box, both ammo boxes, and every route point', () => {
    for (const r of ARRIVAL_ROUTES) for (const p of r.points) expect(canReach(p.x, p.z), `${r.id} ${p.x}, ${p.z}`).toBe(true);
    expect(canReach(finishCentre.x, finishCentre.z)).toBe(true);
    for (const [dx, dz] of [[-6, -8], [6, -8], [-6, 8], [6, 8]] as const) expect(canReach(finishCentre.x + dx, finishCentre.z + dz), `${dx} ${dz}`).toBe(true);
    for (const ammo of arrival.pickups.filter((p) => p.kind === 'ammo')) expect(canReach(ammo.pose.pos.x, ammo.pose.pos.z), ammo.id).toBe(true);
  });

  test('the grid does not reach beyond the district walls', () => {
    expect(canReach(-120, 0)).toBe(false);
    expect(canReach(0, 40)).toBe(false);
    expect(canReach(0, -140)).toBe(false);
    expect(canReach(120, -60)).toBe(false);
  });

  test.each(['taxi', 'carpark', 'service'])('a scripted walker follows the %s route in real physics to the finish, and wins', (id) => {
    const world = make();
    idle(world, 10);
    for (const { x, z } of ARRIVAL_ROUTES.find((r) => r.id === id)!.points.slice(1)) expect(walkTo(world, 'p1', { x, z }, 0.6, 40), `${x}, ${z}`).toBe(true);
    idle(world, 5);
    expect(world.status().state).toBe('won');
    if (id === 'carpark') expect(Math.max(...ARRIVAL_ROUTES.find((r) => r.id === id)!.points.map((p) => p.y))).toBeGreaterThan(3.4);
  }, 240_000);

  test('a vehicle dropped on the forecourt mound lands on it and does not fall through', () => {
    const world = make();
    const body = world.debugBody('vehicle')!;
    const at = { x: -50, z: -38 };
    const h = terrainHeightAt(arrival, at.x, at.z)!;
    expect(h).toBeGreaterThan(1);
    body.setTranslation({ x: at.x, y: h + 4, z: at.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    let lowest = Infinity;
    for (let i = 0; i < 5 * TICK_RATE; i++) {
      world.step(new Map());
      lowest = Math.min(lowest, body.translation().y);
    }
    const end = body.translation();
    const under = heightAt(end.x, end.z)!;
    expect(lowest).toBeGreaterThan(h - 0.3);
    expect(end.y).toBeGreaterThan(under);
    expect(end.y).toBeLessThan(under + 2.5);
  });
});

describe('A4: enemies', () => {
  const spawns = arrival.enemySpawns ?? [];
  const start = arrival.playerStart!.pos;
  const distanceToRoute = (id: string, x: number, z: number): number => {
    const pts = ARRIVAL_ROUTES.find((r) => r.id === id)!.points;
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / len2));
      best = Math.min(best, Math.hypot(x - (a.x + t * (b.x - a.x)), z - (a.z + t * (b.z - a.z))));
    }
    return best;
  };

  test('the density is ARRIVAL_ENEMY_DENSITY and every route has its own events at that spacing', () => {
    expect(ARRIVAL_ENEMY_DENSITY).toBe(6);
    expect(arrival.enemyDensity).toBe(ARRIVAL_ENEMY_DENSITY);
    let plannedTotal = 0;
    for (const r of ARRIVAL_ROUTES) {
      const near = spawns.filter((e) => distanceToRoute(r.id, e.at!.x, e.at!.z) < 3);
      const length = createRouteIndex(r.points.map((p) => [p.x, p.z] as [number, number])).length;
      const planned = Math.ceil((length - ENEMY_SPACING / ARRIVAL_ENEMY_DENSITY / 2) / (ENEMY_SPACING / ARRIVAL_ENEMY_DENSITY));
      plannedTotal += planned;
      expect(near.length, r.id).toBeGreaterThanOrEqual(Math.floor(planned / 2));
    }
    expect(spawns.length).toBeLessThanOrEqual(plannedTotal);
  });

  test('spawn points lie along all three routes, at least 25 m from the start, on ground a player can reach', () => {
    expect(spawns.length).toBeGreaterThanOrEqual(10);
    for (const r of ARRIVAL_ROUTES) expect(spawns.filter((e) => distanceToRoute(r.id, e.at!.x, e.at!.z) < 3).length, r.id).toBeGreaterThanOrEqual(3);
    for (const e of spawns) {
      expect(distanceToRoute('carpark', e.at!.x, e.at!.z) < 3 || distanceToRoute('taxi', e.at!.x, e.at!.z) < 3 || distanceToRoute('service', e.at!.x, e.at!.z) < 3, `event ${e.id}`).toBe(true);
      expect(Math.hypot(e.at!.x - start.x, e.at!.z - start.z), `event ${e.id}`).toBeGreaterThanOrEqual(25);
      expect(canReach(e.at!.x, e.at!.z), `event ${e.id} at ${e.at!.x}, ${e.at!.z}`).toBe(true);
    }
    expect(spawns.map((e) => e.id)).toEqual(spawns.map((_, i) => i));
    for (let i = 1; i < spawns.length; i++) expect(spawns[i]!.along).toBeGreaterThanOrEqual(spawns[i - 1]!.along);
  });

  test('enemies appear on the ground at their spawn points, including on the raised car park', () => {
    const world = make({ enemies: true });
    idle(world, 20);
    const enemies = world.snapshot().enemies;
    expect(enemies).toBeDefined();
    expect(enemies!.length).toBeGreaterThan(0);
    expect(enemies!.length).toBeLessThanOrEqual(ENEMY_MAX_ALIVE);
    for (const e of enemies!) {
      const spawn = spawns.find((s) => Math.hypot(s.at!.x - e.x, s.at!.z - e.z) < 4);
      expect(spawn, `enemy ${e.id}`).toBeDefined();
      expect(Math.abs(e.y - ENEMY_HALF.y - heightAt(e.x, e.z)!), `enemy ${e.id}`).toBeLessThan(0.3);
    }
  });

  test('a player walking on keeps meeting enemies, and they are not all spawned at once', () => {
    const world = make({ enemies: true });
    idle(world, 20);
    const first = new Set(world.snapshot().enemies!.map((e) => e.id));
    for (const { x, z } of ARRIVAL_ROUTES.find((r) => r.id === 'taxi')!.points.slice(1, 11)) walkTo(world, 'p1', { x, z }, 0.6, 30);
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
