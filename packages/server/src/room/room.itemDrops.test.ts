import RAPIER from '@dimforge/rapier3d-compat';
import { TICK_DT, buildCourse, type BuiltCourse } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom, type Room } from './room';

beforeAll(async () => {
  await RAPIER.init();
});

const flagged = buildCourse({ id: 'drops', segments: Array.from({ length: 12 }, () => ({ type: 'road' as const, length: 300 })), targetTime: 400, ambient: true });
const { ambient: _spans, ...plain } = flagged;
const unflagged: BuiltCourse = plain;

function make(course: BuiltCourse, noun = 'drops') {
  const room = createRoom(RAPIER, { noun, campaign: ['drops', 'segment-demo'], courses: { drops: course } }, 0);
  const player = room.add('P1', 'token-1-abcdefghij', { send: () => {}, close: () => {} });
  let time = 0;
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      time += TICK_DT;
      room.update(time);
    }
  };
  const seconds = (s: number) => run(Math.round(s / TICK_DT));
  return { room, player, run, seconds };
}

// The kinds and positions of the drops seen while the vehicle is moved along the first 3.6 km.
function layout(game: ReturnType<typeof make>): string[] {
  const seen = new Set<string>();
  const body = game.room.debugWorld()!.debugBody('vehicle')!;
  for (let along = 20; along < 3400; along += 100) {
    body.setTranslation({ x: 0, y: 1, z: -along }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    game.run(2);
    for (const prop of game.room.debugWorld()!.snapshot().props) if (/^item-\d+$/.test(prop.id)) seen.add(`${prop.kind}@${Math.round(prop.pos.z)}`);
  }
  return [...seen].sort();
}

function started(room: Room, player: ReturnType<Room['add']>, seconds: (s: number) => void) {
  expect(room.start(player)).toBeNull();
  seconds(2);
}

test('T5: two runs of the same room differ, a course restart keeps the layout, and a room off the ambient courses has no drops', () => {
  const game = make(flagged);
  started(game.room, game.player, game.seconds);
  const first = layout(game);
  expect(first.length).toBeGreaterThan(2);
  expect(game.room.restartCourse(game.player)).toBeNull();
  game.seconds(2);
  expect(layout(game)).toEqual(first);
  expect(game.room.toLobby(game.player)).toBeNull();
  game.seconds(2);
  started(game.room, game.player, game.seconds);
  expect(layout(game)).not.toEqual(first);
  game.room.dispose();

  const off = make(unflagged);
  started(off.room, off.player, off.seconds);
  expect(layout(off)).toEqual([]);
  off.room.dispose();
});

test('T5: the same run number in two rooms gives the same layout', () => {
  const a = make(flagged, 'alpha');
  const b = make(flagged, 'bravo');
  started(a.room, a.player, a.seconds);
  started(b.room, b.player, b.seconds);
  expect(layout(a)).toEqual(layout(b));
  a.room.dispose();
  b.room.dispose();
});
