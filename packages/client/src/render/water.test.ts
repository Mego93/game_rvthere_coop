import { BRIDGE_ABUTMENT, getCourse, routeFrame, WATER_DEPTH_BELOW_ROAD } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createScene } from './scene';
import { createWaterMeshes, waterPlanes } from './water';

const valley = getCourse('valley');

test('V4: one plane per ravine span, WATER_DEPTH_BELOW_ROAD under the deck and between the abutments', () => {
  const planes = waterPlanes(valley);
  expect(valley.ravines).toHaveLength(3);
  expect(planes).toHaveLength(valley.ravines.length);
  const frame = routeFrame(valley);
  planes.forEach((plane, i) => {
    const span = valley.ravines[i]!;
    expect(plane.length).toBeCloseTo(span.to - span.from - 2 * BRIDGE_ABUTMENT, 6);
    expect(plane.y).toBeCloseTo(frame.heightAtAlong(span.from + BRIDGE_ABUTMENT + 1) - WATER_DEPTH_BELOW_ROAD, 6);
    const hit = frame.nearest(plane.x, plane.z);
    expect(hit.along).toBeGreaterThan(span.from + BRIDGE_ABUTMENT);
    expect(hit.along).toBeLessThan(span.to - BRIDGE_ABUTMENT);
    expect(Math.hypot(plane.x - hit.px, plane.z - hit.pz)).toBeLessThan(0.5);
  });
});

test('V4: the long side of the plane runs along the road', () => {
  const [plane] = waterPlanes(valley);
  const mesh = createWaterMeshes(valley).children[0]!;
  mesh.updateMatrixWorld(true);
  const along = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
  expect(Math.abs(along.y)).toBeLessThan(1e-9);
  const frame = routeFrame(valley);
  const span = valley.ravines[0]!;
  const a = frame.pointAt(span.from + BRIDGE_ABUTMENT);
  const b = frame.pointAt(span.to - BRIDGE_ABUTMENT);
  const direction = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  expect(Math.abs(along.dot(direction))).toBeCloseTo(1, 6);
  expect(plane!.width).toBeGreaterThan(plane!.length);
});

test('V4: a course with no ravine has no water', () => {
  expect(waterPlanes(getCourse('desert'))).toEqual([]);
  expect(createWaterMeshes(getCourse('desert')).children).toHaveLength(0);
});

test('V4: a phone draws the water with no normal map and no sky reflection; a desktop has both', () => {
  const material = (options: { lite?: boolean }) => (createWaterMeshes(valley, options).children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const lite = material({ lite: true });
  expect(lite.normalMap).toBeNull();
  expect(lite.envMapIntensity).toBe(0);
  const desktop = material({});
  expect(desktop.normalMap).not.toBeNull();
  expect(desktop.envMapIntensity).toBeGreaterThan(0);
  expect(desktop.transparent).toBe(true);
  expect(desktop.opacity).toBeLessThan(1);
});

test('V4: the valley scene holds the water planes and the desert scene none', () => {
  const planes = (scene: THREE.Scene) => {
    let n = 0;
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) n++; });
    return n;
  };
  expect(planes(createScene(valley, { lite: true }))).toBe(3);
});
