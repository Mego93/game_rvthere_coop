import { AXIS_Y, IDENTITY, quatFromAxisAngle, vec3, type LobbyMessage, type VehicleState } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { overlayText } from './overlay';

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

test('shows the room, the players and who drives', () => {
  const text = overlayText({ lobby, tick: 180, fps: 59.6, vehicle });
  expect(text).toContain('room     camel   vehicle rv   course test');
  expect(text).toContain('players  Amal (drives), Badr');
  expect(text).toContain('tick     180   fps 60');
});

test('shows the speed along the vehicle, the position and the controls', () => {
  const text = overlayText({ lobby, tick: 180, fps: 60, vehicle });
  expect(text).toContain('speed       36.0 km/h');
  expect(text).toContain('pos          1.3     1.7   -30.0');
  expect(text).toContain('throttle    1.00   steer   -0.50');
});

test('speed is negative when the vehicle rolls backwards, whichever way it faces', () => {
  const facingLeft = { ...vehicle, rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2), linvel: vec3(5, 0, 0) };
  expect(overlayText({ lobby, tick: 1, fps: 60, vehicle: facingLeft })).toContain('speed      -18.0 km/h');
});

test('says it is waiting before the first snapshot', () => {
  const text = overlayText({ lobby, tick: 0, fps: 60, vehicle: null });
  expect(text).toContain('waiting for the server');
  expect(text).not.toContain('speed');
});
