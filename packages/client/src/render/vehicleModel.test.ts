import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VEHICLES, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, expect, test, vi } from 'vitest';
import { MODEL_MANIFEST } from './modelManifest';
import { prepareModel } from './models';
import { createModelMesh, createRealMesh, createVehicleMesh, fitReal, placeVehicleMesh } from './vehicleMesh';

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

// The keys the mocked loader "has", each with a function that makes a fresh model.
const loaded = new Map<string, () => THREE.Group>();

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

beforeEach(() => {
  loaded.clear();
  loaded.set('vehicle.lodgy', van);
  loaded.set('vehicle.rv', van);
});

async function realModel(key: 'vehicle.lodgy.real' | 'vehicle.rv.real'): Promise<THREE.Group> {
  const entry = MODEL_MANIFEST[key];
  const bytes = readFileSync(join(import.meta.dirname, '../../public/models', entry.file));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return prepareModel(gltf.scene, entry.targetSize, entry.pack);
}

const worldBox = (group: THREE.Object3D) => {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
};
const worldBoxOfMaterial = (group: THREE.Object3D, name: string) => {
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === name) box.union(new THREE.Box3().setFromObject(mesh));
  });
  return box;
};
const shadows = (group: THREE.Object3D) => {
  let all = true;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.castShadow) all = false;
  });
  return all;
};
const bottomOf = (config: (typeof VEHICLES)['lodgy']) => config.wheelY - config.suspensionRest - config.wheelRadius;

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

test('M3: fitReal scales by height, stretches the length by at most 1.3 and never shrinks it', () => {
  expect(fitReal({ x: 2, y: 2, z: 4 }, { height: 3, length: 6 })).toEqual({ scale: 1.5, stretch: 1 });
  const stretched = fitReal({ x: 2, y: 2, z: 4 }, { height: 3, length: 8 });
  expect(stretched.scale).toBe(1.5);
  expect(stretched.stretch).toBeCloseTo(1.3);
  expect(fitReal({ x: 2, y: 2, z: 4 }, { height: 3, length: 3 }).stretch).toBe(1);
  expect(fitReal({ x: 2, y: 2, z: 4 }, { height: 3, length: 6.6 }).stretch).toBeCloseTo(1.1);
  expect(() => fitReal({ x: 1, y: 0, z: 1 }, { height: 1, length: 1 })).toThrow();
});

test('M3: the real Lodgy sits on the ground under its box, is as long as the box, faces -Z and has four round wheels', async () => {
  const lodgy = VEHICLES.lodgy;
  const template = await realModel('vehicle.lodgy.real');
  loaded.set('vehicle.lodgy.real', () => template.clone());
  const group = createRealMesh(lodgy)!;
  const box = worldBox(group);
  const h = lodgy.halfExtents;
  expect(box.min.y).toBeCloseTo(bottomOf(lodgy), 2);
  expect(box.max.y).toBeCloseTo(h.y, 2);
  expect(box.max.z - box.min.z).toBeGreaterThan(h.z * 2 - 0.05);
  expect(box.max.z - box.min.z).toBeLessThan(h.z * 2 + 0.05);
  expect((box.max.x - box.min.x) / 2).toBeLessThan(h.x * 1.25);
  const wheels: THREE.Object3D[] = [];
  group.traverse((o) => /^wheel-(front|back)-(left|right)$/.test(o.name) && wheels.push(o));
  expect(wheels).toHaveLength(4);
  for (const wheel of wheels) {
    const wheelBox = worldBox(wheel);
    expect(wheelBox.min.y).toBeCloseTo(bottomOf(lodgy), 1);
    expect(wheel.scale.x).toBeCloseTo(wheel.scale.z);
    expect(wheel.scale.x).toBeCloseTo(wheel.scale.y);
  }
  const fogLight = worldBoxOfMaterial(group, 'lodgy_foglight');
  expect(fogLight.getCenter(new THREE.Vector3()).z).toBeLessThan(-h.z + 0.5);
  expect(shadows(group)).toBe(true);
});

test('M3: the real camper is as tall as the box, never wider than it, about as long as it, with no wheel nodes to roll', async () => {
  const rv = VEHICLES.rv;
  const template = await realModel('vehicle.rv.real');
  loaded.set('vehicle.rv.real', () => template.clone());
  const group = createRealMesh(rv)!;
  const box = worldBox(group);
  const h = rv.halfExtents;
  expect(box.min.y).toBeCloseTo(bottomOf(rv), 2);
  expect(box.max.y - box.min.y).toBeCloseTo(h.y * 2, 2);
  expect(box.max.x - box.min.x).toBeLessThanOrEqual(h.x * 2);
  expect(box.max.z - box.min.z).toBeGreaterThan(h.z * 2 * 0.95);
  expect(box.max.z - box.min.z).toBeLessThanOrEqual(h.z * 2 * 1.01);
  expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 2);
  expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 2);
  expect(() => placeVehicleMesh(group, state(-1))).not.toThrow();
});

test('M3: the real Lodgy rolls its wheels forward and the camper is drawn by default, the Car Kit models after it', async () => {
  const lodgy = VEHICLES.lodgy;
  const template = await realModel('vehicle.lodgy.real');
  loaded.set('vehicle.lodgy.real', () => template.clone());
  const group = createVehicleMesh(lodgy);
  const wheel = group.getObjectByName('wheel-front-right')!;
  placeVehicleMesh(group, state(0));
  placeVehicleMesh(group, state(-0.5));
  const top = new THREE.Vector3(0, 1, 0).applyEuler(wheel.rotation);
  expect(top.z).toBeLessThan(0);
  expect(Math.abs(wheel.rotation.x)).toBeGreaterThan(0.5 / lodgy.wheelRadius / 1.3);
  expect(Math.abs(wheel.rotation.x)).toBeLessThan(0.5 / lodgy.wheelRadius * 1.3);

  expect(createVehicleMesh(lodgy, true).children[0]!.rotation.y).toBeCloseTo(Math.PI);

  const camper = await realModel('vehicle.rv.real');
  loaded.set('vehicle.rv.real', () => camper.clone());
  expect(createVehicleMesh(VEHICLES.rv).getObjectByName('wheel')).toBeUndefined();
  expect(worldBox(createVehicleMesh(VEHICLES.rv)).max.y - worldBox(createVehicleMesh(VEHICLES.rv)).min.y).toBeCloseTo(VEHICLES.rv.halfExtents.y * 2, 2);
  loaded.delete('vehicle.rv.real');
  expect(createVehicleMesh(VEHICLES.rv).children[0]!.rotation.y).toBeCloseTo(Math.PI);
  loaded.clear();
  expect(createVehicleMesh(VEHICLES.rv).getObjectByName('cab')).toBeDefined();
});

test('M3: the real pack keeps its colours (no ochre tint) and its materials have no metal', async () => {
  for (const key of ['vehicle.lodgy.real', 'vehicle.rv.real'] as const) {
    const root = await realModel(key);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      expect(material.isMeshStandardMaterial, key).toBe(true);
      expect(material.metalness, key).toBe(0);
    });
  }
  const lodgy = await realModel('vehicle.lodgy.real');
  const paint = worldBoxOfMaterial(lodgy, 'Paint');
  expect(paint.isEmpty()).toBe(false);
  let colour: THREE.Color | null = null;
  lodgy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Paint') colour = (mesh.material as THREE.MeshStandardMaterial).color;
  });
  const paintColour = colour as unknown as THREE.Color;
  expect(Math.min(paintColour.r, paintColour.g, paintColour.b)).toBeGreaterThan(0.8);
});
