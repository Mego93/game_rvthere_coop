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

test('step 40: the pine is about 12 m tall, the hatchback about 4 m long and the kasbah about 40 m wide, each on the ground', async () => {
  const pine = await sizeOf('decor.pine');
  expect(pine.y).toBeCloseTo(12, 1);
  expect(pine.minY).toBeCloseTo(0, 5);
  const car = await sizeOf('decor.car.hatchback');
  expect(Math.max(car.x, car.z)).toBeCloseTo(4, 1);
  expect(car.y).toBeLessThan(2.2);
  const kasbah = await sizeOf('decor.kasbah.landmark');
  expect(Math.max(kasbah.x, kasbah.z)).toBeCloseTo(40, 1);
});

test('step 40: the broadleaf, the adobe house and the minicab come out at believable sizes', async () => {
  const tree = await sizeOf('decor.broadleaf');
  expect(Math.max(tree.x, tree.y, tree.z)).toBeCloseTo(9, 1);
  const house = await sizeOf('decor.adobe');
  expect(Math.max(house.x, house.y, house.z)).toBeCloseTo(9, 1);
  const cab = await sizeOf('decor.car.minicab');
  expect(Math.max(cab.x, cab.z)).toBeCloseTo(3.6, 1);
});
