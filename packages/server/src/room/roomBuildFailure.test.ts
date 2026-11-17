import RAPIER from '@dimforge/rapier3d-compat';
import { buildCourse, type World } from '@lodgy/shared';
import { beforeAll, expect, test, vi } from 'vitest';

// Every world the room builds, so that a test can see which were disposed; the next built world fails when `failNext` is set.
const built: { world: World; dispose: ReturnType<typeof vi.fn> }[] = [];
const control = { failNext: false };

vi.mock('@lodgy/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('@lodgy/shared')>();
  return {
    ...shared,
    createWorld: (...args: Parameters<typeof shared.createWorld>) => {
      const real = shared.createWorld(...args);
      const dispose = vi.fn(() => real.dispose());
      const fails = control.failNext;
      control.failNext = false;
      const world = {
        ...real,
        dispose,
        recordStart: () => {
          if (fails) throw new Error('recordStart failed');
          real.recordStart();
        },
      } as World;
      built.push({ world, dispose });
      return world;
    },
  };
});

const { createRoom } = await import('./room');

beforeAll(async () => {
  await RAPIER.init();
});

const connection = { send: () => {}, close: () => {} };
const token = 'token-1-abcdefghij';

test('a start whose world fails to build disposes the half-built world, rethrows, and leaves the lobby intact', () => {
  built.length = 0;
  const room = createRoom(RAPIER, { noun: 'test' }, 0);
  const admin = room.add('Amal', token, connection);
  control.failNext = true;
  expect(() => room.start(admin)).toThrow('recordStart failed');
  expect(built).toHaveLength(1);
  expect(built[0]!.dispose).toHaveBeenCalledTimes(1);
  expect(room.phase()).toBe('lobby');
  expect(room.debugWorld()).toBeNull();

  expect(room.start(admin)).toBeNull();
  expect(room.phase()).toBe('playing');
  expect(room.debugWorld()).toBe(built[1]!.world);
  room.dispose();
});

test('a restartCourse whose world fails to build disposes the half-built world and keeps the running one', () => {
  built.length = 0;
  const room = createRoom(RAPIER, { noun: 'test' }, 0);
  const admin = room.add('Amal', token, connection);
  expect(room.start(admin)).toBeNull();
  const running = room.debugWorld()!;
  room.update(1);
  control.failNext = true;
  expect(() => room.restartCourse(admin)).toThrow('recordStart failed');
  expect(built).toHaveLength(2);
  expect(built[1]!.dispose).toHaveBeenCalledTimes(1);
  expect(built[0]!.dispose).not.toHaveBeenCalled();
  expect(room.phase()).toBe('playing');
  expect(room.debugWorld()).toBe(running);
  room.update(1.5);
  expect(running.snapshot().tick).toBeGreaterThan(0);

  expect(room.restartCourse(admin)).toBeNull();
  expect(built[0]!.dispose).toHaveBeenCalledTimes(1);
  expect(room.debugWorld()).toBe(built[2]!.world);
  room.dispose();
});

test('a failed start does not use up a run number: the next start has run 1\'s item layout', () => {
  const course = buildCourse({ id: 'drops', segments: Array.from({ length: 6 }, () => ({ type: 'road' as const, length: 300 })), targetTime: 400, ambient: true });
  const layoutOf = (room: ReturnType<typeof createRoom>) => {
    const world = room.debugWorld()!;
    const body = world.debugBody('vehicle')!;
    const seen = new Set<string>();
    for (let along = 20; along < 1700; along += 100) {
      body.setTranslation({ x: 0, y: 1, z: -along }, true);
      for (let i = 0; i < 2; i++) world.step(new Map());
      for (const prop of world.snapshot().props) if (/^item-\d+$/.test(prop.id)) seen.add(`${prop.kind}@${Math.round(prop.pos.z)}`);
    }
    return [...seen].sort();
  };
  const first = createRoom(RAPIER, { noun: 'a', campaign: ['drops', 'segment-demo'], courses: { drops: course } }, 0);
  expect(first.start(first.add('Amal', token, connection))).toBeNull();
  const expected = layoutOf(first);
  expect(expected.length).toBeGreaterThan(0);
  first.dispose();

  const room = createRoom(RAPIER, { noun: 'b', campaign: ['drops', 'segment-demo'], courses: { drops: course } }, 0);
  const admin = room.add('Amal', token, connection);
  control.failNext = true;
  expect(() => room.start(admin)).toThrow('recordStart failed');
  expect(room.start(admin)).toBeNull();
  expect(layoutOf(room)).toEqual(expected);
  room.dispose();
});
