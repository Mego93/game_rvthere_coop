import { describe, expect, test } from 'vitest';
import { BOARD_RANGE, SEAT_EXIT_DISTANCE } from './constants';
import { AXIS_Y, IDENTITY, add, quatFromAxisAngle, rotate, vec3, type Quat, type Vec3 } from './math';
import { chooseSeat, distanceToBox, exitPoints, seatDoorPoint } from './seats';
import { getVehicleConfig } from './vehicles';

const LODGY = getVehicleConfig('lodgy');
const RV = getVehicleConfig('rv');
const AT = vec3(0, 0.95, 0);
const none = new Set<string>();

const slot = (index: number, pos: Vec3 = AT, rot: Quat = IDENTITY): Vec3 => {
  const at = add(pos, rotate(quatFromAxisAngle(AXIS_Y, yawFrom(rot)), LODGY.spawnSlots[index]!));
  return vec3(at.x, 0, at.z);
};
const yawFrom = (q: Quat): number => 2 * Math.atan2(q.y, q.w);

describe('distanceToBox', () => {
  const half = vec3(1, 1, 1);

  test('is 0 inside and on the surface', () => {
    expect(distanceToBox(vec3(0.5, -0.5, 0.9), half, vec3(0, 0, 0), IDENTITY)).toBe(0);
    expect(distanceToBox(vec3(1, 0, 0), half, vec3(0, 0, 0), IDENTITY)).toBe(0);
  });

  test('is the distance to the face in front of a face', () => {
    expect(distanceToBox(vec3(3, 0.5, -0.2), half, vec3(0, 0, 0), IDENTITY)).toBeCloseTo(2, 9);
  });

  test('is the distance to the corner beyond a corner', () => {
    expect(distanceToBox(vec3(2, 3, 0), half, vec3(0, 0, 0), IDENTITY)).toBeCloseTo(Math.hypot(1, 2), 9);
    expect(distanceToBox(vec3(2, 2, 2), half, vec3(0, 0, 0), IDENTITY)).toBeCloseTo(Math.sqrt(3), 9);
  });

  test('follows the box\'s position and rotation', () => {
    const turned = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
    // Half extents (1, 1, 3) turned a quarter: the long axis now lies along X.
    const long = vec3(1, 1, 3);
    expect(distanceToBox(vec3(4, 0, 0), long, vec3(0, 0, 0), turned)).toBeCloseTo(1, 9);
    expect(distanceToBox(vec3(0, 0, 2), long, vec3(0, 0, 0), turned)).toBeCloseTo(1, 9);
    expect(distanceToBox(vec3(5, 0, 0), long, vec3(2, 0, 0), turned)).toBe(0);
  });
});

describe('door and exit points', () => {
  test('the door is on the seat\'s side of the body, at the seat\'s z', () => {
    const door = seatDoorPoint(LODGY, LODGY.seats[0]!, AT, IDENTITY);
    expect(door.x).toBeCloseTo(-LODGY.halfExtents.x, 9);
    expect(door.z).toBeCloseTo(-0.7, 9);
    const right = seatDoorPoint(RV, RV.seats[1]!, vec3(10, 1, -5), IDENTITY);
    expect(right.x).toBeCloseTo(10 + RV.halfExtents.x, 9);
    expect(right.z).toBeCloseTo(-5 - 2.2, 9);
  });

  test('exit points lie SEAT_EXIT_DISTANCE beyond the door, own side first', () => {
    const [own, other] = exitPoints(LODGY, LODGY.seats[0]!, AT, IDENTITY);
    expect(own.x).toBeCloseTo(-(LODGY.halfExtents.x + SEAT_EXIT_DISTANCE), 9);
    expect(other.x).toBeCloseTo(LODGY.halfExtents.x + SEAT_EXIT_DISTANCE, 9);
    expect(own.z).toBeCloseTo(-0.7, 9);
    expect(other.z).toBeCloseTo(-0.7, 9);
  });

  test('points turn with the vehicle\'s heading', () => {
    const turn = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
    const door = seatDoorPoint(LODGY, LODGY.seats[0]!, vec3(3, 1, 4), turn);
    const expected = rotate(turn, vec3(-LODGY.halfExtents.x, 0, -0.7));
    expect(door.x).toBeCloseTo(3 + expected.x, 9);
    expect(door.z).toBeCloseTo(4 + expected.z, 9);
  });

  test('a rolled vehicle does not tip the points', () => {
    const rolled = quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 2);
    const door = seatDoorPoint(LODGY, LODGY.seats[0]!, vec3(0, 1, 0), rolled);
    expect(door.x).toBeCloseTo(-LODGY.halfExtents.x, 9);
    expect(door.z).toBeCloseTo(-0.7, 9);
  });
});

describe('chooseSeat', () => {
  test('B1: a player at slot 0 gets the driver seat', () => {
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(0), none)).toBe('driver');
    expect(chooseSeat(RV, AT, IDENTITY, vec3(-2.35, 0, -2.2), none)).toBe('driver');
  });

  test('B1 follows the vehicle\'s heading', () => {
    const turn = quatFromAxisAngle(AXIS_Y, 1.1);
    const pos = vec3(7, 0.95, -20);
    expect(chooseSeat(LODGY, pos, turn, slot(0, pos, turn), none)).toBe('driver');
  });

  test('B1 with the driver seat taken gives the free seat with the nearest door', () => {
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(0), new Set(['driver']))).toBe('seat2');
  });

  test('B2: otherwise the seat with the nearest door, even with the driver seat free', () => {
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(3), none)).toBe('seat3');
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(1), none)).toBe('seat1');
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(2), none)).toBe('seat2');
  });

  test('B3: with every seat taken the answer is null', () => {
    const all = new Set(LODGY.seats.map((seat) => seat.id));
    expect(chooseSeat(LODGY, AT, IDENTITY, slot(0), all)).toBeNull();
  });

  test('B4: out of range gives null, and BOARD_RANGE is measured from the box in 3D', () => {
    expect(chooseSeat(LODGY, AT, IDENTITY, vec3(-10, 0, 0), none)).toBeNull();
    expect(chooseSeat(LODGY, AT, IDENTITY, vec3(-(LODGY.halfExtents.x + BOARD_RANGE - 0.1), 0.95, 0), none)).not.toBeNull();
    expect(chooseSeat(LODGY, AT, IDENTITY, vec3(-(LODGY.halfExtents.x + BOARD_RANGE + 0.1), 0.95, 0), none)).toBeNull();
    // Directly above, out of reach.
    expect(chooseSeat(LODGY, AT, IDENTITY, vec3(0, AT.y + LODGY.halfExtents.y + BOARD_RANGE + 0.1, 0), none)).toBeNull();
  });

  test('a tie goes to the lower index', () => {
    // The seat2 and seat3 doors are symmetric about x = 0, so the tie is exact.
    expect(chooseSeat(LODGY, AT, IDENTITY, vec3(0, 0, 0.4), new Set(['driver']))).toBe('seat2');
  });
});
