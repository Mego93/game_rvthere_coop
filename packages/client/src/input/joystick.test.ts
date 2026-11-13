import { expect, test } from 'vitest';
import { joystickVector } from './joystick';

const origin = { x: 100, y: 100 };
const R = 60;
const Z = 0.12;
const len = (v: { moveX: number; moveY: number }) => Math.hypot(v.moveX, v.moveY);

test('inside the dead zone gives 0', () => {
  expect(joystickVector(origin, { x: 103, y: 104 }, R, Z)).toEqual({ moveX: 0, moveY: 0 });
});

test('just outside the dead zone gives a small value', () => {
  const v = joystickVector(origin, { x: 100 + R * Z + 1, y: 100 }, R, Z);
  expect(len(v)).toBeGreaterThan(0);
  expect(len(v)).toBeLessThan(0.05);
});

test('at the radius the length is 1', () => {
  expect(len(joystickVector(origin, { x: 100 + R, y: 100 }, R, Z))).toBeCloseTo(1, 9);
});

test('beyond the radius it is clamped', () => {
  expect(len(joystickVector(origin, { x: 100 + 5 * R, y: 100 }, R, Z))).toBeCloseTo(1, 9);
});

test('screen up gives positive moveY', () => {
  const v = joystickVector(origin, { x: 100, y: 100 - R }, R, Z);
  expect(v.moveY).toBeCloseTo(1, 9);
  expect(Math.abs(v.moveX)).toBeLessThan(1e-9);
});

test('screen right gives positive moveX', () => {
  expect(joystickVector(origin, { x: 100 + R, y: 100 }, R, Z).moveX).toBeCloseTo(1, 9);
});

test('a diagonal keeps its direction', () => {
  const v = joystickVector(origin, { x: 130, y: 70 }, R, Z);
  expect(v.moveX).toBeCloseTo(v.moveY, 9);
  expect(v.moveX).toBeGreaterThan(0);
});

test('the output is continuous at the dead-zone edge', () => {
  const edge = joystickVector(origin, { x: 100 + R * Z + 1e-9, y: 100 }, R, Z);
  expect(len(edge)).toBeLessThan(1e-6);
});
