import { COIN_RADIUS, vec3, type Placed } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeEach, expect, test, vi } from 'vitest';
import { createCoinMeshes, fitCoinModel } from './coinMesh';
import { loadManifestModel } from './modelTestHelper';

const loaded = new Map<string, () => THREE.Group>();

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

beforeEach(() => loaded.clear());

const coin = (id: string, x: number): Placed => ({ id, pose: { pos: vec3(x, 1, -4), rot: { x: 0, y: 0, z: 0, w: 1 } } }) as Placed;

test('T4: the coin model stands on its edge, is COIN_RADIUS * 2 across and is centred on its origin', async () => {
  const fit = fitCoinModel(await loadManifestModel('coin'));
  fit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fit);
  const size = box.getSize(new THREE.Vector3());
  expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(COIN_RADIUS * 2, 5);
  expect(size.z).toBeLessThan(size.x * 0.4);
  expect(size.x).toBeCloseTo(size.y, 1);
  const centre = box.getCenter(new THREE.Vector3());
  expect(centre.length()).toBeLessThan(1e-6);
});

test('coins are placed, hidden once taken and turned, as the model or as the procedural disc', () => {
  for (const withModel of [false, true]) {
    loaded.clear();
    if (withModel) loaded.set('coin', () => new THREE.Group().add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 8), new THREE.MeshBasicMaterial())));
    const scene = new THREE.Scene();
    const meshes = createCoinMeshes(scene, [coin('a', 1), coin('b', 2)]);
    expect(scene.children).toHaveLength(2);
    expect(scene.children[1]!.position.x).toBe(2);
    meshes.update(new Set(['a']), 2);
    expect(scene.children[0]!.visible).toBe(true);
    expect(scene.children[1]!.visible).toBe(false);
    expect(scene.children[0]!.rotation.y).toBeCloseTo(3);
    expect(Boolean((scene.children[0] as THREE.Mesh).isMesh)).toBe(!withModel);
    meshes.dispose();
    expect(scene.children).toHaveLength(0);
  }
});
