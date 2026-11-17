import { ANIMAL_HALF_GOAT, ANIMAL_HALF_SCOOTER, type AnimalSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeEach, expect, test, vi } from 'vitest';
import { createAnimalMeshes, createGoatMesh, fitGoatModel, HIT_TILT } from './animalMeshes';
import { loadManifestModel } from './modelTestHelper';

const loaded = new Map<string, () => THREE.Group>();

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

beforeEach(() => loaded.clear());

const goat = (id: number, x = 0, extra: Partial<AnimalSnapshot> = {}): AnimalSnapshot => ({ id, kind: 'goat', x, y: 0.4, z: -10, yaw: 0, ...extra });
const scooter = (id: number): AnimalSnapshot => ({ id, kind: 'scooter', x: 2, y: 0.5, z: -12, yaw: 1, });

test('T9: the goat group has named parts that fit the goat half extents', () => {
  const group = createGoatMesh();
  const names: Record<string, number> = {};
  for (const child of group.children) names[child.name] = (names[child.name] ?? 0) + 1;
  expect(names).toEqual({ body: 1, head: 1, leg: 4, horn: 2 });
  group.updateMatrixWorld();
  const box = new THREE.Box3().setFromObject(group);
  expect(box.min.x).toBeGreaterThanOrEqual(-ANIMAL_HALF_GOAT.x - 1e-6);
  expect(box.max.x).toBeLessThanOrEqual(ANIMAL_HALF_GOAT.x + 1e-6);
  expect(box.min.y).toBeGreaterThanOrEqual(-ANIMAL_HALF_GOAT.y - 1e-6);
  expect(box.max.y).toBeLessThanOrEqual(ANIMAL_HALF_GOAT.y + ANIMAL_HALF_GOAT.x + 1e-6);
  expect(box.min.z).toBeGreaterThanOrEqual(-ANIMAL_HALF_GOAT.z - 1e-6);
  expect(box.max.z).toBeLessThanOrEqual(ANIMAL_HALF_GOAT.z + 1e-6);
  const body = group.children.find((c) => c.name === 'body') as THREE.Mesh;
  expect((body.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xcbbf9a);
});

test('T9: meshes appear with an id, move with it, and go when it disappears', () => {
  const scene = new THREE.Scene();
  const meshes = createAnimalMeshes(scene);
  meshes.update([goat(1, 0), scooter(2)]);
  expect(scene.children).toHaveLength(2);
  const first = scene.children[0]!;
  expect(first.position.x).toBe(0);
  meshes.update([goat(1, 3), scooter(2)]);
  expect(scene.children[0]).toBe(first);
  expect(first.position.x).toBe(3);
  expect(first.position.y).toBeCloseTo(0.4);
  expect(scene.children[1]!.position.z).toBe(-12);
  meshes.update([scooter(2)]);
  expect(scene.children).toHaveLength(1);
  meshes.update([]);
  expect(scene.children).toHaveLength(0);
  meshes.dispose();
});

test('T9: the scooter is drawn as the scooter prop and a goat turns with its yaw', () => {
  const scene = new THREE.Scene();
  const meshes = createAnimalMeshes(scene);
  meshes.update([scooter(2), goat(1, 0, { yaw: 0.5 })]);
  const root = scene.children[0]!;
  root.updateMatrixWorld();
  expect(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).z).toBeGreaterThan(0);
  const size = new THREE.Box3().setFromObject(root.children[0]!).getSize(new THREE.Vector3());
  expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(ANIMAL_HALF_SCOOTER.z * 2 - 1e-3);
  const goatRoot = scene.children[1]!;
  expect(new THREE.Euler().setFromQuaternion(goatRoot.quaternion, 'YXZ').y).toBeCloseTo(0.5);
});

test('T9: a hit animal lies tipped over about its long axis, and stands again if no longer hit', () => {
  const scene = new THREE.Scene();
  const meshes = createAnimalMeshes(scene);
  meshes.update([goat(1)]);
  const inner = scene.children[0]!.children[0]!;
  expect(inner.rotation.z).toBe(0);
  meshes.update([goat(1, 0, { hit: true })]);
  expect(Math.abs(inner.rotation.z)).toBeCloseTo(HIT_TILT);
  expect(Math.abs(HIT_TILT)).toBeGreaterThan(1);
  expect(inner.position.y).toBeLessThan(0);
  meshes.update([goat(1)]);
  expect(inner.rotation.z).toBe(0);
});

test('T9: a hit animal keeps its tipped pose while it is knocked along, and a reused id starts fresh', () => {
  const scene = new THREE.Scene();
  const meshes = createAnimalMeshes(scene);
  meshes.update([goat(1, 0, { hit: true })]);
  meshes.update([goat(1, 2, { hit: true, y: 0.7 })]);
  const root = scene.children[0]!;
  expect(root.position.x).toBe(2);
  expect(root.position.y).toBe(0.7);
  expect(Math.abs(root.children[0]!.rotation.z)).toBeCloseTo(HIT_TILT);
  meshes.update([]);
  meshes.update([goat(1, 5)]);
  expect(scene.children).toHaveLength(1);
  expect(scene.children[0]!.children[0]!.rotation.z).toBe(0);
  meshes.update([scooter(1)]);
  expect(scene.children).toHaveLength(1);
  expect(scene.children[0]!.children[0]!.name).not.toBe('body');
});

test('T4: the goat model fits ANIMAL_HALF_GOAT within 10 % on each axis, rests on the box bottom and has its head at -z', async () => {
  const model = fitGoatModel(await loadManifestModel('animal.goat'));
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(Math.abs(size[axis] - ANIMAL_HALF_GOAT[axis] * 2) / (ANIMAL_HALF_GOAT[axis] * 2), axis).toBeLessThanOrEqual(0.1);
  }
  expect(box.min.y).toBeCloseTo(-ANIMAL_HALF_GOAT.y, 5);
  // The horns are the only part of the file on its +y side of the head: the horn material's centre sits toward the head.
  let horn: THREE.Mesh | undefined;
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Goat_Horn') horn = mesh;
  });
  expect(horn).toBeDefined();
  expect(new THREE.Box3().setFromObject(horn!).getCenter(new THREE.Vector3()).z).toBeLessThan(0);
});

test('a goat whose model loaded is drawn as the model and still tips over when hit; without it the blocky goat stays', () => {
  const scene = new THREE.Scene();
  const meshes = createAnimalMeshes(scene);
  meshes.update([goat(1)]);
  expect(scene.children[0]!.children[0]!.children.some((c) => c.name === 'body')).toBe(true);
  meshes.update([]);
  loaded.set('animal.goat', () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), new THREE.MeshBasicMaterial())));
  meshes.update([goat(2, 0, { hit: true })]);
  const inner = scene.children[0]!.children[0]!;
  expect(inner.children.some((c) => c.name === 'body')).toBe(false);
  expect(Math.abs(inner.rotation.z)).toBeCloseTo(HIT_TILT);
  meshes.update([]);
  expect(scene.children).toHaveLength(0);
  meshes.dispose();
});
