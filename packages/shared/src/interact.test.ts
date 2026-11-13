import { describe, expect, test } from 'vitest';
import { HANDS_RANGE } from './constants';
import { AXIS_Y, IDENTITY, add, quatFromAxisAngle, rotate, vec3, type Vec3 } from './math';
import { aimAngleToBox, interactCandidates, resolveInteract, splitCandidates, type InteractCandidate } from './interact';
import { getVehicleConfig } from './vehicles';
import type { CableSnapshot } from './winch';
import type { Placed } from './course';
import { ANCHOR_HEIGHT, HOOK_RANGE } from './constants';

const resolve = (ctx: { seat: string | null; hands: string | null; candidates: readonly InteractCandidate[] }) =>
  resolveInteract({ holdsHook: ctx.hands === 'hook', attachCandidates: [], ...ctx });
const attach = (anchorId: string, angle: number): InteractCandidate => ({ action: { kind: 'attachHook', anchorId }, angle });
const takeHook: InteractCandidate = { action: { kind: 'takeHook' }, angle: 0.5 };
const detachHook: InteractCandidate = { action: { kind: 'detachHook' }, angle: 0.5 };
const releaseHook: InteractCandidate = { action: { kind: 'releaseHook' }, angle: 0.5 };
const board: InteractCandidate = { action: { kind: 'board', seatId: 'driver' }, angle: 0.5 };
const crate = (propId: string, angle: number): InteractCandidate => ({ action: { kind: 'pickUp', propId }, angle });

describe('resolveInteract', () => {
  test('a seated player leaves the seat, whatever else is in reach or in the hands', () => {
    expect(resolve({ seat: 'driver', hands: null, candidates: [] })).toEqual({ kind: 'exitSeat' });
    expect(resolve({ seat: 'seat1', hands: 'crate-1', candidates: [board, crate('crate-2', 0.1)] })).toEqual({ kind: 'exitSeat' });
  });

  test('holding something throws it, whatever else is in reach', () => {
    expect(resolve({ seat: null, hands: 'crate-1', candidates: [board] })).toEqual({ kind: 'throw' });
    expect(resolve({ seat: null, hands: 'crate-1', candidates: [] })).toEqual({ kind: 'throw' });
  });

  test('otherwise the smallest angle wins', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.2)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.9)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('crate-2', 0.4), crate('crate-1', 0.3)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('a tie goes to boarding, then to the earlier prop', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.5)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('crate-1', 0.5), crate('crate-2', 0.5)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('with nothing in reach, nothing happens', () => {
    expect(resolve({ seat: null, hands: null, candidates: [] })).toBeNull();
  });
});

describe('resolveInteract with the hook', () => {
  const holding = (attachCandidates: InteractCandidate[], candidates: InteractCandidate[] = []) =>
    resolveInteract({ seat: null, hands: 'hook', holdsHook: true, candidates, attachCandidates });

  test('a seated player leaves the seat even holding the hook', () => {
    expect(resolveInteract({ seat: 'driver', hands: 'hook', holdsHook: true, candidates: [], attachCandidates: [attach('a', 0)] })).toEqual({ kind: 'exitSeat' });
  });

  test('holding the hook attaches to the smallest angle, the earlier on a tie, else drops', () => {
    expect(holding([attach('a', 0.4), attach('b', 0.2)])).toEqual({ kind: 'attachHook', anchorId: 'b' });
    expect(holding([attach('a', 0.2), attach('b', 0.2)])).toEqual({ kind: 'attachHook', anchorId: 'a' });
    expect(holding([])).toEqual({ kind: 'dropHook' });
    expect(holding([], [board, crate('c', 0)])).toEqual({ kind: 'dropHook' });
  });

  test('with empty hands the hook actions compete by angle with boarding and props', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, { ...takeHook, angle: 0.1 }] })).toEqual({ kind: 'takeHook' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('c', 0.3), { ...detachHook, angle: 0.2 }] })).toEqual({ kind: 'detachHook' });
  });

  test('ties go board, takeHook, detachHook, releaseHook, then props, in list order', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, takeHook, detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [takeHook, detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'takeHook' });
    expect(resolve({ seat: null, hands: null, candidates: [detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'detachHook' });
    expect(resolve({ seat: null, hands: null, candidates: [releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'releaseHook' });
  });
});

describe('aimAngleToBox', () => {
  const half = vec3(0.3, 0.3, 0.3);
  const ahead = vec3(0, 0, -1);

  test('is 0 with the eye inside the box', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(0, 1, 0.1), IDENTITY, half)).toBe(0);
  });

  test('is 0 for a box straight ahead on the aim line', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(0, 1, -3), IDENTITY, half)).toBeCloseTo(0, 9);
  });

  test('is a quarter turn for a box directly beside the eye, its span including the eye height', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(2, 1, 0), IDENTITY, half)).toBeCloseTo(Math.PI / 2, 9);
  });

  test('uses the box frame: a turned box is measured to its nearest point', () => {
    const rot = quatFromAxisAngle(AXIS_Y, Math.PI / 4);
    const eye = vec3(0, 1, 0);
    const centre = vec3(1.5, 1, -3);
    // Axis-aligned the nearest point is (1.2, 1, -2.7); turned, it is the near corner (1.5, 1, -3 + 0.3 * sqrt 2).
    expect(aimAngleToBox(eye, ahead, centre, IDENTITY, half)).toBeCloseTo(Math.atan2(1.2, 2.7), 9);
    expect(aimAngleToBox(eye, ahead, centre, rot, half)).toBeCloseTo(Math.atan2(1.5, 3 - 0.3 * Math.SQRT2), 9);
  });
});

describe('interactCandidates', () => {
  const config = getVehicleConfig('lodgy');
  const base = {
    config,
    vehiclePos: vec3(0, 1, 0),
    vehicleRot: IDENTITY,
    yaw: 0,
    pitch: 0,
    takenSeats: new Set<string>(),
    heldProps: new Set<string>(),
    seat: null as string | null,
    hands: null as string | null,
    cable: { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 } as CableSnapshot,
    anchors: [] as Placed[],
  };
  const crateAt = (id: string, x: number, z: number) => ({ id, kind: 'crate', pos: vec3(x, 0.3, z), rot: IDENTITY });

  test('lists boarding first, then each unheld light prop in range, in the order given', () => {
    const found = interactCandidates({ ...base, feet: vec3(2.5, 0, 0), props: [crateAt('a', 3.2, 0), crateAt('b', 2.5, -1)] });
    expect(found.map((c) => c.action.kind)).toEqual(['board', 'pickUp', 'pickUp']);
    expect(found.slice(1).map((c) => (c.action as { propId: string }).propId)).toEqual(['a', 'b']);
  });

  test('leaves out a prop beyond HANDS_RANGE, a held one, a heavy one and an unknown kind', () => {
    const far = crateAt('far', 2.5 + HANDS_RANGE + 0.5 + 0.3, 0);
    const barrier = { id: 'barrier-1', kind: 'barrier', pos: vec3(3.5, 0.5, 0), rot: IDENTITY };
    const mystery = { id: 'm', kind: 'mystery', pos: vec3(3.5, 0.5, 1), rot: IDENTITY };
    const found = interactCandidates({
      ...base,
      feet: vec3(2.5, 0, 0),
      props: [far, barrier, mystery, crateAt('held', 3.5, 0.5), crateAt('free', 3.5, -0.5)],
      heldProps: new Set(['held']),
    });
    expect(found.filter((c) => c.action.kind === 'pickUp').map((c) => (c.action as { propId: string }).propId)).toEqual(['free']);
  });

  test('has no boarding candidate when every seat is taken or the vehicle is out of reach', () => {
    const taken = new Set(config.seats.map((seat) => seat.id));
    expect(interactCandidates({ ...base, feet: vec3(2.5, 0, 0), takenSeats: taken, props: [] })).toEqual([]);
    expect(interactCandidates({ ...base, feet: vec3(30, 0, 0), props: [] })).toEqual([]);
  });

  test('the angle follows the aim: facing the crate beats facing away', () => {
    const props = [crateAt('a', 0, -11.5)];
    const feet = vec3(0, 0, -10);
    const toward = interactCandidates({ ...base, feet, yaw: 0, props });
    const away = interactCandidates({ ...base, feet, yaw: Math.PI, props });
    expect(toward[0]!.angle).toBeLessThan(away[0]!.angle);
  });
});

describe('interactCandidates and the hook', () => {
  const config = getVehicleConfig('lodgy');
  const vehiclePos = vec3(0, 1, 0);
  const mount = add(vehiclePos, rotate(IDENTITY, config.winchMount));
  const cable = (state: CableSnapshot['state'], hookPos = mount, anchorId: string | null = null): CableSnapshot => ({
    state,
    holderId: null,
    anchorId,
    hookPos,
    length: 0,
    reel: 0,
  });
  const base = {
    config,
    vehiclePos,
    vehicleRot: IDENTITY,
    yaw: 0,
    pitch: 0,
    seat: null as string | null,
    hands: null as string | null,
    takenSeats: new Set<string>(),
    heldProps: new Set<string>(),
    props: [] as { id: string; kind: string; pos: Vec3; rot: typeof IDENTITY }[],
    anchors: [] as Placed[],
    cable: cable('stowed'),
  };
  // Feet such that the chest is 1 m in front of the winch box (the mount faces -z).
  const nearBox = vec3(mount.x, mount.y - 1.0 - 1, mount.z - 1);
  const kinds = (found: InteractCandidate[]) => found.map((c) => c.action.kind);
  const post = (id: string, x: number, z: number): Placed => ({ id, kind: 'anchor', pose: { pos: vec3(x, 0, z), rot: IDENTITY } });

  test('a seated player has no candidates', () => {
    expect(interactCandidates({ ...base, seat: 'driver', feet: nearBox })).toEqual([]);
  });

  test('stowed: takeHook beside the winch box, none out of reach', () => {
    expect(kinds(interactCandidates({ ...base, feet: nearBox }))).toContain('takeHook');
    const far = vec3(mount.x, mount.y - 2, mount.z - HOOK_RANGE - 0.5);
    expect(kinds(interactCandidates({ ...base, feet: far }))).not.toContain('takeHook');
  });

  test('ground: takeHook only beside the hook', () => {
    const hook = vec3(20, 0, 20);
    const found = interactCandidates({ ...base, cable: cable('ground', hook), feet: vec3(20, 0, 21) });
    expect(kinds(found)).toEqual(['takeHook']);
    expect(kinds(interactCandidates({ ...base, cable: cable('ground', hook), feet: vec3(20, 0, 24) }))).toEqual([]);
  });

  test('attached: detachHook at the attach point and releaseHook at the winch box', () => {
    const point = vec3(20, 0.5, 20);
    const att = cable('attached', point, 'a');
    expect(kinds(interactCandidates({ ...base, cable: att, feet: vec3(20, 0, 21) }))).toEqual(['detachHook']);
    expect(kinds(interactCandidates({ ...base, cable: att, feet: nearBox }))).toContain('releaseHook');
  });

  test('a hook held by another player offers nothing', () => {
    const held = { ...cable('held'), holderId: 'other' };
    expect(kinds(interactCandidates({ ...base, cable: held, feet: nearBox }))).not.toContain('takeHook');
  });

  test('holding the hook: only attach candidates, for anchors in range and within the cable reach', () => {
    const anchors = [post('a1', 3, -2), post('a2', 3, 0.5)];
    const feet = vec3(3, 0, -1);
    const found = interactCandidates({ ...base, hands: 'hook', feet, anchors });
    expect(found.map((c) => c.action)).toEqual([
      { kind: 'attachHook', anchorId: 'a1' },
      { kind: 'attachHook', anchorId: 'a2' },
    ]);
    const farVehicle = interactCandidates({ ...base, hands: 'hook', feet, anchors: [post('far', 3, -2)], vehiclePos: vec3(0, 1, 40) });
    expect(farVehicle).toEqual([]);
  });

  test('holding the hook: an anchor beyond the reach is left out, so interact drops', () => {
    const feet = vec3(0, 0, -40);
    const anchors = [post('far', 0, -40.5)];
    const found = interactCandidates({ ...base, hands: 'hook', feet, anchors });
    expect(found).toEqual([]);
    const split = splitCandidates(found);
    expect(resolveInteract({ seat: null, hands: 'hook', holdsHook: true, ...split })).toEqual({ kind: 'dropHook' });
  });

  test('holding the hook: a barrier offers its top face; a crate offers nothing', () => {
    const barrier = { id: 'barrier-1', kind: 'barrier', pos: vec3(3, 0.5, -1), rot: IDENTITY };
    const crateProp = { id: 'crate-1', kind: 'crate', pos: vec3(3, 0.3, -1), rot: IDENTITY };
    const found = interactCandidates({ ...base, hands: 'hook', feet: vec3(3, 0, -1.5), props: [crateProp, barrier] });
    expect(found.map((c) => c.action)).toEqual([{ kind: 'attachHook', anchorId: 'barrier-1' }]);
  });

  test('the attach point of a static anchor is ANCHOR_HEIGHT above its pose', () => {
    const anchors = [post('a1', 3, -2)];
    // The chest is 1 m up: standing at height ANCHOR_HEIGHT - 1 puts the chest at the attach point, so only a tight range matters.
    const feet = vec3(3, ANCHOR_HEIGHT - 1 - HOOK_RANGE + 0.01, -2);
    expect(kinds(interactCandidates({ ...base, hands: 'hook', feet, anchors }))).toEqual(['attachHook']);
    expect(kinds(interactCandidates({ ...base, hands: 'hook', feet: vec3(3, ANCHOR_HEIGHT - 1 - HOOK_RANGE - 0.01, -2), anchors }))).toEqual([]);
  });

  test('holding a prop: no candidates', () => {
    expect(interactCandidates({ ...base, hands: 'crate-1', feet: nearBox })).toEqual([]);
  });
});
