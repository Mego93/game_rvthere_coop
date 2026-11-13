import {
  AXIS_Y,
  IDENTITY,
  getVehicleConfig,
  quatFromAxisAngle,
  vec3,
  type CableSnapshot,
  type LobbyMessage,
  type Placed,
  type PlayerSnapshot,
  type PropSnapshot,
  type Vec3,
  type VehicleState,
} from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import type { RunStatus } from '../net/snapshotBuffer';
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
  fuel: 1,
  health: 1,
};

const stowed: CableSnapshot = { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 };
const noAim = { aim: { yaw: 0, pitch: 0 }, propPoses: [] as PropSnapshot[], cable: stowed as CableSnapshot | null, anchors: [] as Placed[], status: null as RunStatus | null };

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
  inventory: [null, null, null],
  slot: 0,
  hold: null,
  health: 100,
  downed: null,
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
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor], 0, 0, [], stowed, [])).toBe('E to board');
});

test('interactHint: seated says leave', () => {
  const seated = player('p1', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, seated, [seated], 0, 0, [], stowed, [])).toBe('E to leave the seat');
});

test('interactHint: far away says nothing', () => {
  expect(interactHint(rv, vehicle, far, [far], 0, 0, [], stowed, [])).toBeNull();
});

test('interactHint: with every seat taken says nothing', () => {
  const others = rv.seats.map((seat, index) => player(`o${index}`, 0, 0, seat.id));
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, ...others], 0, 0, [], stowed, [])).toBeNull();
});

test('interactHint: with the driver seat taken, a free seat still says board', () => {
  const driver = player('p2', 0, 0, 'driver');
  expect(interactHint(rv, vehicle, nearDoor, [nearDoor, driver], 0, 0, [], stowed, [])).toBe('E to board');
});

const crate = (id: string, x: number, z: number): PropSnapshot => ({ id, kind: 'crate', pos: vec3(x, 0.3, z), rot: IDENTITY });
const standing = { ...player('p1', 10, 10) };

test('interactHint: a crate in reach and ahead says pick up; one behind the aim loses to nothing else but is still the only candidate', () => {
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [crate('crate-1', 10, 8.6)], stowed, [])).toBe('E to pick up');
});

test('interactHint: a crate out of reach, held by someone, or heavy says nothing', () => {
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [crate('crate-1', 10, 5)], stowed, [])).toBeNull();
  const other = { ...player('p2', 12, 10), hands: 'crate-1' };
  expect(interactHint(rv, vehicle, standing, [standing, other], 0, 0, [crate('crate-1', 10, 8.6)], stowed, [])).toBeNull();
  const barrier: PropSnapshot = { id: 'barrier-1', kind: 'barrier', pos: vec3(10, 0.5, 8.6), rot: IDENTITY };
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [barrier], stowed, [])).toBeNull();
});

test('interactHint: holding something says throw, even with a crate or the vehicle in reach', () => {
  const holding = { ...standing, hands: 'crate-1' };
  expect(interactHint(rv, vehicle, holding, [holding], 0, 0, [crate('crate-2', 10, 8.6)], stowed, [])).toBe('E to throw');
  const nearDoorHolding = { ...nearDoor, hands: 'crate-1' };
  expect(interactHint(rv, vehicle, nearDoorHolding, [nearDoorHolding], 0, 0, [], stowed, [])).toBe('E to throw');
});

test('interactHint: the yaw and pitch decide between the vehicle and a crate', () => {
  // The vehicle is to the player's side; a crate lies ahead at yaw 0 and behind at yaw pi.
  const spot = player('p1', -1.1, -32.24);
  const props = [crate('crate-1', -1.1, -33.6)];
  expect(interactHint(rv, vehicle, spot, [spot], 0, 0, props, stowed, [])).toBe('E to pick up');
  expect(interactHint(rv, vehicle, spot, [spot], 0, 0, [], stowed, [])).toBe('E to board');
  expect(interactHint(rv, vehicle, spot, [spot], Math.PI, 0, props, stowed, [])).toBe('E to board');
});

const cableOf = (state: CableSnapshot['state'], hookPos = vec3(0, 0, 0)): CableSnapshot => ({ ...stowed, state, hookPos });
const atBumper = player('p1', 1.25, -34.5);
const post = (id: string, x: number, z: number): Placed => ({ id, kind: 'anchor', pose: { pos: vec3(x, 0, z), rot: IDENTITY } });

test('interactHint: the hook hints', () => {
  expect(interactHint(rv, vehicle, atBumper, [atBumper], 0, 0, [], stowed, [])).toBe('E to take the hook');
  const ground = cableOf('ground', vec3(10, 0, 10));
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [], ground, [])).toBe('E to take the hook');
  const hooked = { ...standing, hands: 'hook' };
  expect(interactHint(rv, vehicle, hooked, [hooked], 0, 0, [], cableOf('held'), [])).toBe('E to drop the hook');
  const hookedAtBumper = { ...atBumper, hands: 'hook' };
  expect(interactHint(rv, vehicle, hookedAtBumper, [hookedAtBumper], 0, 0, [], cableOf('held'), [post('anchor-1', 1.25, -35.5)])).toBe('E to attach the hook');
  // Beyond the cable's reach from the mount the anchor is left out, so interact drops.
  expect(interactHint(rv, vehicle, hooked, [hooked], 0, 0, [], cableOf('held'), [post('anchor-1', 10, 9.5)])).toBe('E to drop the hook');
  const attached = cableOf('attached', vec3(10, 0.5, 9));
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [], attached, [])).toBe('E to unhook');
  expect(interactHint(rv, vehicle, atBumper, [atBumper], 0, 0, [], attached, [])).toBe('E to release the hook');
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [], null, [])).toBeNull();
});

test('interactHint: an item in reach says pick up the kind, unless the inventory is full', () => {
  const item = (kind: string) => ({ id: 'item-1', kind, pos: vec3(10, 0.25, 8.6), rot: IDENTITY });
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [item('jerrycan')], stowed, [])).toBe('E to pick up the jerrycan');
  expect(interactHint(rv, vehicle, standing, [standing], 0, 0, [item('toolbox')], stowed, [])).toBe('E to pick up the toolbox');
  const full = { ...standing, inventory: ['jerrycan', 'jerrycan', 'toolbox'] as PlayerSnapshot['inventory'] };
  expect(interactHint(rv, vehicle, full, [full], 0, 0, [item('jerrycan')], stowed, [])).toBeNull();
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
  const text = overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim, propPoses: [crate, crate, crate] });
  expect(text).toContain('props    3');
  expect(call([])).toContain('props    0');
});

test('shows the cable state and length to one decimal, and nothing before the first snapshot', () => {
  const attached = { ...stowed, state: 'attached' as const, length: 12.34 };
  expect(overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim, cable: attached })).toContain('cable    attached 12.3 m');
  expect(overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim, cable: stowed })).toContain('cable    stowed 0.0 m');
  expect(overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim, cable: null })).not.toContain('cable');
});

const holding = (changes: Partial<PlayerSnapshot>): PlayerSnapshot => ({ ...nearDoor, ...changes });
const lines = (players: PlayerSnapshot[], v: VehicleState = vehicle) => call(players, 'p1', v).split('\n');

test('shows fuel and health as percentages', () => {
  expect(lines([nearDoor])).toContain('fuel     100%   health 100%');
  expect(lines([nearDoor], { ...vehicle, fuel: 0.254, health: 0.5 })).toContain('fuel     25%   health 50%');
  expect(lines([nearDoor], { ...vehicle, fuel: 0.999, health: 0.996 })).toContain('fuel     99%   health 99%');
});

test('shows the slots with the selected one in brackets and empty ones as a dash', () => {
  expect(lines([nearDoor])).toContain('slots    [-] - -');
  const carrying = holding({ inventory: ['jerrycan', null, 'toolbox'], slot: 0 });
  expect(lines([carrying])).toContain('slots    [jerrycan] - toolbox');
  expect(lines([{ ...carrying, slot: 2 }])).toContain('slots    jerrycan - [toolbox]');
  expect(lines([{ ...carrying, slot: 1 }])).toContain('slots    jerrycan [-] toolbox');
});

test('shows the hold progress only while holding', () => {
  expect(call([nearDoor]).includes('hold ')).toBe(false);
  const hold = { action: 'useItem', targetId: 'vehicle', progress: 0.4 };
  expect(lines([holding({ inventory: ['jerrycan', null, null], hold })])).toContain('hold     40%');
  expect(lines([holding({ inventory: ['jerrycan', null, null], hold: { ...hold, progress: 0.999 } })])).toContain('hold     99%');
});

test('hints to refuel or repair when the selected item suits the vehicle and it is in range', () => {
  const jerrycan = holding({ inventory: ['jerrycan', null, null] });
  const toolbox = holding({ inventory: ['toolbox', null, null] });
  const low = { ...vehicle, fuel: 0.3, health: 0.4 };
  expect(lines([jerrycan], low)).toContain('hint     Hold F to refuel');
  expect(lines([toolbox], low)).toContain('hint     Hold F to repair');
  // After the interact hint.
  const text = lines([jerrycan], low);
  expect(text.indexOf('hint     E to board')).toBeLessThan(text.indexOf('hint     Hold F to refuel'));
  // Full tank or full health, wrong slot selected, out of range, seated: no hint.
  expect(lines([jerrycan]).some((line) => line.includes('Hold F'))).toBe(false);
  expect(lines([toolbox], { ...vehicle, fuel: 0.3 }).some((line) => line.includes('Hold F'))).toBe(false);
  expect(lines([{ ...jerrycan, slot: 1 }], low).some((line) => line.includes('Hold F'))).toBe(false);
  expect(lines([holding({ inventory: ['jerrycan', null, null], pos: far.pos })], low).some((line) => line.includes('Hold F'))).toBe(false);
  expect(lines([holding({ inventory: ['jerrycan', null, null], seat: 'driver' })], low).some((line) => line.includes('Hold F'))).toBe(false);
  expect(lines([holding({ inventory: ['toString' as never, null, null] })], low).some((line) => line.includes('Hold F'))).toBe(false);
});

const run = (overrides: Partial<RunStatus> = {}): RunStatus => ({ elapsed: 0, checkpoint: 0, checkpointCount: 2, restarts: 0, respawns: 0, won: false, ...overrides });
const withStatus = (status: RunStatus | null) =>
  overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players: [], localId: 'p1', predicted: null, server: null, ...noAim, status });

test('shows the clock, the checkpoint as index plus one, and the counters', () => {
  expect(withStatus(run())).toContain('time     0:00.0   cp 1/2   restarts 0   respawns 0');
  expect(withStatus(run({ elapsed: 75.39, checkpoint: 1, restarts: 2, respawns: 3 }))).toContain('time     1:15.3   cp 2/2   restarts 2   respawns 3');
});

test('floors the clock to tenths and pads the seconds', () => {
  expect(withStatus(run({ elapsed: 9.99 }))).toContain('time     0:09.9');
  expect(withStatus(run({ elapsed: 600 }))).toContain('time     10:00.0');
  expect(withStatus(run({ elapsed: 59.95 }))).toContain('time     0:59.9');
});

test('shows FINISHED on its own line only once won', () => {
  expect(withStatus(run()).split('\n')).not.toContain('FINISHED');
  expect(withStatus(run({ won: true })).split('\n')).toContain('FINISHED');
});

test('shows no time line before the first snapshot', () => {
  expect(withStatus(null)).not.toContain('time ');
});

test('C2: shows the health line after the slots, and the downed timer rounded up while downed', () => {
  const text = lines([nearDoor]);
  expect(text.indexOf('health   100')).toBe(text.indexOf('slots    [-] - -') + 1);
  expect(text.some((line) => line.startsWith('DOWNED'))).toBe(false);
  expect(lines([holding({ health: 40 })])).toContain('health   40');
  const after = (downed: number) => lines([holding({ health: 0, downed })]);
  expect(after(30)).toContain('DOWNED   30s');
  expect(after(29.5)).toContain('DOWNED   30s');
  expect(after(29.01)).toContain('DOWNED   30s');
  expect(after(29)).toContain('DOWNED   29s');
  expect(after(0.01)).toContain('DOWNED   1s');
  const down = after(30);
  expect(down.indexOf('DOWNED   30s')).toBe(down.indexOf('health   0') + 1);
});

describe('C2: health kit hints', () => {
  const kit = (changes: Partial<PlayerSnapshot> = {}) => holding({ inventory: ['healthKit', null, null], ...changes });
  // Badr stands 1.5 m ahead of Amal, who looks at the chest.
  const mate = (changes: Partial<PlayerSnapshot> = {}) => ({ ...player('p2', nearDoor.pos.x, nearDoor.pos.z - 1.5), ...changes });
  const aimed = (players: PlayerSnapshot[]) =>
    overlayText({ lobby, config: rv, tick: 1, fps: 60, vehicle, players, localId: 'p1', predicted: null, server: null, ...noAim, aim: { yaw: 0, pitch: -0.45 } }).split('\n');

  test('names the downed teammate to revive and the hurt one to heal', () => {
    expect(aimed([kit(), mate({ health: 0, downed: 20 })])).toContain('hint     Hold F to revive Badr');
    expect(aimed([kit(), mate({ health: 40 })])).toContain('hint     Hold F to heal Badr');
  });

  test('heals oneself when hurt and no teammate qualifies', () => {
    expect(aimed([kit({ health: 60 }), mate()])).toContain('hint     Hold F to heal yourself');
  });

  test('no hint at full health with nobody hurt, or without the kit selected', () => {
    expect(aimed([kit(), mate()]).some((line) => line.includes('Hold F'))).toBe(false);
    expect(aimed([kit({ slot: 1 }), mate({ health: 0, downed: 20 })]).some((line) => line.includes('Hold F'))).toBe(false);
  });

  test('a downed local player gets no hint', () => {
    expect(aimed([kit({ health: 0, downed: 20 }), mate({ health: 40 })]).some((line) => line.includes('Hold F'))).toBe(false);
  });
});
