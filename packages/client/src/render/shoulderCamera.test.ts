import { CAMERA_DISTANCE, CAMERA_MIN_DISTANCE, CAMERA_SHOULDER, CAMERA_WALL_MARGIN, PLAYER_EYE_HEIGHT, IDENTITY, length, sub, vec3, type Box } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { cameraPlacement } from './shoulderCamera';

const head = vec3(0, PLAYER_EYE_HEIGHT, 0);
const wallAt = (z: number, half = 0.5): Box => ({ center: vec3(0, PLAYER_EYE_HEIGHT, z), halfExtents: vec3(20, 5, half), rot: IDENTITY });
const distance = (p: { x: number; y: number; z: number }) => length(sub(p, head));

test('without walls the camera is the full distance behind the head', () => {
  const { position } = cameraPlacement(head, 0, 0, []);
  expect(distance(position)).toBeCloseTo(Math.hypot(CAMERA_DISTANCE, CAMERA_SHOULDER), 5);
  expect(position.z).toBeCloseTo(CAMERA_DISTANCE, 5);
});

test('a wall 1 m behind the head pulls the camera in to about 0.8 m', () => {
  const { position } = cameraPlacement(head, 0, 0, [wallAt(1.5)]);
  expect(distance(position)).toBeGreaterThan(0.75);
  expect(distance(position)).toBeLessThan(0.9);
});

test('a wall 10 m behind leaves the full distance', () => {
  const { position } = cameraPlacement(head, 0, 0, [wallAt(10.5)]);
  expect(distance(position)).toBeCloseTo(Math.hypot(CAMERA_DISTANCE, CAMERA_SHOULDER), 5);
});

test('a wall closer than the minimum clamps to the minimum distance', () => {
  const { position } = cameraPlacement(head, 0, 0, [wallAt(0.5, 0.1)]);
  expect(distance(position)).toBeCloseTo(CAMERA_MIN_DISTANCE, 5);
});

test('a wall in front of the head does not pull the camera in', () => {
  const { position } = cameraPlacement(head, 0, 0, [wallAt(-3)]);
  expect(distance(position)).toBeCloseTo(Math.hypot(CAMERA_DISTANCE, CAMERA_SHOULDER), 5);
});

test('a box containing the head is ignored', () => {
  const around: Box = { center: vec3(0, PLAYER_EYE_HEIGHT, 2), halfExtents: vec3(20, 5, 0.5), rot: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
  const { position } = cameraPlacement(head, 0, 0, [around]);
  expect(distance(position)).toBeCloseTo(Math.hypot(CAMERA_DISTANCE, CAMERA_SHOULDER), 5);
});

test('a wall turned 30 degrees about Y pulls the camera in along its slanted face', () => {
  const half = (30 * Math.PI) / 180 / 2;
  const turned = (sign: number): Box => ({
    center: vec3(0, PLAYER_EYE_HEIGHT, 1.5),
    halfExtents: vec3(20, 5, 0.1),
    rot: { x: 0, y: sign * Math.sin(half), z: 0, w: Math.cos(half) },
  });
  const plain = distance(cameraPlacement(head, 0, 0, [wallAt(1.5, 0.1)]).position);
  const hit = distance(cameraPlacement(head, 0, 0, [turned(1)]).position);
  const mirrored = distance(cameraPlacement(head, 0, 0, [turned(-1)]).position);
  // 1.4 m to the wall's face, less the margin, along the slanted ray.
  expect(hit).toBeCloseTo(1.071 + (0.2 - CAMERA_WALL_MARGIN), 2);
  expect(Math.abs(hit - plain)).toBeGreaterThan(0.1);
  expect(Math.abs(hit - mirrored)).toBeGreaterThan(0.1);
});

test('the camera is to the right of the aim at yaw 0 and at yaw pi/2', () => {
  expect(cameraPlacement(head, 0, 0, []).position.x).toBeGreaterThan(CAMERA_SHOULDER * 0.8);
  // At yaw pi/2 the player faces -X, so their right is -Z.
  const turned = cameraPlacement(head, Math.PI / 2, 0, []).position;
  expect(turned.z).toBeLessThan(-CAMERA_SHOULDER * 0.8);
  expect(turned.x).toBeGreaterThan(CAMERA_DISTANCE * 0.9);
});

test('the target lies along the aim from the head', () => {
  const { target } = cameraPlacement(head, 0, 0, []);
  expect(target.x).toBeCloseTo(0, 5);
  expect(target.z).toBeLessThan(-5);
  const up = cameraPlacement(head, 0, Math.PI / 4, []).target;
  expect(up.y).toBeGreaterThan(head.y);
  const left = cameraPlacement(head, Math.PI / 2, 0, []).target;
  expect(left.x).toBeLessThan(-5);
  expect(left.z).toBeCloseTo(0, 5);
});

test('ground below pulls the camera in when looking up', () => {
  const ground: Box = { center: vec3(0, -0.5, 0), halfExtents: vec3(50, 0.5, 50), rot: IDENTITY };
  const { position } = cameraPlacement(head, 0, 1.2, [ground]);
  expect(position.y).toBeGreaterThan(0);
});
