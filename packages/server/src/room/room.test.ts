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

// Course pickups kept, unlike `course`; the test ground's own three are left out.
const withPickups = (pickups: BuiltCourse['pickups']): BuiltCourse => ({ ...course(0), pickups });
const offGround = { id: 'lost-can', kind: 'jerrycan', pose: { pos: vec3(300, 0, -200), rot: IDENTITY } };

test('picking an item up makes the next snapshot full for every client, and the item is absent', () => {
  // Pass one finds where a player walking away from the vehicle ends up.
  const walk = (testCourse: BuiltCourse, finish: (setupResult: ReturnType<typeof setup>, one: ReturnType<ReturnType<typeof setup>['join']>) => void) => {
    const s = setup(testCourse);
    const one = s.join(1);
    const two = s.join(2);
    s.run(60);
    for (let i = 0; i < 60; i++) {
      one.player.queue.push({ ...NEUTRAL_INPUT, seq: i + 1, moveY: 1, yaw: Math.PI / 2 });
      s.run(1);
    }
    for (let i = 0; i < 30; i++) {
      one.player.queue.push({ ...NEUTRAL_INPUT, seq: 61 + i, yaw: Math.PI / 2 });
      s.run(1);
    }
    finish(s, one);
    return { s, one, two };
  };
  let feet = vec3(0, 0, 0);
  walk(withPickups([]), (_s, one) => {
    feet = one.received[one.received.length - 1]!.players[0]!.pos;
  }).s.room.dispose();
  expect(feet.x).toBeLessThan(-4);

  const can = { id: 'can-1', kind: 'jerrycan', pose: { pos: vec3(feet.x, 0, feet.z), rot: IDENTITY } };
  const { s, one, two } = walk(withPickups([can]), () => {});
  const before = one.received[one.received.length - 1]!;
  expect(before.props.map((prop) => prop.id)).not.toContain('can-1');
  expect(one.received.some((message) => message.props.some((prop) => prop.id === 'can-1'))).toBe(true);

  one.received.length = 0;
  two.received.length = 0;
  one.player.queue.push({ ...NEUTRAL_INPUT, seq: 91, interact: true, yaw: Math.PI / 2 });
  s.run(SNAPSHOT_EVERY_TICKS);
  for (const client of [one, two]) {
    const message = client.received[0]!;
    expect(message.full).toBe(true);
    expect(message.props.map((prop) => prop.id)).toEqual(['crate-1', 'crate-2', 'crate-3', 'barrier-1']);
  }
  expect(one.received[0]!.players[0]!.inventory[0]).toBe('jerrycan');

  // With the set of ids unchanged again, snapshots are partial.
  s.run(SNAPSHOT_EVERY_TICKS);
  expect(one.received[1]!.full).toBe(false);
  s.room.dispose();
});

test('dropping an item makes the next snapshot full for every client, and the dropped item is listed', () => {
  const first = setup(withPickups([]));
  const probe = first.join(1);
  first.run(SNAPSHOT_EVERY_TICKS * 2);
  const feet = probe.received[probe.received.length - 1]!.players[0]!.pos;
  first.room.dispose();

  const can = { id: 'can-1', kind: 'jerrycan', pose: { pos: vec3(feet.x, 0, feet.z), rot: IDENTITY } };
  const { room, join, run } = setup(withPickups([can]));
  const one = join(1);
  const two = join(2);
  run(SNAPSHOT_EVERY_TICKS * 2);
  one.player.queue.push({ ...NEUTRAL_INPUT, seq: 1, interact: true });
  run(SNAPSHOT_EVERY_TICKS * 2);
  expect(one.received[one.received.length - 1]!.players.find((p) => p.inventory[0] === 'jerrycan')).toBeDefined();
  // Quiet again: partial snapshots.
  run(SNAPSHOT_EVERY_TICKS * 2);
  expect(one.received[one.received.length - 1]!.full).toBe(false);

  one.received.length = 0;
  two.received.length = 0;
  one.player.queue.push({ ...NEUTRAL_INPUT, seq: 2, drop: true });
  run(SNAPSHOT_EVERY_TICKS);
  for (const client of [one, two]) {
    const message = client.received[0]!;
    expect(message.full).toBe(true);
    expect(message.props.map((prop) => prop.id)).toContain('item-1');
  }
  room.dispose();
});

test('a course pickup reset by the kill plane is sent at its reset pose', () => {
  const { room, join, run } = setup(withPickups([offGround]));
  const { received } = join(1);
  run(SNAPSHOT_EVERY_TICKS * 3);
  const heights = () => received.flatMap((message) => message.props.filter((prop) => prop.id === 'lost-can').map((prop) => prop.pos.y));
  expect(heights()[0]).toBeGreaterThan(0);
  // It falls past the kill plane (y -20) in about two seconds, then is put back at y of its spawn pose.
  run(180);
  const seen = heights();
  const lowest = seen.indexOf(Math.min(...seen));
  expect(Math.min(...seen)).toBeLessThan(-15);
  expect(seen.slice(lowest + 1).some((y) => y > 0)).toBe(true);
  room.dispose();
});
