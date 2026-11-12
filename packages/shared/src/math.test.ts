import { expect, test } from 'vitest';
import { AXIS_X, AXIS_Y, IDENTITY, lerp, nlerp, quatFromAxisAngle, quatMul, rotate, vec3, yawOf } from './math';

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

test('lerp moves a fraction of the way between two points', () => {
  expect(lerp(vec3(0, 0, 0), vec3(10, -4, 2), 0.25)).toEqual(vec3(2.5, -1, 0.5));
});

test('nlerp gives the rotation halfway between two yaws', () => {
  const half = nlerp(quatFromAxisAngle(AXIS_Y, 0.2), quatFromAxisAngle(AXIS_Y, 0.6), 0.5);
  expect(yawOf(half)).toBeCloseTo(0.4, 3);
  expect(Math.hypot(half.x, half.y, half.z, half.w)).toBeCloseTo(1, 9);
});

test('nlerp takes the short way when the two quaternions have opposite signs', () => {
  const a = quatFromAxisAngle(AXIS_Y, 0.2);
  const b = quatFromAxisAngle(AXIS_Y, 0.6);
  const flipped = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  expect(yawOf(nlerp(a, flipped, 0.5))).toBeCloseTo(0.4, 3);
});

test('the shared constant vectors cannot be modified', () => {
  expect(() => {
    (IDENTITY as { w: number }).w = 0;
  }).toThrow(TypeError);
  expect(() => {
    (AXIS_Y as { y: number }).y = 0;
  }).toThrow(TypeError);
});
