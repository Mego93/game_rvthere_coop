import { IDENTITY, getVehicleConfig, quatFromAxisAngle, AXIS_Y, vec3, type Box, type CableSnapshot, type Checkpoint, type LobbyMessage, type PlayerSnapshot, type ServiceStop, type Vec3, type VehicleState } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import type { RunStatus } from '../../net/snapshotBuffer';
import type { OverlayData } from '../overlay';
import { ITEM_LABELS } from './itemLabels';
import { buildHudModel, ownHealthFraction } from './hudModel';

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
  timeOfDay: 'midday',
  weather: 'clear',
};
const vehicle: VehicleState = { pos: vec3(0, 1, 0), rot: IDENTITY, linvel: vec3(0, 0, 0), throttle: 0, steer: 0, fuel: 0.5, health: 0.8 };
const stowed: CableSnapshot = { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 };
const status: RunStatus = { elapsed: 75.34, checkpoint: 0, checkpointCount: 2, restarts: 0, respawns: 0, won: false, wallet: 7, coinsCollected: 0, coinsTotal: 0, assisted: false };
const box = (x: number, z: number): Box => ({ center: vec3(x, 0, z), halfExtents: vec3(1, 1, 1), rot: IDENTITY });
const checkpoint = (id: string, x: number, z: number): Checkpoint => ({ id, trigger: box(x, z), spawn: { pos: vec3(x, 0, z), rot: IDENTITY } });
const course = { checkpoints: [checkpoint('c0', 0, 0), checkpoint('c1', 0, -100)], finish: box(0, -300) };
const stop = (id: string, kind: 'fuel' | 'garage', x: number, z: number): ServiceStop => ({ id, kind, zone: box(x, z), operatePoint: vec3(x, 0, z), shopCounter: null });

const player = (playerId: string, x: number, z: number, over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  playerId,
  pos: vec3(x, 0, z),
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
  ...over,
});

const data = (over: Partial<OverlayData> = {}): OverlayData => ({
  lobby,
  config: getVehicleConfig('rv'),
  tick: 1,
  fps: 60,
  vehicle,
  players: [player('p1', 40, 40), player('p2', 50, 50)],
  localId: 'p1',
  predicted: null,
  server: null,
  aim: { yaw: 0, pitch: 0 },
  propPoses: [],
  cable: stowed,
  anchors: [],
  status,
  stops: [],
  targetTime: 120,
  ...over,
});
const build = (over: Partial<OverlayData> = {}) => buildHudModel(data(over), course);

describe('vehicle bars (T8)', () => {
  test('fractions pass through', () => {
    expect(build().vehicle).toEqual({ fuel: 0.5, health: 0.8, fuelLow: false, healthLow: false });
  });
  test('low is strictly below 0.2', () => {
    expect(build({ vehicle: { ...vehicle, fuel: 0.2, health: 0.19 } }).vehicle).toMatchObject({ fuelLow: false, healthLow: true });
    expect(build({ vehicle: { ...vehicle, fuel: 0.1999, health: 0.2 } }).vehicle).toMatchObject({ fuelLow: true, healthLow: false });
  });
});

describe('slots (T9, H10)', () => {
  test('always three, selected matches the slot', () => {
    const slots = build({ players: [player('p1', 0, 0, { inventory: ['jerrycan', null, 'healthKit'], slot: 2 })] }).slots;
    expect(slots).toEqual([
      { kind: 'jerrycan', label: ITEM_LABELS.jerrycan, selected: false },
      { kind: null, label: null, selected: false },
      { kind: 'healthKit', label: 'health kit', selected: true },
    ]);
  });
  test('three empty slots without a local player', () => {
    expect(build({ players: [] }).slots).toHaveLength(3);
  });
  test('labels', () => {
    expect(ITEM_LABELS).toEqual({ jerrycan: 'jerrycan', toolbox: 'toolbox', healthKit: 'health kit' });
  });
});

describe('downed (T10, R9, H12)', () => {
  test('own timer is the ceil of the seconds', () => {
    expect(build({ players: [player('p1', 0, 0, { downed: 11.2 })] }).downedSelf).toBe(12);
    expect(build({ players: [player('p1', 0, 0, { downed: 12 })] }).downedSelf).toBe(12);
    expect(build({ players: [player('p1', 0, 0, { downed: 12 + 1e-12 })] }).downedSelf).toBe(12);
    expect(build().downedSelf).toBeNull();
  });
  test('others list excludes the local player and the standing', () => {
    const model = build({ players: [player('p1', 0, 0, { downed: 5 }), player('p2', 10, 2, { downed: 3.5 }), player('p3', 1, 1)] });
    expect(model.downedOthers).toEqual([{ id: 'p2', name: 'Badr', pos: vec3(10, 1.2, 2), seconds: 4 }]);
  });
  test('an unknown name falls back to the id', () => {
    const model = build({ players: [player('p1', 0, 0), player('p9', 0, 0, { downed: 1 })] });
    expect(model.downedOthers[0]?.name).toBe('p9');
  });
});

describe('no snapshot (T11, H13, R9)', () => {
  test('is the null model', () => {
    const model = build({ vehicle: null, players: [], status: null });
    expect(model.vehicle).toBeNull();
    expect(model.mapEntities).toEqual([]);
    expect(model.compass).toEqual({ marker: null, label: '', side: 0 });
    expect(model.timer).toBe('0:00.0');
    expect(model.wallet).toBe(0);
    expect(model.prompt).toBeNull();
    expect(model.hold).toBeNull();
    expect(model.slots).toHaveLength(3);
  });
});

describe('prompt and hold (T12, R10)', () => {
  const near = player('p1', 0, 0, { hold: { action: 'use', targetId: 'p2', progress: 0.4 } });
  const doorVehicle = { ...vehicle, pos: vec3(1.25, 1.7, -30.04) };
  const door = (over: Partial<PlayerSnapshot> = {}) => player('p1', -1.1, -32.24, over);
  test('interact hint alone', () => {
    expect(build({ vehicle: doorVehicle, players: [door()] }).prompt).toBe('E to board');
  });
  test('both hints joined by three spaces', () => {
    const prompt = build({ vehicle: doorVehicle, players: [door({ inventory: ['healthKit', null, null], health: 50 })] }).prompt;
    expect(prompt).toBe('E to board   Hold F to heal yourself');
  });
  test('nothing in reach', () => {
    expect(build().prompt).toBeNull();
  });
  test('hold progress', () => {
    expect(build({ players: [near] }).hold).toBe(0.4);
    expect(build({ players: [player('p1', 0, 0)] }).hold).toBeNull();
  });
  test('downed local has no prompt', () => {
    expect(build({ vehicle: { ...vehicle, pos: vec3(1.25, 1.7, -30.04) }, players: [player('p1', -1.1, -32.24, { downed: 5 })] }).prompt).toBeNull();
  });
});

describe('timer, wallet, health (H8, H9)', () => {
  test('timer floors to tenths, wallet and health pass through', () => {
    const model = build({ players: [player('p1', 0, 0, { health: 64 })] });
    expect(model.timer).toBe('1:15.3');
    expect(model.wallet).toBe(7);
    expect(model.ownHealth).toBe(64);
  });
});

describe('map entities (T13, R4)', () => {
  const ids = (model: ReturnType<typeof build>, kind: string) => model.mapEntities.filter((entity) => entity.kind === kind);
  test('vehicle, self on foot, others, stops, checkpoints', () => {
    const model = build({ stops: [stop('f1', 'fuel', 5, 6), stop('g1', 'garage', 7, 8)], aim: { yaw: 1.5, pitch: 0 } });
    expect(ids(model, 'vehicle')).toEqual([{ id: 'vehicle', kind: 'vehicle', x: 0, z: 0 }]);
    expect(ids(model, 'self')).toEqual([{ id: 'p1', kind: 'self', x: 40, z: 40, yaw: 1.5 }]);
    expect(ids(model, 'player')).toEqual([{ id: 'p2', kind: 'player', x: 50, z: 50 }]);
    expect(ids(model, 'stop')).toEqual([
      { id: 'f1', kind: 'stop', x: 5, z: 6, stopKind: 'fuel' },
      { id: 'g1', kind: 'stop', x: 7, z: 8, stopKind: 'garage' },
    ]);
    expect(ids(model, 'checkpoint')).toEqual([
      { id: 'c0', kind: 'checkpoint', x: 0, z: 0, reached: true },
      { id: 'c1', kind: 'checkpoint', x: 0, z: -100, reached: false },
    ]);
  });
  test('no self marker while seated', () => {
    const model = build({ players: [player('p1', 0, 0, { seat: 'driver' }), player('p2', 50, 50)] });
    expect(ids(model, 'self')).toEqual([]);
    expect(ids(model, 'player')).toHaveLength(1);
  });
  test('self uses the predicted position when present', () => {
    const model = build({ predicted: vec3(3, 0, 4) });
    expect(ids(model, 'self')[0]).toMatchObject({ x: 3, z: 4 });
  });
  test('checkpoints reached by index', () => {
    const model = build({ status: { ...status, checkpoint: 1 } });
    expect(ids(model, 'checkpoint').map((entity) => entity.reached)).toEqual([true, true]);
  });
});

describe('compass (R7, H2, H4)', () => {
  const at = (pos: Vec3, yaw: number, over: Partial<OverlayData> = {}) => build({ players: [player('p1', pos.x, pos.z)], aim: { yaw, pitch: 0 }, ...over });
  test('on foot: aim yaw and own position; target dead ahead is centred', () => {
    // Target is checkpoint 1 at (0, -100); standing at the origin facing -z.
    const model = at(vec3(0, 0, 0), 0, { vehicle: { ...vehicle, pos: vec3(500, 1, 500) } });
    expect(model.heading).toBe(0);
    expect(model.compass.marker).toBeCloseTo(0.5);
    expect(model.compass.label).toBe('100 m');
    expect(model.compass.side).toBe(0);
  });
  test('predicted position wins over the snapshot position on foot', () => {
    expect(at(vec3(0, 0, 0), 0, { predicted: vec3(0, 0, -40) }).compass.label).toBe('60 m');
  });
  test('seated: vehicle position and vehicle yaw', () => {
    const turned = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
    const model = build({ players: [player('p1', 999, 999, { seat: 'driver' })], vehicle: { ...vehicle, pos: vec3(0, 1, -50), rot: turned }, aim: { yaw: 0, pitch: 0 } });
    expect(model.heading).toBeCloseTo(Math.PI / 2);
    expect(model.compass.label).toBe('50 m');
  });
  test('behind: no marker, edge side by the sign of the offset', () => {
    // Facing +z (yaw PI) with the target at -z: offset is +-PI, wrapped to +PI, so the right edge.
    const model = at(vec3(0, 0, 0), Math.PI);
    expect(model.compass.marker).toBeNull();
    expect(model.compass.side).toBe(1);
    const left = at(vec3(0, 0, 0), -2.5 + 0);
    expect(left.compass.side).toBe(-1);
  });
  test('won: no target', () => {
    const model = build({ status: { ...status, won: true } });
    expect(model.compass).toEqual({ marker: null, label: '', side: 0 });
  });
  test('after the last checkpoint the target is the finish', () => {
    expect(build({ status: { ...status, checkpoint: 1 }, players: [player('p1', 0, 0)] }).compass.label).toBe('300 m');
  });
});

describe('ownHealthFraction', () => {
  test('maps health to 0..1 and clamps', () => {
    expect(ownHealthFraction(64)).toBeCloseTo(0.64);
    expect(ownHealthFraction(0)).toBe(0);
    expect(ownHealthFraction(150)).toBe(1);
    expect(ownHealthFraction(Number.NaN)).toBe(0);
  });
});
