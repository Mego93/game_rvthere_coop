import { IDENTITY, getVehicleConfig, vec3, type CableSnapshot, type PlayerSnapshot, type VehicleState } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { touchView } from './touchView';

const rv = getVehicleConfig('rv');
const vehicle: VehicleState = { pos: vec3(1.25, 1.7, -30.04), rot: IDENTITY, linvel: vec3(0, 0, 0), throttle: 0, steer: 0, fuel: 1, health: 1 };
const cable = (state: CableSnapshot['state'], holderId: string | null = null): CableSnapshot => ({ state, holderId, anchorId: null, hookPos: vec3(0, 0, 0), length: 5, reel: 0 });

const base: PlayerSnapshot = {
  playerId: 'p1',
  // Beside the RV's driver door.
  pos: vec3(-1.1, 0, -32.24),
  yaw: 0,
  seat: null,
  hands: null,
  ground: null,
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: true,
  inventory: [null, null, null],
  slot: 0,
  hold: null,
  health: 100,
  downed: null,
};
const view = (local: Partial<PlayerSnapshot>, v: VehicleState | null = vehicle, c: CableSnapshot | null = cable('stowed')) =>
  touchView({ config: rv, vehicle: v, players: [{ ...base, ...local }], localId: 'p1', aim: { yaw: 0, pitch: 0 }, cable: c });

test('with no local player or no vehicle everything is off', () => {
  const off = { seated: false, useVisible: false, reelVisible: false, resetVisible: false, sprintVisible: false, fireVisible: false, slots: [null, null, null], selected: 0 };
  expect(touchView({ config: rv, vehicle, players: [base], localId: 'nobody', aim: { yaw: 0, pitch: 0 }, cable: null })).toEqual(off);
  expect(view({}, null)).toEqual(off);
});

test('seated gives seated true and no use button', () => {
  const v = view({ seat: 'driver', inventory: ['jerrycan', null, null] }, { ...vehicle, fuel: 0.3 });
  expect(v.seated).toBe(true);
  expect(v.useVisible).toBe(false);
});

test('the slots and the selected slot come from the local snapshot', () => {
  const v = view({ inventory: ['jerrycan', null, 'toolbox'], slot: 2 });
  expect(v.slots).toEqual(['jerrycan', null, 'toolbox']);
  expect(v.selected).toBe(2);
  expect(v.seated).toBe(false);
});

test('a jerrycan near a vehicle with fuel below full shows the use button', () => {
  expect(view({ inventory: ['jerrycan', null, null] }, { ...vehicle, fuel: 0.3 }).useVisible).toBe(true);
  expect(view({ inventory: ['jerrycan', null, null] }).useVisible).toBe(false);
  expect(view({ inventory: [null, 'jerrycan', null] }, { ...vehicle, fuel: 0.3 }).useVisible).toBe(false);
});

test('U2: a selected tajine shows the use button on foot at any health, and not seated or downed', () => {
  const tajine = { inventory: ['tajine', null, null] } as Partial<PlayerSnapshot>;
  expect(view(tajine).useVisible).toBe(true);
  expect(view({ ...tajine, health: 30 }).useVisible).toBe(true);
  expect(view({ ...tajine, seat: 'driver' }).useVisible).toBe(false);
  expect(view({ ...tajine, downed: 4 }).useVisible).toBe(false);
  expect(view({ inventory: [null, null, null] }).useVisible).toBe(false);
});

test('a downed player sees no use or reel button', () => {
  const v = view({ inventory: ['jerrycan', null, null], downed: 4 }, { ...vehicle, fuel: 0.3 }, cable('attached'));
  expect([v.useVisible, v.reelVisible]).toEqual([false, false]);
});

test('the driver with the cable attached or on the ground sees the reel buttons', () => {
  expect(view({ seat: 'driver' }, vehicle, cable('attached')).reelVisible).toBe(true);
  expect(view({ seat: 'driver' }, vehicle, cable('ground')).reelVisible).toBe(true);
});

test('a stowed or held cable gives no reel buttons', () => {
  expect(view({ seat: 'driver' }, vehicle, cable('stowed')).reelVisible).toBe(false);
  expect(view({ seat: 'driver' }, vehicle, cable('held', 'p2')).reelVisible).toBe(false);
});

test('a passenger sees no reel buttons, and a player on foot far from the mount sees none', () => {
  expect(view({ seat: 'seat1' }, vehicle, cable('attached')).reelVisible).toBe(false);
  expect(view({ pos: vec3(40, 0, 0) }, vehicle, cable('attached')).reelVisible).toBe(false);
});

test('a player on foot at the winch mount sees the reel buttons', () => {
  const mount = vec3(vehicle.pos.x + rv.winchMount.x, vehicle.pos.y + rv.winchMount.y, vehicle.pos.z + rv.winchMount.z);
  expect(view({ pos: vec3(mount.x, mount.y - 1, mount.z) }, vehicle, cable('attached')).reelVisible).toBe(true);
});

test('no cable snapshot gives no reel buttons', () => {
  expect(view({ seat: 'driver' }, vehicle, null).reelVisible).toBe(false);
});

test('(T10) the reset button shows only for a seated player while the vehicle says it is ready', () => {
  const ready = { ...vehicle, resetReady: true };
  expect(view({ seat: 'driver' }, ready).resetVisible).toBe(true);
  expect(view({ seat: 'driver' }).resetVisible).toBe(false);
  expect(view({}, ready).resetVisible).toBe(false);
  expect(view({ seat: 'driver', downed: 5 }, ready).resetVisible).toBe(false);
});

test('B13: Sprint shows on foot and hides when seated or downed', () => {
  expect(view({}).sprintVisible).toBe(true);
  expect(view({ seat: 'driver' }).sprintVisible).toBe(false);
  expect(view({ downed: 10 }).sprintVisible).toBe(false);
});

test('step 39: Fire shows on foot with a gun and hides when seated, downed, carrying a prop or without a gun', () => {
  expect(view({ gun: true, ammo: 12 }).fireVisible).toBe(true);
  expect(view({ gun: true, hands: 'hook' }).fireVisible).toBe(true);
  expect(view({}).fireVisible).toBe(false);
  expect(view({ gun: true, seat: 'driver' }).fireVisible).toBe(false);
  expect(view({ gun: true, downed: 10 }).fireVisible).toBe(false);
  expect(view({ gun: true, hands: 'crate-1' }).fireVisible).toBe(false);
});
