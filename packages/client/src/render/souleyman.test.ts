import { CHARACTER_SCALE, quatFromAxisAngle, AXIS_Y, vec3, type Checkpoint } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createSouleymanMesh, SOULEYMAN_GREETING, SOULEYMAN_LATERAL, souleymanPlacements } from './souleyman';

const box = { center: vec3(0, 0, 0), halfExtents: vec3(1, 1, 1), rot: { x: 0, y: 0, z: 0, w: 1 } };
const checkpoint = (id: string, x: number, y: number, z: number, yaw: number): Checkpoint => ({
  id,
  trigger: box,
  spawn: { pos: vec3(x, y, z), rot: quatFromAxisAngle(AXIS_Y, yaw) },
});

test('T1: yaw 0 puts him SOULEYMAN_LATERAL to the right, on the spawn height', () => {
  const [placement] = souleymanPlacements([checkpoint('a', 5, 2.5, -40, 0)]);
  expect(placement!.x).toBeCloseTo(5 + SOULEYMAN_LATERAL);
  expect(placement!.z).toBeCloseTo(-40);
  expect(placement!.y).toBe(2.5);
});

test('T1: the offset rotates with the yaw; one placement per checkpoint in order', () => {
  const list = [checkpoint('a', 0, 0, 0, 0), checkpoint('b', 10, 1, 20, Math.PI / 2), checkpoint('c', -3, 2, 7, 1)];
  const placed = souleymanPlacements(list);
  expect(placed).toHaveLength(3);
  // Yaw 90 degrees turns left: forward is -x, so right is -z.
  expect(placed[1]!.x).toBeCloseTo(10);
  expect(placed[1]!.z).toBeCloseTo(20 - SOULEYMAN_LATERAL);
  expect(placed[1]!.y).toBe(1);
  expect(placed[2]!.x).toBeCloseTo(-3 + SOULEYMAN_LATERAL * Math.cos(1));
  expect(placed[2]!.z).toBeCloseTo(7 - SOULEYMAN_LATERAL * Math.sin(1));
});

test('T2: the figure faces the road centre for two yaws', () => {
  for (const yaw of [0, 0.9]) {
    const cp = checkpoint('a', 4, 0, -9, yaw);
    const [p] = souleymanPlacements([cp]);
    const facing = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p!.yaw);
    const toCentre = new THREE.Vector3(4 - p!.x, 0, -9 - p!.z).normalize();
    expect(facing.dot(toCentre)).toBeCloseTo(1);
  }
});

test('T3: height is about 1.8 x CHARACTER_SCALE, everything casts shadows, hood, turban and robe exist', () => {
  const figure = createSouleymanMesh();
  const size = new THREE.Box3().setFromObject(figure).getSize(new THREE.Vector3());
  expect(Math.abs(size.y - 1.8 * CHARACTER_SCALE) / (1.8 * CHARACTER_SCALE)).toBeLessThan(0.05);
  expect(new THREE.Box3().setFromObject(figure).min.y).toBeCloseTo(0);
  const names = new Set<string>();
  figure.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      expect((object as THREE.Mesh).castShadow).toBe(true);
      names.add(object.name);
    }
  });
  for (const part of ['hood', 'turban', 'robe']) expect(names.has(part)).toBe(true);
});

test('the greeting text', () => {
  expect(SOULEYMAN_GREETING).toBe('Souleyman: Saved. Bonne route!');
});
