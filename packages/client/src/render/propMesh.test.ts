import { ITEM_KINDS, PROP_KINDS, type ItemKind, type PropKind } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeEach, expect, test, vi } from 'vitest';
import { loadManifestModel } from './modelTestHelper';
import { createPropMesh, fitItemModel, fitPropModel, ITEM_MODEL_KEYS, PROP_MODEL_KEYS } from './propMesh';

const loaded = new Map<string, () => THREE.Group>();

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

beforeEach(() => loaded.clear());

const sizeOf = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

const expectFit = (object: THREE.Object3D, half: { x: number; y: number; z: number }, label: string) => {
  const box = sizeOf(object);
  const size = box.getSize(new THREE.Vector3());
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(Math.abs(size[axis] - half[axis] * 2) / (half[axis] * 2), `${label} ${axis}`).toBeLessThanOrEqual(0.1);
  }
  expect(box.min.y, label).toBeCloseTo(-half.y, 5);
};

test('T4: every prop model fits its hit box within 10 % on each axis and rests on its bottom', async () => {
  for (const kind of Object.keys(PROP_KINDS) as PropKind[]) {
    const model = await loadManifestModel(PROP_MODEL_KEYS[kind] as never);
    expectFit(fitPropModel(model, kind), PROP_KINDS[kind].halfExtents, kind);
  }
});

test('T4: every item model fits its hit box within 10 % on each axis', async () => {
  for (const kind of Object.keys(ITEM_KINDS) as ItemKind[]) {
    const model = await loadManifestModel(ITEM_MODEL_KEYS[kind] as never);
    expectFit(fitItemModel(model, kind), ITEM_KINDS[kind].halfExtents, kind);
  }
});

test('a prop or item whose model loaded is drawn as the model, otherwise as a box or the procedural item', async () => {
  const fallbackCrate = createPropMesh('crate');
  expect((fallbackCrate as THREE.Mesh).isMesh).toBe(true);
  const fallbackJerrycan = createPropMesh('jerrycan');
  expect(fallbackJerrycan.children.length).toBeGreaterThan(3);

  loaded.set('prop.crate', () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), new THREE.MeshBasicMaterial())));
  loaded.set('item.toolbox', () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshBasicMaterial())));
  const crate = createPropMesh('crate');
  expect((crate as THREE.Mesh).isMesh).toBeFalsy();
  expectFit(crate, PROP_KINDS.crate.halfExtents, 'crate');
  expectFit(createPropMesh('toolbox'), ITEM_KINDS.toolbox.halfExtents, 'toolbox');
  expect(createPropMesh('toolbox').children).toHaveLength(1);
});

test('the barrier, cart and scooter models are turned so their long side runs along the hit box long side', async () => {
  for (const kind of ['barrier', 'cart', 'scooter'] as const) {
    const model = await loadManifestModel(PROP_MODEL_KEYS[kind] as never);
    const box = sizeOf(fitPropModel(model, kind));
    const size = box.getSize(new THREE.Vector3());
    const h = PROP_KINDS[kind].halfExtents;
    expect(size.x > size.z, kind).toBe(h.x > h.z);
  }
});
