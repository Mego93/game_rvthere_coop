import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadManifestModel } from './modelTestHelper';
import { STRIPE_COLOUR, TENT_CANVAS, TENT_WOOD, dressTent } from './tentLook';

const canopyOf = (root: THREE.Object3D) => {
  let canopy: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'tent-canvas') canopy = mesh;
  });
  return canopy as THREE.Mesh | null;
};

test('the tent\'s canopy is tinted sand and its poles and mats stay near white', async () => {
  const root = await loadManifestModel('decor.tent');
  dressTent(root);
  const canopy = canopyOf(root)!;
  expect((canopy.material as THREE.MeshStandardMaterial).color.getHex()).toBe(TENT_CANVAS);
  let others = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh === canopy || mesh.name.startsWith('tent-stripe')) return;
    others++;
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(TENT_WOOD);
  });
  expect(others).toBeGreaterThan(5);
});

test('a red stripe lies across the canopy, just above its surface, and the tent keeps its size', async () => {
  const root = await loadManifestModel('decor.tent');
  const before = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  dressTent(root);
  const stripes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object.name.startsWith('tent-stripe')) stripes.push(object as THREE.Mesh);
  });
  expect(stripes.length).toBeGreaterThanOrEqual(1);
  for (const stripe of stripes) expect((stripe.material as THREE.MeshStandardMaterial).color.getHex()).toBe(STRIPE_COLOUR);
  const canopyBox = new THREE.Box3().setFromObject(canopyOf(root)!);
  for (const stripe of stripes) {
    const box = new THREE.Box3().setFromObject(stripe);
    expect(box.min.y).toBeGreaterThan(canopyBox.min.y);
    expect(box.max.y).toBeLessThan(canopyBox.max.y + 0.1);
  }
  const after = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeLessThan(before.y + 0.1);
});
