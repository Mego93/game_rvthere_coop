import RAPIER from '@dimforge/rapier3d-compat';
import { TICK_DT, WORLD_REBUILD_COOLDOWN, getCourse } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom } from './room';

// The server package's tests have no Node typings in scope.
declare const performance: { now(): number };
declare const console: { info(...args: unknown[]): void };
declare const process: { memoryUsage(): { rss: number; arrayBuffers: number } };

beforeAll(async () => {
  await RAPIER.init();
});

test('T17: two marrakech run worlds in one room: the build times and the memory growth are logged and the room runs on (the corridor is built when the room is created)', () => {
  const course = getCourse('marrakech');
  const room = createRoom(RAPIER, { noun: 'corridor', campaign: ['marrakech'] }, 0);
  const player = room.add('P1', 'token-1-abcdefghij', { send: () => {}, close: () => {} });
  let time = 0;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
      time += TICK_DT;
      room.update(time);
    }
  };
  const mb = (bytes: number) => `${(bytes / 1048576).toFixed(0)} MB`;
  // The course and its corridor are built first, as when a lobby is created for it.
  const before = process.memoryUsage();
  const t0 = performance.now();
  run(2);
  expect(room.start(player)).toBeNull();
  const first = performance.now() - t0;
  const afterFirst = process.memoryUsage();
  run(WORLD_REBUILD_COOLDOWN + 1);
  const t1 = performance.now();
  expect(room.restartCourse(player)).toBeNull();
  const second = performance.now() - t1;
  const afterSecond = process.memoryUsage();
  run(2);
  console.info(
    `T17: first start ${first.toFixed(0)} ms (corridor and course included), restart ${second.toFixed(0)} ms; arrayBuffers ${mb(before.arrayBuffers)} -> ${mb(afterFirst.arrayBuffers)} -> ${mb(afterSecond.arrayBuffers)}; rss ${mb(before.rss)} -> ${mb(afterFirst.rss)} -> ${mb(afterSecond.rss)}`,
  );
  expect(course.corridor).toBeDefined();
  expect(room.debugWorld()!.snapshot().tick).toBeGreaterThan(0);
  room.dispose();
});
