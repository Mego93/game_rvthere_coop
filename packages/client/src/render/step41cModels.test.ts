import * as THREE from 'three';
import { VEHICLES } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { loadManifestModel } from './modelTestHelper';
import type { ModelKey } from './modelManifest';

const sizeOf = async (key: ModelKey) => {
  const model = await loadManifestModel(key);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z, minY: box.min.y };
};

test('step 41c: the tent, the camel, the table and the cushion load, stand on the ground and have their longest side at the manifest size', async () => {
  const sizes: Partial<Record<ModelKey, number>> = { 'decor.tent': 7.4, 'decor.camel': 2.9, 'camp.table': 1.05, 'camp.cushion': 1.98 };
  for (const [key, longest] of Object.entries(sizes) as [ModelKey, number][]) {
    const size = await sizeOf(key);
    expect(Math.max(size.x, size.y, size.z), key).toBeCloseTo(longest, 2);
    expect(size.minY, key).toBeCloseTo(0, 5);
  }
});

test('step 41c: the tent is long along x and low, the camel is long along x and the cushion is flat, as the scenes turn and place them', async () => {
  const tent = await sizeOf('decor.tent');
  expect(tent.x).toBeGreaterThan(tent.z);
  expect(tent.y).toBeLessThan(tent.z);
  const camel = await sizeOf('decor.camel');
  expect(camel.x).toBeGreaterThan(camel.z * 2);
  expect(camel.y).toBeGreaterThan(2);
  const cushion = await sizeOf('camp.cushion');
  expect(cushion.y).toBeLessThan(cushion.x / 5);
});

test('step 41c: the buggy file is built at the buggy\'s own size: wheels at its track and wheelbase and radius, ground at y 0, nose to -Z', async () => {
  const config = VEHICLES.buggy;
  const model = await loadManifestModel('vehicle.buggy');
  const scene = model.children[0]!;
  expect(scene.scale.x).toBeCloseTo(1, 3);
  const wheels = scene.children.filter((child) => child.name.startsWith('wheel'));
  expect(wheels.map((wheel) => wheel.name).sort()).toEqual(['wheel-back-left', 'wheel-back-right', 'wheel-front-left', 'wheel-front-right']);
  for (const wheel of wheels) {
    const front = wheel.name.includes('front');
    const left = wheel.name.endsWith('left');
    expect(wheel.position.x, wheel.name).toBeCloseTo(left ? -config.wheelX : config.wheelX, 2);
    expect(wheel.position.z, wheel.name).toBeCloseTo(front ? -config.wheelZ : config.wheelZ, 2);
    const box = new THREE.Box3().setFromObject(wheel);
    expect((box.max.y - box.min.y) / 2, wheel.name).toBeCloseTo(config.wheelRadius, 1);
    expect(wheel.position.y, wheel.name).toBeCloseTo(config.wheelRadius, 2);
  }
  const body = scene.children.find((child) => child.name === 'body')!;
  const bodyBox = new THREE.Box3().setFromObject(body);
  expect(bodyBox.min.z).toBeGreaterThan(-config.halfExtents.z - 0.1);
  expect(bodyBox.max.z).toBeLessThan(config.halfExtents.z + 0.2);
  expect(bodyBox.max.x - bodyBox.min.x).toBeLessThan(2 * config.halfExtents.x + 0.3);
});
