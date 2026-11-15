import { VEHICLES, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test, vi } from 'vitest';
import { createModelMesh, createVehicleMesh, placeVehicleMesh } from './vehicleMesh';

// A van of the Car Kit's shape: a body 1.5 x 1.35 x 2.75 and four wheel nodes of radius 0.3, front at +Z.
function van(): THREE.Group {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 2.75).translate(0, 0.75, 0), new THREE.MeshBasicMaterial());
  body.name = 'body';
  scene.add(body);
  for (const [name, x, z] of [['wheel-front-right', -0.3, 0.76], ['wheel-front-left', 0.3, 0.76], ['wheel-back-right', -0.3, -0.76], ['wheel-back-left', 0.3, -0.76]] as const) {
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.6), new THREE.MeshBasicMaterial());
    wheel.name = name;
    wheel.position.set(x, 0.3, z);
    scene.add(wheel);
  }
  const root = new THREE.Group();
  root.add(scene);
  return root;
}

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: () => true,
  instantiate: () => van(),
}));

const state = (z: number): VehicleState => ({ pos: { x: 0, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, linvel: { x: 0, y: 0, z: 0 }, throttle: 0, steer: 0, fuel: 1, health: 1 });

test('M3: the Lodgy model fits its collision box and keeps round wheels at the ground', () => {
  const lodgy = VEHICLES.lodgy;
  const group = createModelMesh(lodgy)!;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const bottom = lodgy.wheelY - lodgy.suspensionRest - lodgy.wheelRadius;
  expect(box.max.x - box.min.x).toBeCloseTo(lodgy.halfExtents.x * 2, 1);
  expect(box.min.y).toBeCloseTo(bottom, 1);
  expect(box.max.z - box.min.z).toBeGreaterThan(lodgy.halfExtents.z * 2 - 0.05);
  const wheels: THREE.Object3D[] = [];
  group.traverse((o) => o.name.startsWith('wheel') && wheels.push(o));
  expect(wheels).toHaveLength(4);
  for (const wheel of wheels) expect(wheel.scale.x).toBeCloseTo(lodgy.wheelRadius / 0.3);
});

test('M3: the Lodgy is drawn as the model, turned to face -Z', () => {
  expect(createVehicleMesh(VEHICLES.lodgy).children[0]!.rotation.y).toBeCloseTo(Math.PI);
});

test('M3: wheels roll by the distance driven along the nose and ignore a restart jump', () => {
  const group = createModelMesh(VEHICLES.lodgy)!;
  const wheels: THREE.Object3D[] = [];
  group.traverse((o) => o.name.startsWith('wheel') && wheels.push(o));
  placeVehicleMesh(group, state(0));
  placeVehicleMesh(group, state(-1));
  expect(wheels[0]!.rotation.x).toBeCloseTo(1 / VEHICLES.lodgy.wheelRadius);
  placeVehicleMesh(group, state(-1 - 40));
  expect(wheels[0]!.rotation.x).toBeCloseTo(1 / VEHICLES.lodgy.wheelRadius);
  placeVehicleMesh(group, state(-40.5));
  expect(wheels[0]!.rotation.x).toBeCloseTo(0.5 / VEHICLES.lodgy.wheelRadius);
});
