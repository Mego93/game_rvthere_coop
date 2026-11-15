import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { VEHICLES } from '@lodgy/shared';
import { createVehicleMesh } from './vehicleMesh';
import { disposeScene } from './disposeScene';

const meshes = (group: THREE.Group) => group.children as THREE.Mesh[];
const colourOf = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHex();
const sizeOf = (mesh: THREE.Mesh) => {
  const p = (mesh.geometry as THREE.BoxGeometry).parameters;
  return [p.width, p.height, p.depth];
};

test('T1: the RV is the named boxes of M1, inside the M2 envelope', () => {
  const rv = VEHICLES.rv;
  const group = createVehicleMesh(rv);
  group.updateMatrixWorld();
  const counts: Record<string, number> = {};
  for (const child of group.children) counts[child.name] = (counts[child.name] ?? 0) + 1;
  expect(counts).toEqual({ body: 1, cab: 1, windscreen: 1, window: 4, rear: 1, vent: 1, bumper: 1, stripe: 2, arch: 4, wheel: 4 });

  for (const mesh of meshes(group)) {
    if (mesh.name === 'wheel') continue;
    const box = new THREE.Box3().setFromObject(mesh);
    const top = mesh.name === 'vent' ? 1.5 : 1.35;
    expect(box.min.x).toBeGreaterThanOrEqual(-1.3 - 1e-6);
    expect(box.max.x).toBeLessThanOrEqual(1.3 + 1e-6);
    expect(box.min.y).toBeGreaterThanOrEqual(-1.35 - 1e-6);
    expect(box.max.y).toBeLessThanOrEqual(top + 1e-6);
    expect(box.min.z).toBeGreaterThanOrEqual(-3.55 - 1e-6);
    expect(box.max.z).toBeLessThanOrEqual(3.55 + 1e-6);
  }

  const windscreen = meshes(group).find((m) => m.name === 'windscreen')!;
  expect(windscreen.position.z).toBeCloseTo(-3.43);
  expect(colourOf(windscreen)).toBe(0x1f2937);

  const wheels = meshes(group).filter((m) => m.name === 'wheel');
  const wheelY = rv.wheelY - rv.suspensionRest;
  const expected = [-rv.wheelX, rv.wheelX].flatMap((x) => [-rv.wheelZ, rv.wheelZ].map((z) => [x, wheelY, z]));
  expect(wheels.map((w) => w.position.toArray())).toEqual(expected);
  for (const w of wheels) expect(sizeOf(w)).toEqual([0.25, rv.wheelRadius * 2, rv.wheelRadius * 2]);
});

test('T2: the Lodgy keeps its look, with names', () => {
  const group = createVehicleMesh(VEHICLES.lodgy);
  const parts = meshes(group) as [THREE.Mesh, THREE.Mesh, ...THREE.Mesh[]];
  expect(parts.map((p) => p.name)).toEqual(['body', 'windscreen', 'wheel', 'wheel', 'wheel', 'wheel']);
  expect(sizeOf(parts[0]).map((n) => +n.toFixed(4))).toEqual([1.76, 1.1, 4.5]);
  expect(parts[0].position.toArray()).toEqual([0, 0, 0]);
  expect(sizeOf(parts[1]).map((n) => +n.toFixed(4))).toEqual([1.584, 0.33, 0.1]);
  expect(parts[1].position.x).toBe(0);
  expect(parts[1].position.y).toBeCloseTo(0.275);
  expect(parts[1].position.z).toBeCloseTo(-2.28);
  const wheelPositions = [[-0.78, -0.7, -1.4], [-0.78, -0.7, 1.4], [0.78, -0.7, -1.4], [0.78, -0.7, 1.4]];
  parts.slice(2).forEach((w, i) => {
    expect(sizeOf(w).map((n) => +n.toFixed(4))).toEqual([0.25, 0.66, 0.66]);
    w.position.toArray().forEach((v, k) => expect(v).toBeCloseTo(wheelPositions[i]![k]!));
  });
});

test('T3: disposeScene disposes every RV geometry and material', () => {
  const scene = new THREE.Scene();
  const group = createVehicleMesh(VEHICLES.rv);
  scene.add(group);
  const spies = meshes(group).flatMap((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')]);
  disposeScene(scene);
  expect(spies).toHaveLength(2 * group.children.length);
  for (const spy of spies) expect(spy).toHaveBeenCalled();
});
