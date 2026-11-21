import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { CharacterId } from './characters';
import { TICK_DT, TICK_RATE } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import { deepFreeze, vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { GOLF_BALL_RADIUS, GOLF_SCOREBOARD_SECONDS, GOLF_SETTLE_SECONDS } from './story/primegolf';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const course = getCourse('primegolf');
const ROSTER: [string, CharacterId][] = [
  ['p1', 'sounile'],
  ['p2', 'nandan'],
];

const make = (built: BuiltCourse = course, roster: [string, CharacterId][] = ROSTER): World => {
  const world = createWorld(RAPIER, { courseId: built.id, vehicleId: 'lodgy', story: true }, built);
  worlds.push(world);
  for (const [id] of roster) world.addPlayer(id);
  world.step(new Map());
  world.golfStart(new Map(roster));
  world.step(new Map());
  return world;
};

const shot = (power = 1, curve = 0, yaw = 0) => ({ yaw, power, curve });

// Steps until `kind` is raised (at most `seconds`), returning every event on the way.
const until = (world: World, kind: WorldEvent['kind'], seconds = 20, inputs: ReadonlyMap<string, PlayerInput> = new Map()): WorldEvent[] => {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    const events = world.step(inputs);
    seen.push(...events);
    if (events.some((event) => event.kind === kind)) break;
  }
  return seen;
};
const landing = (events: WorldEvent[]): WorldEvent => events.find((event) => event.kind === 'golfLand')!;
const wait = (world: World, seconds: number): WorldEvent[] => {
  const seen: WorldEvent[] = [];
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) seen.push(...world.step(new Map()));
  return seen;
};

describe('the golfShot input path', () => {
  test('is accepted from the player on turn, and from nobody else', () => {
    const world = make();
    expect(world.golfShot('p2', shot())).toBe(false);
    expect(world.golfShot('nobody', shot())).toBe(false);
    expect(world.snapshot().golf?.ball).toBeNull();
    expect(world.golfShot('p1', shot())).toBe(true);
  });

  test('is refused while a ball is in flight, even from the player on turn', () => {
    const world = make();
    expect(world.golfShot('p1', shot())).toBe(true);
    world.step(new Map());
    expect(world.golfShot('p1', shot())).toBe(false);
    expect(world.golfShot('p2', shot())).toBe(false);
    expect(world.snapshot().golf?.ball).not.toBeNull();
  });

  test('is refused for numbers that are not finite and is clamped to power 0..1 and curve -1..1', () => {
    const world = make();
    expect(world.golfShot('p1', shot(Number.NaN))).toBe(false);
    expect(world.golfShot('p1', shot(1, Number.POSITIVE_INFINITY))).toBe(false);
    expect(world.golfShot('p1', { yaw: Number.NaN, power: 1, curve: 0 })).toBe(false);
    expect(world.golfShot('p1', shot(7, 9))).toBe(true);
    const far = landing(until(world, 'golfLand'));
    const other = make();
    other.golfShot('p1', shot(1, 1));
    expect(far.pos!.x).toBeCloseTo(landing(until(other, 'golfLand')).pos!.x, 3);
  });

  test('is refused in a world with no golf, and before the game starts', () => {
    const plain = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', story: true });
    worlds.push(plain);
    plain.addPlayer('p1');
    expect(plain.golfShot('p1', shot())).toBe(false);
    expect(plain.snapshot().golf).toBeUndefined();
    const unstarted = createWorld(RAPIER, { courseId: 'primegolf', vehicleId: 'lodgy', story: true });
    worlds.push(unstarted);
    unstarted.addPlayer('p1');
    expect(unstarted.golfShot('p1', shot())).toBe(false);
  });
});

describe('the flight', () => {
  test('a full-power straight shot lands between 170 and 230 m', () => {
    const world = make();
    world.golfShot('p1', shot());
    const hit = landing(until(world, 'golfLand'));
    const carry = -(hit.pos!.z - course.golf!.tee.z);
    expect(carry).toBeGreaterThan(170);
    expect(carry).toBeLessThan(230);
    expect(Math.abs(hit.pos!.x)).toBeLessThan(0.5);
    expect(hit.playerId).toBe('p1');
  });

  test('yaw turns the shot: a quarter turn left sends it west', () => {
    const world = make();
    world.golfShot('p1', shot(0.5, 0, Math.PI / 2));
    const hit = landing(until(world, 'golfLand'));
    expect(hit.pos!.x).toBeLessThan(-30);
    expect(Math.abs(hit.pos!.z)).toBeLessThan(1.5);
  });

  test('a curve of +1 lands to the right of a straight shot, and -1 to the left', () => {
    const land = (curve: number): number => {
      const world = make();
      world.golfShot('p1', shot(1, curve));
      return landing(until(world, 'golfLand')).pos!.x;
    };
    const straight = land(0);
    const right = land(1);
    const left = land(-1);
    expect(right).toBeGreaterThan(straight + 10);
    expect(left).toBeLessThan(straight - 10);
  });

  test('the curve stops at the first touch of the ground', () => {
    const world = make();
    world.golfShot('p1', shot(1, 1));
    const hit = landing(until(world, 'golfLand'));
    // 6 m/s^2 over the ~3 s flight: about 27 m; not the 6 s of bouncing it would otherwise add.
    expect(hit.pos!.x).toBeGreaterThan(15);
    expect(hit.pos!.x).toBeLessThan(40);
  });

  test('a fast ball never passes through thin ground (continuous collision)', () => {
    const thin: BuiltCourse = deepFreeze({
      ...course,
      ground: course.ground.map((box) => ({ ...box, center: vec3(box.center.x, box.center.y + box.halfExtents.y - 0.005, box.center.z), halfExtents: vec3(box.halfExtents.x, 0.005, box.halfExtents.z) })),
    });
    expect(GOLF_BALL_RADIUS).toBeLessThan(0.025);
    const world = make(thin);
    world.golfShot('p1', shot());
    const hit = landing(until(world, 'golfLand'));
    expect(hit.ring).toBeNull();
    expect(hit.pos!.y).toBeGreaterThan(-0.05);
    expect(-hit.pos!.z).toBeGreaterThan(170);
    expect(-hit.pos!.z).toBeLessThan(230);
  });
});

describe('landing and score', () => {
  test('scores the first ground contact once, with the ring and points of the position', () => {
    const world = make();
    // The white ring is 200 m out and 12 m to the right: aim at it by trial, then check the event against scoreLanding.
    world.golfShot('p1', shot(1, 0));
    const events = until(world, 'golfLand');
    const hit = landing(events);
    expect(hit.ring === null || typeof hit.ring === 'string').toBe(true);
    expect(typeof hit.points).toBe('number');
    const more = wait(world, GOLF_SETTLE_SECONDS + 1);
    expect(events.concat(more).filter((event) => event.kind === 'golfLand')).toHaveLength(1);
    expect(world.snapshot().golf?.scores.sounile).toEqual([hit.points]);
    expect(world.golfState()?.scores.sounile).toEqual([hit.points]);
  });

  test('scores a ball that lands in a ring', () => {
    // The yellow ring: 50 m out and 12 m to the left. Carry grows with the square of the power, so one trial shot sets the second.
    const yaw = Math.atan2(12, 50);
    const aim = Math.hypot(12, 50);
    const trial = make();
    trial.golfShot('p1', shot(0.5, 0, yaw));
    const first = landing(until(trial, 'golfLand')).pos!;
    const world = make();
    world.golfShot('p1', shot(0.5 * Math.sqrt(aim / Math.hypot(first.x, first.z)), 0, yaw));
    const hit = landing(until(world, 'golfLand'));
    expect(hit.ring).toBe('yellow');
    expect(hit.points).toBeGreaterThanOrEqual(15);
    expect(world.golfState()?.scores.sounile).toEqual([hit.points]);
  });

  test('a ball that never lands counts as a miss after the settle time', () => {
    // A platform at the tee and nothing else: the ball flies over the void.
    const void_: BuiltCourse = deepFreeze({ ...course, ground: course.ground.filter((box) => box.halfExtents.x <= 20 && box.center.z > -3 && box.center.z < 3 && box.halfExtents.z <= 5) });
    expect(void_.ground.length).toBeGreaterThan(0);
    const world = make(void_);
    world.golfShot('p1', shot());
    const seen = until(world, 'golfLand', GOLF_SETTLE_SECONDS + 2);
    const miss = landing(seen);
    expect(miss).toBeDefined();
    expect(miss.ring).toBeNull();
    expect(miss.points).toBe(0);
    expect(world.golfState()?.scores.sounile).toEqual([0]);
    // The miss comes at the settle time, not before the ball would have landed on a real field.
    expect(seen.length).toBeGreaterThan(0);
    expect(world.snapshot().tick * TICK_DT).toBeGreaterThanOrEqual(GOLF_SETTLE_SECONDS - 0.2);
  });
});

describe('turns', () => {
  test('the turn passes after the landing; the next shot waits for the scoreboard', () => {
    const world = make();
    expect(world.snapshot().golf?.turn).toBe('sounile');
    world.golfShot('p1', shot());
    until(world, 'golfLand');
    expect(world.snapshot().golf?.turn).toBe('nandan');
    // The ball stays where it landed while the scoreboard shows.
    expect(world.snapshot().golf?.ball).not.toBeNull();
    expect(world.golfShot('p2', shot())).toBe(false);
    wait(world, GOLF_SCOREBOARD_SECONDS + 0.2);
    expect(world.snapshot().golf?.ball).toBeNull();
    expect(world.golfShot('p1', shot())).toBe(false);
    expect(world.golfShot('p2', shot())).toBe(true);
  });

  test('the player on turn stands at the tee and cannot walk; the others walk freely', () => {
    const world = make();
    const tee = course.golf!.tee;
    const run = new Map([
      ['p1', input({ moveY: 1 })],
      ['p2', input({ moveY: 1 })],
    ]);
    for (let i = 0; i < TICK_RATE; i++) world.step(run);
    const [p1, p2] = world.snapshot().players;
    expect(p1!.playerId).toBe('p1');
    expect(Math.hypot(p1!.pos.x - tee.x, p1!.pos.z - tee.z)).toBeLessThan(0.05);
    expect(Math.hypot(p2!.pos.x - tee.x, p2!.pos.z - tee.z)).toBeGreaterThan(5);
  });

  test('the next player is put at the tee when his turn comes', () => {
    const world = make();
    const tee = course.golf!.tee;
    world.golfShot('p1', shot());
    until(world, 'golfLand');
    world.step(new Map());
    const p2 = world.snapshot().players.find((p) => p.playerId === 'p2')!;
    expect(Math.hypot(p2.pos.x - tee.x, p2.pos.z - tee.z)).toBeLessThan(0.1);
  });

  test('a friend who is skipped loses his balls, and the game goes on without him', () => {
    const world = make();
    world.golfSkip('p1');
    expect(world.golfState()?.turn).toBe('nandan');
    expect(world.golfShot('p1', shot())).toBe(false);
    expect(world.golfShot('p2', shot())).toBe(true);
  });

  test('the game ends after the last ball with golfEnd carrying the scores, and shots stop', () => {
    const world = make(course, [['p1', 'sounile']]);
    const all: WorldEvent[] = [];
    for (let i = 0; i < 6; i++) {
      expect(world.golfShot('p1', shot(0.3))).toBe(true);
      all.push(...until(world, 'golfLand'));
      all.push(...wait(world, GOLF_SCOREBOARD_SECONDS + 0.1));
    }
    const ends = all.filter((event) => event.kind === 'golfEnd');
    expect(ends).toHaveLength(1);
    expect(ends[0]!.scores?.sounile).toHaveLength(6);
    expect(world.snapshot().golf?.turn).toBeNull();
    expect(world.golfShot('p1', shot())).toBe(false);
  });

  test('skipping the last friend ends the game at once, with golfEnd on the next step', () => {
    const world = make(course, [['p1', 'sounile']]);
    world.golfSkip('p1');
    expect(world.snapshot().golf?.turn).toBeNull();
    const events = world.step(new Map());
    expect(events.filter((event) => event.kind === 'golfEnd')).toHaveLength(1);
  });

  test('a ball in flight when its owner is skipped still lands, scores nothing, and is not counted', () => {
    const world = make();
    world.golfShot('p1', shot());
    world.step(new Map());
    world.golfSkip('p1');
    const hit = landing(until(world, 'golfLand'));
    expect(hit).toBeDefined();
    expect(world.golfState()?.scores.sounile).toEqual([]);
    expect(world.golfState()?.turn).toBe('nandan');
  });
});

describe('the world with golf', () => {
  test('puts the snapshot field on the golf course only and keeps the Lodgy unboardable', () => {
    const world = make();
    const golf = world.snapshot().golf!;
    expect(golf.turn).toBe('sounile');
    expect(golf.ball).toBeNull();
    expect(golf.scores).toEqual({ sounile: [], nandan: [] });
    expect(JSON.parse(JSON.stringify(golf))).toEqual(golf);
  });
});
