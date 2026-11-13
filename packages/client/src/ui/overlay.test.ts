import {
  AXIS_Y,
  IDENTITY,
  getVehicleConfig,
  quatFromAxisAngle,
  vec3,
  type LobbyMessage,
  type PlayerSnapshot,
  type PropSnapshot,
  type Vec3,
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

const noAim = { aim: { yaw: 0, pitch: 0 }, propPoses: [] as PropSnapshot[] };

const player = (playerId: string, x: number, z: number, seat: string | null = null): PlayerSnapshot => ({
  playerId,
  pos: vec3(x, 0, z),
  yaw: 0,
  seat,
  hands: null,
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
  overlayText({ lobby, config: rv, tick: 180, fps: 59.6, vehicle: v, players, localId, predicted: null, server: null, ...noAim });

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
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor], 0, 0, [])).toBe('E to board');
});

test('interactHint: seated says leave', () => {
  const seated = player('p1', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, seated, [seated], 0, 0, [])).toBe('E to leave the seat');
});

test('interactHint: far away says nothing', () => {
  expect(interactHint(rv, vehicle, far, [far], 0, 0, [])).toBeNull();
});

test('interactHint: with every seat taken says nothing', () => {
  const others = rv.seats.map((seat, index) => player(`o${index}`, 0, 0, seat.id));
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, ...others], 0, 0, [])).toBeNull();
});

test('interactHint: with the driver seat taken, a free seat still says board', () => {
  const driver = player('p2', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, driver], 0, 0, [])).toBe('E to board');
});

const crate = (id: string, x: number, z: number): PropSnapshot => ({ id, kind: 'crate', pos: vec3(x, 0.3, z), rot: IDENTITY });
const standing = { ...player('p1', 10, 10) };

test('interactHint: a crate in reach and ahead says pick up; one behind the aim loses to nothing else but is still the only candidate', () => {
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [crate('crate-1', 10, 8.6)])).toBe('E to pick up');
});

test('interactHint: a crate out of reach, held by someone, or heavy says nothing', () => {
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [crate('crate-1', 10, 5)])).toBeNull();
  const other = { ...player('p2', 12, 10), hands: 'crate-1' };
  expect(interactHint(rv, vehicle, standing, [standing, other], 0, 0, [crate('crate-1', 10, 8.6)])).toBeNull();
  const barrier: PropSnapshot = { id: 'barrier-1', kind: 'barrier', pos: vec3(10, 0.5, 8.6), rot: IDENTITY };
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [barrier])).toBeNull();
});

test('interactHint: holding something says throw, even with a crate or the vehicle in reach', () => {
  const holding = { ...standing, hands: 'crate-1' };
  expect(interactHint(rv, vehicle, holding, [holding], 0, 0, [crate('crate-2', 10, 8.6)])).toBe('E to throw');
  const nearDoorHolding = { ...nearDoor, hands: 'crate-1' };
  expect(interactHint(rv, vehicle, nearDoorHolding, [nearDoorHolding], 0, 0, [])).toBe('E to throw');
});

test('interactHint: the yaw and pitch decide between the vehicle and a crate', () => {
  // The vehicle is to the player's side; a crate lies ahead at yaw 0 and behind at yaw pi.
  const spot = player('p1', -1.1, -32.24);
  const props = [crate('crate-1', -1.1, -33.6)];
  expect(interactHint(rv, vehicle, spot, [spot], 0, 0, props)).toBe('E to pick up');
  expect(interactHint(rv, vehicle, spot, [spot], 0, 0, [])).toBe('E to board');
  expect(interactHint(rv, vehicle, spot, [spot], Math.PI, 0, props)).toBe('E to board');
});

test('shows the speed along the vehicle, the position and the controls', () => {
  const text = overlayText({ lobby, config: rv, tick: 180, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim });
  expect(text).toContain('speed       36.0 km/h');
  expect(text).toContain('pos          1.3     1.7   -30.0');
  expect(text).toContain('throttle    1.00   steer   -0.50');
});

test('speed is negative when the vehicle rolls backwards, whichever way it faces', () => {
  const facingLeft = { ...vehicle, rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2), linvel: vec3(5, 0, 0) };
  expect(overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle: facingLeft, players: [], localId: 'p1', predicted: null, server: null, ...noAim })).toContain('speed      -18.0 km/h');
});

test('says it is waiting before the first snapshot', () => {
  const text = overlayText({ lobby, config: rv, tick: 0, fps: 60, vehicle: null, players: [], localId: 'p1', predicted: null, server: null, ...noAim });
  expect(text).toContain('waiting for the server');
  expect(text).not.toContain('speed');
});

const withPrediction = (predicted: Vec3 | null, server: Vec3 | null, v: VehicleState | null = vehicle) =>
  overlayText({ lobby, config: rv, tick: 180, fps: 60, vehicle: v, players: [], localId: 'p1', predicted, server, ...noAim });

test('shows the predicted and the server position of the local player', () => {
  const text = withPrediction(vec3(1.25, 0, -3.5), vec3(1, 0.5, -3));
  expect(text).toContain('you          1.3     0.0    -3.5   (predicted)');
  expect(text).toContain('server       1.0     0.5    -3.0');
});

test('the prediction lines are not mistaken for the vehicle position line', () => {
  const text = withPrediction(vec3(7, 8, 9), vec3(4, 5, 6));
  expect(text.match(/pos\s+\S+\s+\S+\s+(\S+)/)?.[1]).toBe('-30.0');
  expect(text.match(/tick\s+(\d+)/)?.[1]).toBe('180');
  expect(text.match(/throttle\s+(\S+)/)?.[1]).toBe('1.00');
});

test('omits the prediction lines while prediction is off', () => {
  const text = withPrediction(null, vec3(1, 0, 1));
  expect(text).not.toContain('you ');
  expect(text).not.toContain('server');
});

test('omits the prediction lines before the first snapshot', () => {
  const text = withPrediction(null, null, null);
  expect(text).not.toContain('you ');
  expect(text).not.toContain('(predicted)');
});

test('shows how many props are in the sample', () => {
  const crate = { id: 'crate-1', pos: vec3(0, 1, 0), rot: IDENTITY, linvel: vec3(0, 0, 0), angvel: vec3(0, 0, 0) } as unknown as PropSnapshot;
  const text = overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, aim: noAim.aim, propPoses: [crate, crate, crate] });
  expect(text).toContain('props    3');
  expect(call([])).toContain('props    0');
});
