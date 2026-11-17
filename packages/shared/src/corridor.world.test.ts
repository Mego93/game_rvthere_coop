import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { BIG_HILL_SLOPE, CORRIDOR_OUTER, OUT_OF_BOUNDS, PLAYER_MAX_HEALTH, ROAD_WIDTH, TICK_DT, TICK_RATE } from './constants';
import { corridorHeightAt, corridorOf, routeFrame } from './corridor';
import { segmentStarts } from './courses/driveRig';
import { getCourse, getCourseDef } from './courses/index';
import { DEEP_PIT } from './courses/terrain';
import { rotate, vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { yawQuat } from './segments';
import { createRig } from './testRig';
import { surfaceYAt } from './surfaceHeight';
import { createWorld, type World, type WorldEvent } from './world';

declare const console: { info(...args: unknown[]): void };
beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('marrakech');
const def = getCourseDef('marrakech')!;
const frame = routeFrame(course);
const corridor = corridorOf(course)!;
const starts = segmentStarts(course);
const alongOfSegment = (index: number, fraction = 0.5): number => frame.cum[starts[index]!]! + fraction * (frame.cum[starts[index + 1]!]! - frame.cum[starts[index]!]!);

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});
const make = (vehicleId = 'lodgy'): World => {
  const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId });
  worlds.push(world);
  world.addPlayer('p');
  return world;
};
const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const me = (world: World) => world.snapshot().players.find((player) => player.playerId === 'p')!;

// A point `lateral` m to the right of the route at `along`, and the outward unit direction for that side.
function place(along: number, lateral: number): { x: number; z: number; nx: number; nz: number; y: number } {
  const c = frame.pointAt(along);
  const side = lateral < 0 ? -1 : 1;
  const x = c.x - c.tz * lateral;
  const z = c.z + c.tx * lateral;
  const ground = Math.max(surfaceYAt(course, x, z) ?? -Infinity, corridorHeightAt(corridor, x, z) ?? -Infinity);
  return { x, z, nx: -c.tz * side, nz: c.tx * side, y: ground };
}
// The yaw whose forward direction is (nx, nz).
const yawOf = (nx: number, nz: number): number => Math.atan2(-nx, -nz);
const distance = (x: number, z: number): number => frame.nearest(x, z).d;

function run(world: World, ticks: number, fields: Partial<PlayerInput> = {}): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(new Map([['p', input(fields)]])));
  return events;
}

const bigHill = def.segments.findIndex((s) => s.type === 'road' && s.slope === BIG_HILL_SLOPE);
const deepPit = def.segments.findIndex((s) => JSON.stringify(s) === JSON.stringify(DEEP_PIT));
// A straight whose land is clear of the rest of the route out to 130 m on both sides.
const isolated = (along: number): boolean => [-130, 130].every((lateral) => distance(place(along, lateral).x, place(along, lateral).z) > 129.5);
const straight = def.segments.findIndex((s, i) => s.type === 'road' && !s.curve && !s.slope && !s.hazards && !s.stop && (s.length ?? 0) > 150 && i > 2 && isolated(alongOfSegment(i)));
const curve = def.segments.findIndex((s) => s.type === 'road' && Math.abs(s.curve ?? 0) > 1 && s.length > 100);

describe('plan test 2: standing on the land beside the road', () => {
  const places: [string, number, 1 | -1][] = [
    ['a straight', alongOfSegment(straight), 1],
    ['the inner side of a curve', alongOfSegment(curve), (def.segments[curve] as { curve: number }).curve > 0 ? -1 : 1],
    ['the outer side of a curve', alongOfSegment(curve), (def.segments[curve] as { curve: number }).curve > 0 ? 1 : -1],
    ['beside the deep pit (just outside its wall)', alongOfSegment(deepPit, 0) - 50, 1],
    ['on the big hill', alongOfSegment(bigHill + 1, 0.5), -1],
  ];
  test.each(places)('%s: walk off the shoulder to 40 m out and stand 5 s with no respawn', (_name, along, side) => {
    const world = make();
    const start = place(along, side * (ROAD_WIDTH / 2 + 2));
    world.teleportPlayer('p', vec3(start.x, start.y + 0.5, start.z));
    const events: WorldEvent[] = [];
    let ticks = 0;
    while (distance(me(world).pos.x, me(world).pos.z) < 40 && ticks < 90 * TICK_RATE) {
      events.push(...run(world, 1, { moveY: 1, yaw: yawOf(start.nx, start.nz) }));
      ticks++;
    }
    expect(distance(me(world).pos.x, me(world).pos.z)).toBeGreaterThanOrEqual(40);
    events.push(...run(world, 5 * TICK_RATE));
    const feet = me(world).pos;
    expect(events.filter((e) => e.kind === 'respawn' || e.kind === 'outOfBounds')).toEqual([]);
    expect(world.status().respawns).toBe(0);
    expect(feet.y).toBeGreaterThan(course.killPlaneY);
    expect(Math.abs(feet.y - corridorHeightAt(corridor, feet.x, feet.z)!)).toBeLessThan(0.6);
    expect(me(world).grounded).toBe(true);
  }, 30000);
});

describe('plan test 3: the ridge holds', () => {
  test('a player pushing outward from d = 90 for 10 s, jumping now and then, never passes d = 118', () => {
    const world = make();
    const along = alongOfSegment(straight);
    const start = place(along, 90);
    world.teleportPlayer('p', vec3(start.x, start.y + 0.5, start.z));
    let farthest = 0;
    for (let i = 0; i < 10 * TICK_RATE; i++) {
      run(world, 1, { moveY: 1, sprint: true, yaw: yawOf(start.nx, start.nz), jump: i % 40 < 3 });
      farthest = Math.max(farthest, distance(me(world).pos.x, me(world).pos.z));
    }
    expect(farthest).toBeLessThan(118);
    expect(world.status().respawns).toBe(0);
  }, 30000);
});

describe('plan test 4: out of bounds', () => {
  test('a player at d = 130 is back at d of about 13 within one tick, with an outOfBounds event and no cost', () => {
    const world = make();
    const start = place(alongOfSegment(straight), 130);
    world.teleportPlayer('p', vec3(start.x, start.y + 3, start.z));
    const events = run(world, 1);
    const event = events.find((e) => e.kind === 'outOfBounds');
    expect(event?.playerId).toBe('p');
    const feet = me(world).pos;
    expect(distance(feet.x, feet.z)).toBeCloseTo(ROAD_WIDTH / 2 + 8, 0);
    expect(event!.pos).toEqual(feet);
    // The player left on the right-hand side and lands there.
    expect(frame.nearest(feet.x, feet.z).d).toBeLessThan(OUT_OF_BOUNDS);
    expect(world.status().respawns).toBe(0);
    expect(me(world).health).toBe(PLAYER_MAX_HEALTH);
    run(world, TICK_RATE);
    expect(me(world).grounded).toBe(true);
  });

  test('the side the player left on is the side they land on', () => {
    for (const side of [-1, 1] as const) {
      const world = make();
      const along = alongOfSegment(straight);
      const start = place(along, side * 130);
      world.teleportPlayer('p', vec3(start.x, start.y + 3, start.z));
      run(world, 1);
      const feet = me(world).pos;
      const c = frame.pointAt(along);
      const lateral = (feet.x - c.x) * -c.tz + (feet.z - c.z) * c.tx;
      expect(Math.sign(lateral)).toBe(side);
    }
  });

  test('a downed player is moved and stays downed', () => {
    const world = make();
    world.addPlayer('q');
    const start = place(alongOfSegment(straight), 130);
    world.debugHurt('p', 1000);
    run(world, 1);
    expect(me(world).downed).not.toBeNull();
    world.teleportPlayer('p', vec3(start.x, start.y + 3, start.z));
    const events = run(world, 1);
    expect(events.some((e) => e.kind === 'outOfBounds')).toBe(true);
    expect(me(world).downed).not.toBeNull();
  });

  test('a vehicle whose centre is beyond OUT_OF_BOUNDS is lost: the checkpoint restart, penalty included', () => {
    const world = make();
    const body = world.debugBody('vehicle')!;
    const start = place(alongOfSegment(straight), 130);
    body.setTranslation({ x: start.x, y: start.y + 3, z: start.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const events = run(world, 1);
    expect(events.some((e) => e.kind === 'vehicleLost')).toBe(true);
    expect(world.status().restarts).toBe(1);
  });

  test('a vehicle just inside the line is not lost', () => {
    const world = make();
    const body = world.debugBody('vehicle')!;
    const start = place(alongOfSegment(straight), OUT_OF_BOUNDS - 3);
    body.setTranslation({ x: start.x, y: start.y + 3, z: start.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    run(world, 1);
    expect(world.status().restarts).toBe(0);
  });

  test('other courses have no out-of-bounds rule', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    worlds.push(world);
    world.addPlayer('p');
    world.teleportPlayer('p', vec3(500, 1, -500));
    expect(run(world, 3).some((e) => e.kind === 'outOfBounds')).toBe(false);
    expect(CORRIDOR_OUTER).toBeLessThan(OUT_OF_BOUNDS);
  });
});

// Pure pursuit toward a point `look` m ahead along the route at a lateral offset that follows `lateralAt(seconds)`.
describe('plan test 5: the Lodgy off the road and back', () => {
  test('drives 50 m off-road onto the corridor and back without falling, the wheels reporting sand', () => {
    const index = straight;
    const along0 = alongOfSegment(index, 0.1);
    const spawn = course.checkpoints[index]!.spawn;
    const rig = createRig(RAPIER, 'lodgy', spawn, course);
    rig.vehicle.resetTo(spawn, 1, 1);
    let sandSeen = 0;
    let farthest = 0;
    let lowest = Infinity;
    const lateralAt = (t: number): number => (t < 5 ? 0 : t < 14 ? 50 : 0);
    const seconds = 26;
    for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
      const state = rig.vehicle.state();
      const hit = frame.nearest(state.pos.x, state.pos.z);
      const target = frame.pointAt(Math.min(frame.total, hit.along + 14));
      const offset = lateralAt(tick * TICK_DT);
      const tx = target.x - target.tz * offset;
      const tz = target.z + target.tx * offset;
      const f = rotate(state.rot, vec3(0, 0, -1));
      const dx = tx - state.pos.x;
      const dz = tz - state.pos.z;
      const error = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
      rig.run(TICK_DT, { throttle: 0.6, steer: Math.max(-1, Math.min(1, 1.5 * error)) });
      farthest = Math.max(farthest, hit.d);
      lowest = Math.min(lowest, state.pos.y);
      if (hit.d > 33) sandSeen += rig.vehicle.wheelSurfaces().filter((s) => s === 'sand').length;
    }
    expect(along0).toBeGreaterThan(0);
    expect(farthest).toBeGreaterThan(40);
    expect(sandSeen).toBeGreaterThan(0);
    expect(lowest).toBeGreaterThan(course.killPlaneY);
    const end = rig.vehicle.state();
    expect(frame.nearest(end.pos.x, end.pos.z).d).toBeLessThan(8);
    rig.world.free();
  }, 60000);
});

describe('T10: obstacles stay obstacles', () => {
  // One place per kind, at a flat spot inside the obstacle's span: [name, along on the route].
  const roadAt = (index: number, along: number): number => alongOfSegment(index, 0) + along;
  const kinds: [string, number][] = [];
  def.segments.forEach((s, i) => {
    if (s.type === 'road') for (const h of s.hazards ?? []) kinds.push([`${h.kind} (segment ${i})`, roadAt(i, h.along)]);
    else if (s.type === 'pit' && s.depth >= 1) kinds.push([`deep pit (segment ${i})`, roadAt(i, 8)]);
    else if (s.type === 'bank' || s.type === 'ford' || s.type === 'alley' || s.type === 'roadworks') kinds.push([`${s.type} (segment ${i})`, roadAt(i, 10)]);
  });
  // The first of each kind.
  const firsts = kinds.filter(([name], i) => kinds.findIndex(([other]) => other.split(' ')[0] === name.split(' ')[0]) === i);

  test('every kind of obstacle on marrakech is covered', () => {
    expect(firsts.map(([name]) => name.split(' ')[0]).sort()).toEqual(['alley', 'bank', 'crateWall', 'deep', 'ford', 'gates', 'roadblock', 'roadworks']);
  });

  const drive = (along: number, side: -1 | 1): number => {
    const at = place(along, side * (ROAD_WIDTH / 2 + 5));
    const pose = { pos: vec3(at.x, at.y, at.z), rot: yawQuat(yawOf(at.nx, at.nz)) };
    const rig = createRig(RAPIER, 'lodgy', pose, course);
    rig.vehicle.resetTo(pose, 1, 1);
    let farthest = 0;
    for (let i = 0; i < 10 * TICK_RATE; i++) {
      rig.run(TICK_DT, { throttle: 1 });
      const p = rig.vehicle.state().pos;
      farthest = Math.max(farthest, frame.nearest(p.x, p.z).d);
    }
    rig.world.free();
    return farthest;
  };

  test('control: with no obstacle near, the same drive goes well past 40 m', () => {
    expect(drive(alongOfSegment(straight), 1)).toBeGreaterThan(60);
  });

  test.each(firsts)('a player sprinting and jumping outward beside the %s cannot pass d = 33', (_name, along) => {
    for (const side of [-1, 1] as const) {
      const world = make();
      const at = place(along, side * (ROAD_WIDTH / 2 + 3));
      world.teleportPlayer('p', vec3(at.x, at.y + 0.5, at.z));
      let farthest = 0;
      for (let i = 0; i < 20 * TICK_RATE; i++) {
        run(world, 1, { moveY: 1, sprint: true, yaw: yawOf(at.nx, at.nz), jump: i % 30 < 3 });
        farthest = Math.max(farthest, distance(me(world).pos.x, me(world).pos.z));
      }
      expect(farthest, `side ${side}`).toBeLessThan(33);
    }
  }, 60000);

  test.each(firsts)('the Lodgy driven at the land beside the %s stays on the road side of the berm', (_name, along) => {
    for (const side of [-1, 1] as const) {
      const farthest = drive(along, side);
      expect(farthest, `side ${side}`).toBeLessThan(40);
    }
  }, 60000);
});
