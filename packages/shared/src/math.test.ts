import { expect, test } from 'vitest';
import { AXIS_X, AXIS_Y, IDENTITY, quatFromAxisAngle, quatMul, rotate, vec3, yawOf } from './math';

test('identity rotation leaves a vector unchanged', () => {
  expect(rotate(IDENTITY, vec3(1, 2, 3))).toEqual(vec3(1, 2, 3));
});

test('positive yaw turns forward (-Z) toward -X', () => {
  const f = rotate(quatFromAxisAngle(AXIS_Y, Math.PI / 2), vec3(0, 0, -1));
  expect(f.x).toBeCloseTo(-1);
  expect(f.z).toBeCloseTo(0);
});

test('yawOf recovers the yaw angle', () => {
  expect(yawOf(quatFromAxisAngle(AXIS_Y, 0.5))).toBeCloseTo(0.5);
  expect(yawOf(quatFromAxisAngle(AXIS_Y, -1.2))).toBeCloseTo(-1.2);
});

test('positive rotation about +X raises the -Z end', () => {
  const f = rotate(quatFromAxisAngle(AXIS_X, 0.3), vec3(0, 0, -1));
  expect(f.y).toBeCloseTo(Math.sin(0.3));
  expect(f.z).toBeCloseTo(-Math.cos(0.3));
});

test('quatMul applies the right-hand rotation first', () => {
  const yaw = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
  const pitch = quatFromAxisAngle(AXIS_X, Math.PI / 2);
  const v = rotate(quatMul(yaw, pitch), vec3(0, 0, -1));
  expect(v.x).toBeCloseTo(0);
  expect(v.y).toBeCloseTo(1);
  expect(v.z).toBeCloseTo(0);
});
