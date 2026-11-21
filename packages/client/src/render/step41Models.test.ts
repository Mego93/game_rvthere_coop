import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadManifestModel } from './modelTestHelper';
import type { ModelKey } from './modelManifest';

const sizeOf = async (key: ModelKey) => {
  const model = await loadManifestModel(key);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z, minY: box.min.y };
};

test('step 41: every villa model loads, stands on the ground and has its longest side at the manifest size', async () => {
  const sizes: Partial<Record<ModelKey, number>> = { 'villa.couch': 2.4, 'villa.bed': 2.1, 'villa.laptop': 0.34, 'villa.lounger': 2, 'villa.atm': 2, 'villa.kiosk': 3.5, 'villa.court': 20, 'villa.treadmill': 1.8 };
  for (const [key, longest] of Object.entries(sizes) as [ModelKey, number][]) {
    const size = await sizeOf(key);
    expect(Math.max(size.x, size.y, size.z), key).toBeCloseTo(longest, 1);
    expect(size.minY, key).toBeCloseTo(0, 5);
  }
});

test('step 41: the parasol file holds a pair, so the villa splits it; the pair is wider than it is tall', async () => {
  const pair = await sizeOf('villa.parasol');
  expect(pair.x).toBeGreaterThan(2 * pair.z);
});

test('step 41: the court is longer than it is wide, as the villa stretches it onto the 12 by 18 m court box', async () => {
  const court = await sizeOf('villa.court');
  expect(court.z).toBeGreaterThan(court.x);
});
