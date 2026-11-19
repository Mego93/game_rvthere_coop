import { ENEMY_HALF, PLAYER_RADIUS, type EnemySnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test, vi } from 'vitest';
import { createEnemyMeshes } from './enemyMeshes';

vi.mock('./models', () => ({ hasModel: () => false, instantiate: () => null, shadowed: (root: THREE.Object3D) => root }));

const enemy = (id: number, state: EnemySnapshot['state'] = 'run', over: Partial<EnemySnapshot> = {}): EnemySnapshot => ({ id, x: 3, y: 0.7, z: -8, yaw: 0.5, state, ...over });

test('step 39: a figure appears for each listed enemy with its feet on the ground under the hit box centre, facing its yaw, and goes when it is no longer listed', () => {
  const scene = new THREE.Scene();
  const meshes = createEnemyMeshes(scene);
  meshes.update([enemy(1), enemy(2, 'idle', { x: 9 })], 0.016);
  expect(scene.children).toHaveLength(2);
  const first = scene.children[0]!;
  expect(first.position.x).toBe(3);
  expect(first.position.y).toBeCloseTo(0.7 - ENEMY_HALF.y, 9);
  expect(first.position.z).toBe(-8);
  expect(first.rotation.y).toBe(0.5);
  meshes.update([enemy(2, 'idle', { x: 9 })], 0.016);
  expect(scene.children).toHaveLength(1);
  expect(scene.children[0]!.position.x).toBe(9);
  meshes.dispose();
  expect(scene.children).toHaveLength(0);
});

test('step 39: a slipping enemy lies down within the slip and a running one leans forward', () => {
  const scene = new THREE.Scene();
  const meshes = createEnemyMeshes(scene);
  meshes.update([enemy(1, 'run')], 0.016);
  const body = scene.children[0]!.children[0]!;
  expect(body.rotation.x).toBeLessThan(0);
  meshes.update([enemy(1, 'slip')], 0.016);
  for (let i = 0; i < 30; i++) meshes.update([enemy(1, 'slip')], 0.016);
  expect(body.rotation.x).toBeCloseTo(Math.PI / 2, 6);
  expect(body.position.y).toBeCloseTo(PLAYER_RADIUS, 6);
  for (let i = 0; i < 60; i++) meshes.update([enemy(1, 'run')], 0.016);
  expect(body.rotation.x).toBeLessThan(0);
  expect(body.position.y).toBe(0);
});
