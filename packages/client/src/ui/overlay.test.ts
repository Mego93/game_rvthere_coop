import {
  AXIS_Y,
  IDENTITY,
  getVehicleConfig,
  quatFromAxisAngle,
  vec3,
  type LobbyMessage,
  type PlayerSnapshot,
  type VehicleState,
} from '@lodgy/shared';
import { expect, test } from 'vitest';
import { interactHint, overlayText } from './overlay';

const lobby: LobbyMessage = {
  type: 'lobby',
  room: 'camel',
  phase: 'playing',
  players: [
    { playerId: 'p1', name: 'Amal', colour: '#e4572e', ready: false, connected: true },
    { playerId: 'p2', name: 'Badr', colour: '#17bebb', ready: false, connected: true },
  ],
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'rv',
};

const vehicle: VehicleState = {
  pos: vec3(1.25, 1.7, -30.04),
  rot: IDENTITY,
  linvel: vec3(0, 0, -10),
  throttle: 1,
  steer: -0.5,
};

const player = (playerId: string, x: number, z: number, seat: string | null = null): PlayerSnapshot => ({
  playerId,
  pos: vec3(x, 0, z),
  yaw: 0,
  seat,
  ground: null,
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: true,
});
// The RV's driver door is at x = 1.25 - 1.15, z = -30.04 - 2.2.
const nearDoor = player('p1', -1.1, -32.24);
const far = player('p1', 40, -32.24);
const rv = getVehicleConfig('rv');

const call = (players: PlayerSnapshot[], localId = 'p1', v: VehicleState | null = vehicle) =>
  overlayText({ lobby, config: rv, tick: 180, fps: 59.6, vehicle: v, players, localId });

test('shows the room and each player with their state', () => {
  const text = call([player('p1', 0, 0, 'driver'), player('p2', 3, 0)]);
  expect(text).toContain('room     camel   vehicle rv   course test');
  expect(text).toContain('players  Amal (driver), Badr (on foot)');
  expect(text).toContain('tick     180   fps 60');
  expect(text).not.toContain('drives');
});

test('lists a player with no snapshot by name only', () => {
  expect(call([player('p1', 0, 0, 'seat2')])).toContain('players  Amal (seat2), Badr');
});

test('shows the hint line only when there is a hint', () => {
  expect(call([nearDoor])).toContain('hint     E to board');
  expect(call([player('p1', 0, 0, 'driver')])).toContain('hint     E to leave the seat');
  expect(call([far])).not.toContain('hint');
  expect(call([nearDoor], 'nobody')).not.toContain('hint');
  expect(call([nearDoor], 'p1', null)).not.toContain('hint');
});

test('interactHint: near the driver door says board', () => {
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor])).toBe('E to board');
});

test('interactHint: seated says leave', () => {
  const seated = player('p1', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, seated, [seated])).toBe('E to leave the seat');
});

test('interactHint: far away says nothing', () => {
  expect(interactHint(rv, vehicle, far, [far])).toBeNull();
});

test('interactHint: with every seat taken says nothing', () => {
  const others = rv.seats.map((seat, index) => player(`o${index}`, 0, 0, seat.id));
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, ...others])).toBeNull();
});

test('interactHint: with the driver seat taken, a free seat still says board', () => {
  const driver = player('p2', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, driver])).toBe('E to board');
});

test('shows the speed along the vehicle, the position and the controls', () => {
  const text = overlayText({ lobby, config: rv, tick: 180, fps: 60, vehicle, players: [], localId: 'p1' });
  expect(text).toContain('speed       36.0 km/h');
  expect(text).toContain('pos          1.3     1.7   -30.0');
  expect(text).toContain('throttle    1.00   steer   -0.50');
});

test('speed is negative when the vehicle rolls backwards, whichever way it faces', () => {
  const facingLeft = { ...vehicle, rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2), linvel: vec3(5, 0, 0) };
  expect(overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle: facingLeft, players: [], localId: 'p1' })).toContain('speed      -18.0 km/h');
});

test('says it is waiting before the first snapshot', () => {
  const text = overlayText({ lobby, config: rv, tick: 0, fps: 60, vehicle: null, players: [], localId: 'p1' });
  expect(text).toContain('waiting for the server');
  expect(text).not.toContain('speed');
});
