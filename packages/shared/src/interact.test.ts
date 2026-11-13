import { describe, expect, test } from 'vitest';
import { HANDS_RANGE } from './constants';
import { AXIS_Y, IDENTITY, quatFromAxisAngle, vec3 } from './math';
import { aimAngleToBox, interactCandidates, resolveInteract, type InteractCandidate } from './interact';
import { getVehicleConfig } from './vehicles';

const board: InteractCandidate = { action: { kind: 'board', seatId: 'driver' }, angle: 0.5 };
const crate = (propId: string, angle: number): InteractCandidate => ({ action: { kind: 'pickUp', propId }, angle });

describe('resolveInteract', () => {
  test('a seated player leaves the seat, whatever else is in reach or in the hands', () => {
    expect(resolveInteract({ seat: 'driver', hands: null, candidates: [] })).toEqual({ kind: 'exitSeat' });
    expect(resolveInteract({ seat: 'seat1', hands: 'crate-1', candidates: [board, crate('crate-2', 0.1)] })).toEqual({ kind: 'exitSeat' });
  });

  test('holding something throws it, whatever else is in reach', () => {
    expect(resolveInteract({ seat: null, hands: 'crate-1', candidates: [board] })).toEqual({ kind: 'throw' });
    expect(resolveInteract({ seat: null, hands: 'crate-1', candidates: [] })).toEqual({ kind: 'throw' });
  });

  test('otherwise the smallest angle wins', () => {
    expect(resolveInteract({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.2)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
    expect(resolveInteract({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.9)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolveInteract({ seat: null, hands: null, candidates: [crate('crate-2', 0.4), crate('crate-1', 0.3)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('a tie goes to boarding, then to the earlier prop', () => {
    expect(resolveInteract({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.5)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolveInteract({ seat: null, hands: null, candidates: [crate('crate-1', 0.5), crate('crate-2', 0.5)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('with nothing in reach, nothing happens', () => {
    expect(resolveInteract({ seat: null, hands: null, candidates: [] })).toBeNull();
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
