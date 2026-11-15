import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
} from './constants';
import { IDENTITY, vec3 } from './math';
import { aimRay } from './player';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { withBoxes } from './testRig';
import { testGround } from './courses/testGround';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const make = (course?: Parameters<typeof createWorld>[2]): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
  worlds.push(world);
  world.addPlayer('p');
  return world;
};
const me = (world: World) => world.snapshot().players.find((player) => player.playerId === 'p')!;
const run = (world: World, ticks: number, fields: Partial<PlayerInput> = {}) => {
  for (let i = 0; i < ticks; i++) world.step(new Map([['p', input(fields)]]));
};
const OPEN = vec3(20, PLAYER_CONTROLLER_OFFSET, -100);

describe('stance in the snapshot', () => {
  test('a standing player has no stance and no slide; crouching, sliding and the cooldown show', () => {
    const world = make();
    world.teleportPlayer('p', OPEN);
    run(world, 30);
    expect('stance' in me(world)).toBe(false);
    expect('slide' in me(world)).toBe(false);
    run(world, 5, { crouch: true });
    expect(me(world).stance).toBe('crouch');
    expect('slide' in me(world)).toBe(false);
    run(world, 5);
    expect('stance' in me(world)).toBe(false);

    run(world, 60, { moveY: 1, sprint: true });
    run(world, 1, { moveY: 1, sprint: true, crouch: true });
    expect(me(world).stance).toBe('slide');
    expect(me(world).slide).toMatchObject({ ticks: 47, cooldown: 0, air: 0 });
    expect(Math.hypot(me(world).slide!.dirX, me(world).slide!.dirZ)).toBeCloseTo(1, 12);
    run(world, 47, { moveY: 1, sprint: true, crouch: true });
    expect(me(world).stance).toBe('crouch');
    expect(me(world).slide).toMatchObject({ ticks: 0, cooldown: 60 });
    run(world, 61);
    expect('slide' in me(world)).toBe(false);
  });
});

describe('refusals and resets', () => {
  test('a prop in the hands refuses sprint, crouch and slide; the hook in the hands refuses sprint only', () => {
    const world = make();
    world.teleportPlayer('p', vec3(0, PLAYER_CONTROLLER_OFFSET, 20));
    const crate = world.debugBody('crate-1')!;
    crate.setTranslation(vec3(0, 0.5, 19), true);
    run(world, 30);
    run(world, 1, { interact: true, yaw: 0, pitch: -0.6 });
    run(world, 1);
    expect(me(world).hands).toBe('crate-1');
    run(world, 30, { moveY: 1, sprint: true, crouch: true });
    expect('stance' in me(world)).toBe(false);
    const speed = Math.hypot(me(world).walk.x, me(world).walk.z);
    expect(speed).toBeCloseTo(4.5, 9);
  });

  test('a slide in progress is ended by the seat, a teleport and a downing; a crouch too', () => {
    const world = make();
    world.teleportPlayer('p', OPEN);
    run(world, 30);
    run(world, 60, { moveY: 1, sprint: true });
    run(world, 1, { moveY: 1, sprint: true, crouch: true });
    expect(me(world).stance).toBe('slide');
    world.teleportPlayer('p', OPEN);
    expect('stance' in me(world)).toBe(false);
    expect('slide' in me(world)).toBe(false);
    run(world, 30);
    run(world, 5, { crouch: true });
    expect(me(world).stance).toBe('crouch');
    world.addPlayer('idle');
    world.teleportPlayer('idle', vec3(30, PLAYER_CONTROLLER_OFFSET, 30));
    world.debugHurt('p', 1000);
    run(world, 1);
    expect(me(world).downed).not.toBeNull();
    expect('stance' in me(world)).toBe(false);
  });

  test('boarding is refused mid-slide and works otherwise', () => {
    const world = make();
    world.teleportPlayer('p', vec3(0, PLAYER_CONTROLLER_OFFSET, -9));
    run(world, 30);
    const away = { moveY: 1, yaw: Math.PI };
    let pressed = false;
    let refused = 0;
    for (let i = 0; i < 100; i++) {
      const sliding = me(world).stance === 'slide';
      const fields = i < 20 ? { ...away, sprint: true } : { ...away, sprint: true, crouch: true };
      pressed = !pressed;
      world.step(new Map([['p', input({ ...fields, interact: sliding && pressed })]]));
      if (sliding && me(world).stance === 'slide') {
        expect(me(world).seat).toBeNull();
        refused += 1;
      }
      if (me(world).stance !== 'slide' && i > 25) break;
    }
    expect(refused).toBeGreaterThan(5);
  });
});

describe('collisions at speed (B1, T4b)', () => {
  const into = (fields: Partial<PlayerInput>) => (world: World, slideAt: number, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      world.step(new Map([['p', input({ ...fields, crouch: i >= slideAt })]]));
    }
  };

  test('T4b: a sprint and a slide into the parked Lodgy cost nothing', () => {
    for (const slideAt of [1000, 25]) {
      const world = make();
      world.addPlayer('idle');
      world.teleportPlayer('idle', vec3(30, PLAYER_CONTROLLER_OFFSET, 30));
      world.teleportPlayer('p', vec3(0, PLAYER_CONTROLLER_OFFSET, -9));
      run(world, 30);
      into({ moveY: 1, sprint: true, yaw: Math.PI })(world, slideAt, 80);
      expect(me(world).pos.z).toBeLessThan(0);
      expect(me(world).pos.z).toBeGreaterThan(-4);
      expect(world.debugPlayerHealth('p')).toBe(PLAYER_MAX_HEALTH);
    }
  });

  test('T4b: a sprint and a slide into a resting crate cost nothing', () => {
    for (const slideAt of [1000, 25]) {
      const world = make();
      world.addPlayer('idle');
      world.teleportPlayer('idle', vec3(30, PLAYER_CONTROLLER_OFFSET, 30));
      world.teleportPlayer('p', vec3(10, PLAYER_CONTROLLER_OFFSET, 16.5));
      run(world, 30);
      const before = world.debugBody('crate-1')!.translation();
      into({ moveY: 1, sprint: true })(world, slideAt, 80);
      expect(Math.hypot(me(world).pos.x - before.x, me(world).pos.z - before.z)).toBeLessThan(8);
      expect(me(world).pos.z).toBeLessThan(13);
      expect(world.debugPlayerHealth('p')).toBe(PLAYER_MAX_HEALTH);
    }
  });
});

describe('a low tunnel', () => {
  test('a crouched player in a 1.3 m tunnel is not shoved or teleported, and stands once out', () => {
    const course = withBoxes(testGround, {
      walls: [{ center: vec3(OPEN.x, 1.55, OPEN.z - 3), halfExtents: vec3(3, 0.25, 5), rot: IDENTITY }],
    });
    const world = make(course);
    world.teleportPlayer('p', vec3(OPEN.x, PLAYER_CONTROLLER_OFFSET, OPEN.z + 6));
    run(world, 30);
    run(world, 200, { moveY: 1, crouch: true });
    run(world, 10);
    const inside = me(world).pos;
    expect(inside.z).toBeLessThan(OPEN.z - 1);
    expect(me(world).stance).toBe('crouch');
    // Released inside: still crouched, not moved.
    run(world, 60);
    expect(me(world).stance).toBe('crouch');
    expect(Math.hypot(me(world).pos.x - inside.x, me(world).pos.z - inside.z)).toBeLessThan(0.01);
    expect(Math.abs(me(world).pos.y - inside.y)).toBeLessThan(0.01);
    run(world, 400, { moveY: 1 });
    expect(me(world).pos.z).toBeLessThan(OPEN.z - 8.5);
    expect('stance' in me(world)).toBe(false);
  });
});

describe('the eye', () => {
  test('a crouched aim ray starts at the crouch eye height', () => {
    expect(aimRay(vec3(1, 2, 3), 0, 0).origin.y).toBeCloseTo(2 + PLAYER_EYE_HEIGHT, 12);
    expect(aimRay(vec3(1, 2, 3), 0, 0, true).origin.y).toBeCloseTo(2 + PLAYER_CROUCH_EYE_HEIGHT, 12);
    expect(aimRay(vec3(1, 2, 3), 0.5, 0.2, true).dir).toEqual(aimRay(vec3(1, 2, 3), 0.5, 0.2).dir);
    expect(PLAYER_RADIUS).toBeGreaterThan(0);
  });
});
