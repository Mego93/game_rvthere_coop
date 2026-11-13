import RAPIER from '@dimforge/rapier3d-compat';
import {
  IDENTITY,
  NEUTRAL_INPUT,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  getCourse,
  vec3,
  type BuiltCourse,
  type ServerMessage,
  type SnapshotMessage,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom, type Room } from './room';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;

function course(lift: number, extra: BuiltCourse['props'] = []): BuiltCourse {
  const base = getCourse('test');
  const props = base.props.map((prop) =>
    prop.id === 'crate-1' ? { ...prop, pose: { ...prop.pose, pos: vec3(prop.pose.pos.x, prop.pose.pos.y + lift, prop.pose.pos.z) } } : prop,
  );
  // The test ground's pickups are left out: these tests are about props.
  return { ...base, props: [...props, ...extra], pickups: [] };
}

function setup(testCourse: BuiltCourse) {
  const room = createRoom(RAPIER, { noun: 'test', courseId: 'test', vehicleId: 'lodgy', course: testCourse }, 0);
  let time = 0;
  const join = (n: number) => {
    const received: SnapshotMessage[] = [];
    const player = room.add(`P${n}`, token(n), {
      send: (data) => {
        const message = JSON.parse(data) as ServerMessage;
        if (message.type === 'snapshot') received.push(message);
      },
      close: () => {},
    });
    return { player, received };
  };
  // Runs `ticks` ticks of the room's simulation.
  const run = (room: Room, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      time += TICK_DT;
      room.update(time);
    }
  };
  return { room, join, run: (ticks: number) => run(room, ticks) };
}

test('the first snapshot to a client is full and lists every prop; later ones list only props that moved', () => {
  const { room, join, run } = setup(course(2));
  const { received } = join(1);
  run(SNAPSHOT_EVERY_TICKS);
  expect(received[0]!.full).toBe(true);
  expect(received[0]!.props.map((prop) => prop.id)).toEqual(['crate-1', 'crate-2', 'crate-3', 'barrier-1']);

  // The lifted crate is still falling.
  run(SNAPSHOT_EVERY_TICKS);
  expect(received[1]!.full).toBe(false);
  expect(received[1]!.props.map((prop) => prop.id)).toEqual(['crate-1']);

  // It lands and settles; then nothing is listed.
  run(240);
  received.length = 0;
  run(SNAPSHOT_EVERY_TICKS * 3);
  expect(received.length).toBe(3);
  for (const message of received) expect(message.props).toEqual([]);
  room.dispose();
});

test('a client that joins later gets a full snapshot of every prop', () => {
  const { room, join, run } = setup(course(2));
  join(1);
  run(240);
  const late = join(2);
  run(SNAPSHOT_EVERY_TICKS);
  expect(late.received[0]!.full).toBe(true);
  expect(late.received[0]!.props).toHaveLength(4);
  run(SNAPSHOT_EVERY_TICKS);
  expect(late.received[1]!.full).toBe(false);
  expect(late.received[1]!.props).toEqual([]);
  room.dispose();
});

test('a prop that moves after a quiet spell is listed again', () => {
  const { room, join, run } = setup(course(0));
  const { received } = join(1);
  run(120);
  const quiet = received.length;
  expect(received[quiet - 1]!.props).toEqual([]);
  // Find the player, then walk it into a crate placed in front of it.
  const feet = received[quiet - 1]!.players[0]!.pos;
  room.dispose();

  const crate = { id: 'push-me', kind: 'crate', pose: { pos: vec3(feet.x, 0, feet.z - 1.2), rot: IDENTITY } };
  const again = setup(course(0, [crate]));
  const second = again.join(1);
  again.run(240);
  second.received.length = 0;
  for (let i = 0; i < 90; i++) {
    second.player.queue.push({ ...NEUTRAL_INPUT, seq: i + 1, moveY: 1 });
    again.run(1);
  }
  expect(second.received.some((message) => message.props.some((prop) => prop.id === 'push-me'))).toBe(true);
  again.room.dispose();
});
