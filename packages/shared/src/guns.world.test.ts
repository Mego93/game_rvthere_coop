import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AMMO_BOX_ROUNDS, AMMO_MAX, GUN_AMMO_START, GUN_COOLDOWN, GUN_RANGE, HOLD_DURATION, PLAYER_CONTROLLER_OFFSET, PLAYER_EYE_HEIGHT, TICK_RATE } from './constants';
import { testGround } from './courses/testGround';
import { IDENTITY, vec3 } from './math';
import { NEUTRAL_INPUT, parseClientMessage, type PlayerInput } from './protocol';
import { withBoxes } from './testRig';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const OPEN = vec3(0, PLAYER_CONTROLLER_OFFSET, -90);
const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const me = (world: World) => world.snapshot().players.find((player) => player.playerId === 'p')!;

function make(course?: Parameters<typeof createWorld>[2]): World {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
  worlds.push(world);
  world.addPlayer('p');
  world.teleportPlayer('p', OPEN);
  for (let i = 0; i < 30; i++) world.step(new Map());
  return world;
}

const walled = () => withBoxes(testGround, { walls: [{ center: vec3(OPEN.x, 1.5, OPEN.z - 10), halfExtents: vec3(5, 1.5, 0.5), rot: IDENTITY }] });

// Ticks of the world with fire held; returns the shots.
function fire(world: World, ticks: number, fields: Partial<PlayerInput> = {}): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(new Map([['p', input({ fire: true, ...fields })]])));
  return events.filter((e) => e.kind === 'shot');
}

describe('step 39 rule 2: guns', () => {
  test('every player starts with a gun and GUN_AMMO_START rounds', () => {
    const world = make();
    expect(me(world)).toMatchObject({ gun: true, ammo: GUN_AMMO_START });
  });

  test('a shot is a ray from the eye along yaw and pitch: it ends at a wall, or at GUN_RANGE in the open', () => {
    const world = make(walled());
    const [wall] = fire(world, 1);
    expect(wall!.playerId).toBe('p');
    expect(wall!.hit).toBe(false);
    expect(wall!.pos!.y).toBeCloseTo(OPEN.y + PLAYER_EYE_HEIGHT, 2);
    expect(wall!.to!.z).toBeCloseTo(OPEN.z - 9.5, 3);
    expect(wall!.to!.y).toBeCloseTo(OPEN.y + PLAYER_EYE_HEIGHT, 2);

    const world2 = make();
    world2.step(new Map());
    const [open] = fire(world2, 1, { yaw: Math.PI });
    expect(Math.hypot(open!.to!.x - open!.pos!.x, open!.to!.z - open!.pos!.z)).toBeCloseTo(GUN_RANGE, 3);
    expect(open!.to!.z).toBeGreaterThan(open!.pos!.z);
  });

  test('aiming down ends the shot on the ground', () => {
    const world = make();
    const [shot] = fire(world, 1, { pitch: -Math.PI / 4 });
    expect(shot!.to!.y).toBeCloseTo(0, 1);
    expect(shot!.to!.y).toBeLessThan(shot!.pos!.y);
  });

  test('the vehicle blocks a shot', () => {
    const world = make();
    const body = world.debugBody('vehicle')!;
    const t = body.translation();
    world.teleportPlayer('p', vec3(t.x, PLAYER_CONTROLLER_OFFSET, t.z + 12));
    world.step(new Map());
    const [shot] = fire(world, 1, { pitch: 0 });
    expect(shot!.to!.z).toBeGreaterThan(t.z);
    expect(Math.abs(shot!.to!.x - t.x)).toBeLessThan(3);
  });

  test('holding fire shoots once per GUN_COOLDOWN and costs a round each', () => {
    const world = make();
    const shots = fire(world, Math.round(1 * TICK_RATE));
    const expected = Math.floor(1 / GUN_COOLDOWN) + 1;
    expect(shots.length).toBe(expected);
    expect(me(world).ammo).toBe(GUN_AMMO_START - expected);
  });

  test('without ammo there is no shot, and the admin infinite toggle keeps the ammo', () => {
    const world = make();
    fire(world, 12 * 20);
    expect(me(world).ammo).toBe(0);
    expect(fire(world, 30)).toHaveLength(0);

    const rich = make();
    expect(rich.adminTool('infinite', 'p')).toBe(true);
    const shots = fire(rich, 2 * TICK_RATE);
    expect(shots.length).toBeGreaterThan(5);
    expect(me(rich).ammo).toBe(GUN_AMMO_START);
  });

  test('refused while seated, flying, downed or respawning', () => {
    const probe = (world: World) => fire(world, 20).length;

    const seated = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    worlds.push(seated);
    seated.addPlayer('p');
    for (let i = 0; i < 10; i++) seated.step(new Map());
    seated.step(new Map([['p', input({ interact: true })]]));
    seated.step(new Map());
    expect(me(seated).seat).not.toBeNull();
    expect(probe(seated)).toBe(0);
    expect(me(seated).ammo).toBe(GUN_AMMO_START);

    const flying = make();
    expect(flying.adminTool('fly', 'p')).toBe(true);
    expect(probe(flying)).toBe(0);

    const downed = make();
    downed.addPlayer('q');
    downed.teleportPlayer('q', vec3(OPEN.x + 20, PLAYER_CONTROLLER_OFFSET, OPEN.z));
    for (let i = 0; i < 5; i++) downed.step(new Map());
    downed.debugHurt('p', 100);
    downed.step(new Map());
    expect(me(downed).downed).not.toBeNull();
    expect(probe(downed)).toBe(0);

    const below = make();
    below.teleportPlayer('p', vec3(OPEN.x, -500, OPEN.z));
    for (let i = 0; i < 3; i++) below.step(new Map());
    expect(probe(below)).toBe(0);
  });

  test('refused while carrying a prop', () => {
    const world = make();
    world.teleportPlayer('p', vec3(10, PLAYER_CONTROLLER_OFFSET, 6.5));
    for (let i = 0; i < 5; i++) world.step(new Map());
    world.step(new Map([['p', input({ interact: true, yaw: Math.PI })]]));
    world.step(new Map([['p', input({ yaw: Math.PI })]]));
    expect(me(world).hands).not.toBeNull();
    expect(fire(world, 20, { yaw: Math.PI })).toHaveLength(0);
  });

  test('an ammo box adds AMMO_BOX_ROUNDS, capped at AMMO_MAX, and is consumed', () => {
    const world = make();
    world.debugSetInventory('p', ['ammo', 'ammo', null]);
    const events: WorldEvent[] = [];
    const use = (slot: 0 | 1) => {
      for (let i = 0; i < Math.round(HOLD_DURATION * TICK_RATE) + 2; i++) events.push(...world.step(new Map([['p', input({ use: true, slot })]])));
      world.step(new Map());
    };
    use(0);
    expect(me(world).ammo).toBe(GUN_AMMO_START + AMMO_BOX_ROUNDS);
    expect(me(world).inventory).toEqual([null, 'ammo', null]);
    expect(events.find((e) => e.kind === 'eat')).toMatchObject({ item: 'ammo' });
    for (let i = 0; i < 4; i++) {
      world.debugSetInventory('p', ['ammo', null, null]);
      use(0);
    }
    expect(me(world).ammo).toBe(AMMO_MAX);
  });

  test('a shot hurts no player: the ray passes through a teammate', () => {
    const world = make();
    world.addPlayer('q');
    world.teleportPlayer('q', vec3(OPEN.x, PLAYER_CONTROLLER_OFFSET, OPEN.z - 4));
    for (let i = 0; i < 5; i++) world.step(new Map());
    const [shot] = fire(world, 1);
    expect(shot!.hit).toBe(false);
    expect(shot!.to!.z).toBeLessThan(OPEN.z - 4 - 1);
    expect(world.snapshot().players.find((p) => p.playerId === 'q')!.health).toBe(100);
  });

  test('the fire field is an optional boolean on the wire', () => {
    const base = { type: 'input', seq: 1, moveX: 0, moveY: 0, yaw: 0, pitch: 0, jump: false, interact: false, use: false, reel: 0, slot: 0, drop: false };
    expect(parseClientMessage(JSON.stringify({ ...base, fire: true }))).toMatchObject({ fire: true });
    expect(parseClientMessage(JSON.stringify(base))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...base, fire: 1 }))).toBeNull();
  });
});
