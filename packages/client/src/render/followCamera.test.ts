import * as THREE from 'three';
import { expect, test } from 'vitest';
import { BUGGY_OFFSET, updateFollowCamera } from './followCamera';

const state = { pos: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, linvel: { x: 0, y: 0, z: 0 }, throttle: 0, steer: 0, fuel: 1, health: 1 };

test('the camera settles behind and above the vehicle, nearer for the buggy', () => {
  const far = new THREE.PerspectiveCamera();
  const near = new THREE.PerspectiveCamera();
  updateFollowCamera(far, state, 10);
  updateFollowCamera(near, state, 10, BUGGY_OFFSET);
  expect(far.position.z).toBeCloseTo(11, 1);
  expect(far.position.y).toBeCloseTo(5.5, 1);
  expect(near.position.z).toBeCloseTo(8, 1);
  expect(near.position.z).toBeLessThan(far.position.z);
});
