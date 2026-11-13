import { expect, test } from 'vitest';
import { createLook } from './look';

const PITCH_LIMIT = Math.PI / 2 - 0.05;

test('starts straight ahead', () => {
  const look = createLook();
  expect([look.yaw(), look.pitch()]).toEqual([0, 0]);
});

test('uses the mouse signs: right turns right, up looks up', () => {
  const look = createLook();
  look.apply(10, -10, 0.01);
  expect(look.yaw()).toBeCloseTo(-0.1, 9);
  expect(look.pitch()).toBeCloseTo(0.1, 9);
});

test('wraps yaw into (-pi, pi]', () => {
  const look = createLook();
  look.apply(-(Math.PI + 0.5), 0, 1);
  expect(look.yaw()).toBeCloseTo(-Math.PI + 0.5, 9);
  look.apply(10 * Math.PI, 0, 1);
  expect(look.yaw()).toBeGreaterThan(-Math.PI);
  expect(look.yaw()).toBeLessThanOrEqual(Math.PI);
});

test('clamps pitch', () => {
  const look = createLook();
  look.apply(0, -1000, 1);
  expect(look.pitch()).toBe(PITCH_LIMIT);
  look.apply(0, 5000, 1);
  expect(look.pitch()).toBe(-PITCH_LIMIT);
});
