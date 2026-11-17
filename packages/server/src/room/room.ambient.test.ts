import RAPIER from '@dimforge/rapier3d-compat';
import {
  TICK_DT,
  buildCourse,
  hashSeed,
  planAmbient,
  type BuiltCourse,
  type ResultsMessage,
  type ServerMessage,
  type SnapshotMessage,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom } from './room';

beforeAll(async () => {
  await RAPIER.init();
});

const flagged = buildCourse({ id: 'amb', segments: [{ type: 'road', length: 800 }], targetTime: 100, ambient: true });
// The same course with no ambient spans, as every course but marrakech is.
const { ambient: _spans, ...plain } = flagged;
const unflagged: BuiltCourse = plain;

function play(course: BuiltCourse) {
  const room = createRoom(RAPIER, { noun: 'amb', campaign: ['amb', 'segment-demo'], courses: { amb: course } }, 0);
  const snapshots: SnapshotMessage[] = [];
  let results: ResultsMessage | null = null;
  const player = room.add('P1', 'token-1-abcdefghij', {
    send: (data) => {
      const message = JSON.parse(data) as ServerMessage;
      if (message.type === 'snapshot') snapshots.push(message);
      if (message.type === 'results') results = message;
    },
    close: () => {},
  });
  let time = 0;
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      time += TICK_DT;
      room.update(time);
    }
  };
  expect(room.start(player)).toBeNull();
  run(3);
  return { room, snapshots, run, results: () => results };
}

const firstEvent = planAmbient(hashSeed('amb'), flagged.ambient!.blocked.at(-1)!.to, flagged.ambient!.blocked)[0]!;

// The vehicle parks just before the first event, so the animal crosses through it and is hit.
function goToFirstEventAndFinish(game: ReturnType<typeof play>) {
  const body = game.room.debugWorld()!.debugBody('vehicle')!;
  body.setTranslation({ x: 0, y: 1, z: -(firstEvent.along - 1) }, true);
  game.run(300);
  const finish = flagged.finish.center;
  body.setTranslation({ x: finish.x, y: finish.y + 1, z: finish.z }, true);
  game.run(120);
}

test('T8: a room on a flagged course has ambient animals; one on an unflagged course has none', () => {
  const on = play(flagged);
  goToFirstEventAndFinish(on);
  expect(on.snapshots.some((s) => (s.animals?.length ?? 0) > 0)).toBe(true);
  on.room.dispose();

  const off = play(unflagged);
  goToFirstEventAndFinish(off);
  expect(off.snapshots.some((s) => 'animals' in s)).toBe(false);
  off.room.dispose();
});

test('T8: results, stars and final time are the same with and without animals', () => {
  const on = play(flagged);
  const off = play(unflagged);
  goToFirstEventAndFinish(on);
  goToFirstEventAndFinish(off);
  expect(on.results()).not.toBeNull();
  // The animal was hit in the flagged run; stars and final time do not read health, so the results match.
  expect(on.snapshots.some((s) => s.animals?.some((a) => a.hit))).toBe(true);
  expect(on.results()).toEqual(off.results());
  on.room.dispose();
  off.room.dispose();
});
