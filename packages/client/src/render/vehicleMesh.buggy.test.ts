import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VEHICLES, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, expect, test, vi } from 'vitest';
import { MODEL_MANIFEST } from './modelManifest';
import { prepareModel } from './models';
import { createBuggyMesh, createVehicleMesh, placeVehicleMesh, seatedFigureAt, seatsShown } from './vehicleMesh';

const loaded = new Map<string, () => THREE.Group>();

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

const config = VEHICLES.buggy;
// The file's wheel nodes sit at the config's wheels in the model's own frame: the ground is y 0.
const bottom = config.wheelY - config.suspensionRest - config.wheelRadius;

async function buggyFile(): Promise<() => THREE.Group> {
  const entry = MODEL_MANIFEST['vehicle.buggy'];
  const bytes = readFileSync(join(import.meta.dirname, '../../public/models', entry.file));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'TEST_NO_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return () => prepareModel(gltf.scene.clone(true), entry.targetSize, entry.pack);
}

beforeEach(async () => {
  loaded.clear();
  loaded.set('vehicle.buggy', await buggyFile());
});

const worldBox = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

test('8: the buggy mesh has its four wheels where the physics has them and the ground under the wheels', () => {
  const mesh = createBuggyMesh(config)!;
  expect(mesh).not.toBeNull();
  const wheels: THREE.Object3D[] = [];
  mesh.traverse((object) => {
    if (object.name.startsWith('wheel')) wheels.push(object);
  });
  expect(wheels).toHaveLength(4);
  mesh.updateMatrixWorld(true);
  const at = new THREE.Vector3();
  const expected = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [x! * config.wheelX, config.wheelY - config.suspensionRest, z! * config.wheelZ]);
  const found = wheels.map((wheel) => wheel.getWorldPosition(at.clone()).toArray());
  for (const [x, y, z] of expected) {
    expect(found.some((p) => Math.abs(p[0]! - x!) < 0.01 && Math.abs(p[1]! - y!) < 0.01 && Math.abs(p[2]! - z!) < 0.01), `wheel at ${x},${y},${z}`).toBe(true);
  }
  // The wheels are as big as the physics' and their lowest point is the ground.
  expect(worldBox(mesh).min.y).toBeCloseTo(bottom, 1);
  for (const wheel of wheels) expect((worldBox(wheel).max.y - worldBox(wheel).min.y) / 2).toBeCloseTo(config.wheelRadius, 1);
});

test('8: the buggy mesh fits the collision box, not much beyond it', () => {
  const box = worldBox(createBuggyMesh(config)!);
  expect(box.min.z).toBeGreaterThan(-config.halfExtents.z - 0.2);
  expect(box.max.z).toBeLessThan(config.halfExtents.z + 0.3);
  expect(box.max.x).toBeLessThan(config.halfExtents.x + 0.5);
  expect(box.min.x).toBeGreaterThan(-config.halfExtents.x - 0.5);
});

test('8: six seats and a roll bar are built in code at the buggy\'s seat positions, a bench for each of the two rear rows', () => {
  const mesh = createBuggyMesh(config)!;
  for (const seat of config.seats) {
    const cushion = mesh.getObjectByName(`seat-${seat.id}`);
    expect(cushion, seat.id).toBeDefined();
    expect(cushion!.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(seat.pos.x, 1);
    expect(cushion!.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(seat.pos.z, 1);
    expect(cushion!.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(seat.pos.y);
  }
  expect(mesh.getObjectByName('bench-1')).toBeDefined();
  expect(mesh.getObjectByName('bench-2')).toBeDefined();
  expect(mesh.getObjectByName('roll-bar')).toBeDefined();
  const bar = worldBox(mesh.getObjectByName('roll-bar')!);
  expect(bar.max.y).toBeGreaterThan(config.seats[0]!.pos.y + 0.8);
  expect(worldBox(mesh.getObjectByName('roll-bar-top')!).min.z).toBeGreaterThan(config.seats[4]!.pos.z);
});

test('8: a seated figure sits at its seat, below the seat height, and all six places differ', () => {
  const places = config.seats.map((seat) => seatedFigureAt(config, seat.id)!);
  for (const [index, seat] of config.seats.entries()) {
    expect(places[index]!.x).toBeCloseTo(seat.pos.x, 5);
    expect(places[index]!.z).toBeCloseTo(seat.pos.z, 1);
    expect(places[index]!.y).toBeLessThan(seat.pos.y);
  }
  expect(new Set(places.map((p) => `${p.x}|${p.z}`)).size).toBe(6);
  expect(seatedFigureAt(config, 'nope')).toBeNull();
});

test('8: only the open buggy shows its seated players', () => {
  expect(seatsShown(VEHICLES.buggy)).toBe(true);
  expect(seatsShown(VEHICLES.lodgy)).toBe(false);
  expect(seatsShown(VEHICLES.rv)).toBe(false);
});

test('8: createVehicleMesh draws the buggy model with its seats, and boxes with the seats when the model is missing', () => {
  expect(createVehicleMesh(config).getObjectByName('roll-bar')).toBeDefined();
  loaded.clear();
  const boxes = createVehicleMesh(config);
  expect(boxes.getObjectByName('body')).toBeDefined();
  expect(boxes.getObjectByName('roll-bar')).toBeDefined();
  expect(boxes.children.filter((child) => child.name === 'wheel')).toHaveLength(4);
});

test('8: the buggy\'s wheels roll as it drives along its nose', () => {
  const mesh = createBuggyMesh(config)!;
  const state = (z: number): VehicleState => ({ pos: { x: 0, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, linvel: { x: 0, y: 0, z: 0 }, throttle: 0, steer: 0, fuel: 1, health: 1 });
  placeVehicleMesh(mesh, state(0));
  placeVehicleMesh(mesh, state(-1));
  const wheel = mesh.getObjectByName('wheel-front-left')!;
  expect(wheel.rotation.x).toBeLessThan(-1);
  placeVehicleMesh(mesh, state(-1));
  expect(wheel.rotation.x).toBeLessThan(-1);
});
