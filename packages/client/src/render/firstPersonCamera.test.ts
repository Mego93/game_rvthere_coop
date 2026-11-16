import { AXIS_Y, IDENTITY, PLAYER_CROUCH_EYE_HEIGHT, PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, VEHICLES, quatFromAxisAngle, vec3 } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { FIRST_PERSON_FOV, firstPersonEnabled, onFootPose, seatedPose } from './firstPersonCamera';

test('the flag is off by default and on for ?fp or lodgy.fp=1', () => {
  expect(firstPersonEnabled('', null)).toBe(false);
  expect(firstPersonEnabled('?fp', null)).toBe(true);
  expect(firstPersonEnabled('?hq&fp', null)).toBe(true);
  expect(firstPersonEnabled('', '1')).toBe(true);
  expect(firstPersonEnabled('', '0')).toBe(false);
});

test('on foot the camera is at the eye and looks along the aim', () => {
  const { position, target } = onFootPose(vec3(2, 5, 3), PLAYER_EYE_HEIGHT, 0, 0);
  expect(position.y).toBeCloseTo(5 + PLAYER_EYE_HEIGHT, 9);
  expect(position.x).toBe(2);
  expect(target.x).toBeCloseTo(2);
  expect(target.y).toBeCloseTo(5 + PLAYER_EYE_HEIGHT);
  expect(target.z).toBeLessThan(3);
});

test('on foot a crouched eye height lowers the camera and pitch lifts the target', () => {
  const { position, target } = onFootPose(vec3(0, 0, 0), PLAYER_CROUCH_EYE_HEIGHT, Math.PI / 2, 0.5);
  expect(position.y).toBeCloseTo(PLAYER_CROUCH_EYE_HEIGHT);
  expect(target.x).toBeLessThan(0);
  expect(target.y).toBeGreaterThan(PLAYER_CROUCH_EYE_HEIGHT);
});

test('seated at the Lodgy driver seat the eye is clamped inside the box top', () => {
  const config = VEHICLES.lodgy;
  const seat = config.seats[0]!;
  const { position } = seatedPose(vec3(10, 1, 20), IDENTITY, config, seat.id, 0, 0)!;
  expect(position.x).toBeCloseTo(10 + seat.pos.x);
  expect(position.z).toBeCloseTo(20 + seat.pos.z);
  expect(position.y).toBeLessThanOrEqual(1 + config.halfExtents.y);
  expect(position.y).toBeGreaterThan(1 + seat.pos.y);
});

test('seated at every Lodgy seat the eye stays below the roof and above the seat', () => {
  const config = VEHICLES.lodgy;
  expect(config.halfExtents.y).toBeCloseTo(0.55, 9);
  for (const seat of config.seats) {
    const { position } = seatedPose(vec3(0, 0, 0), IDENTITY, config, seat.id, 0, 0)!;
    expect(position.y, seat.id).toBeLessThan(config.halfExtents.y);
    expect(position.y, seat.id).toBeGreaterThan(seat.pos.y);
  }
});

test('seated on a tall box the eye is the seat plus eye minus half height', () => {
  const config = { ...VEHICLES.rv, halfExtents: vec3(1, 3, 3) };
  const seat = config.seats[0]!;
  const { position } = seatedPose(vec3(0, 0, 0), IDENTITY, config, seat.id, 0, 0)!;
  expect(position.y).toBeCloseTo(seat.pos.y + PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2);
});

test('seated yaw is the vehicle yaw plus the aim offset', () => {
  const config = VEHICLES.lodgy;
  const rot = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
  const ahead = seatedPose(vec3(0, 0, 0), rot, config, 'driver', 0, 0)!;
  expect(ahead.target.x).toBeLessThan(ahead.position.x);
  expect(ahead.target.z).toBeCloseTo(ahead.position.z);
  const turned = seatedPose(vec3(0, 0, 0), rot, config, 'driver', -Math.PI / 2, 0)!;
  expect(turned.target.z).toBeLessThan(turned.position.z);
});

test('an unknown seat gives no pose', () => {
  expect(seatedPose(vec3(0, 0, 0), IDENTITY, VEHICLES.lodgy, 'nope', 0, 0)).toBeNull();
});

test('the prototype field of view is 75', () => {
  expect(FIRST_PERSON_FOV).toBe(75);
});
