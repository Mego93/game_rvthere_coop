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

test('step 41b: every golf and arrival model loads, stands on the ground and has its longest side at the manifest size', async () => {
  const sizes: Partial<Record<ModelKey, number>> = { 'golf.ball': 0.0427, 'golf.driver': 1.12, 'golf.flag': 2.2, 'golf.screen': 8.06, 'arrival.booth': 4.07, 'arrival.terminal': 23.8 };
  for (const [key, longest] of Object.entries(sizes) as [ModelKey, number][]) {
    const size = await sizeOf(key);
    expect(Math.max(size.x, size.y, size.z), key).toBeCloseTo(longest, 2);
    expect(size.minY, key).toBeCloseTo(0, 5);
  }
});

test('step 41b: the screen is wide along z and the driver is long and thin, as the scenes turn and place them', async () => {
  const screen = await sizeOf('golf.screen');
  expect(screen.z).toBeGreaterThan(screen.y);
  expect(screen.x).toBeLessThan(1);
  const driver = await sizeOf('golf.driver');
  expect(driver.y).toBeGreaterThan(3 * Math.max(driver.x, driver.z));
});
