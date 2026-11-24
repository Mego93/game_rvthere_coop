import { getCourse, terrainHeightAt, type BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createGroundPatchMeshes } from './groundPatchMesh';
import { createScene } from './scene';

const arrival = getCourse('arrival');
const material = () => new THREE.MeshStandardMaterial();

test('a course with no terrain draws no patches', () => {
  expect(createGroundPatchMeshes(getCourse('segment-demo'), material)).toHaveLength(0);
});

test('one mesh per patch, with a vertex per height and two triangles per cell', () => {
  const meshes = createGroundPatchMeshes(arrival, material);
  expect(meshes).toHaveLength(arrival.terrain!.length);
  for (const [i, patch] of arrival.terrain!.entries()) {
    const geometry = meshes[i]!.geometry;
    expect(geometry.getAttribute('position').count).toBe(patch.heights.length);
    expect(geometry.getIndex()!.count).toBe(patch.cols * patch.rows * 6);
    for (let v = 0; v < patch.heights.length; v++) expect(geometry.getAttribute('position').getY(v)).toBeCloseTo(patch.heights[v]!, 5);
  }
});

test('what is drawn is what is stood on: a ray down meets the mesh at terrainHeightAt, to a millimetre', () => {
  const meshes = createGroundPatchMeshes(arrival, material);
  const group = new THREE.Group();
  group.add(...meshes);
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  let checked = 0;
  for (const patch of arrival.terrain!) {
    for (let i = 0; i < 60; i++) {
      // A spread of points that never lands on a cell edge or the patch edge.
      const x = patch.x0 + ((i * 0.6180339887) % 1) * patch.cols * patch.cell * 0.98 + 0.013;
      const z = patch.z0 + ((i * 0.7548776662) % 1) * patch.rows * patch.cell * 0.98 + 0.017;
      const height = terrainHeightAt(arrival, x, z);
      expect(height).not.toBeNull();
      ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(group.children);
      expect(hits.length, `${x} ${z}`).toBeGreaterThan(0);
      expect(hits[0]!.point.y).toBeCloseTo(height!, 3);
      checked++;
    }
  }
  expect(checked).toBe(60 * arrival.terrain!.length);
});

test('every normal points up, so the ground is lit from above and seen from above', () => {
  for (const mesh of createGroundPatchMeshes(arrival, material)) {
    const normals = mesh.geometry.getAttribute('normal');
    for (let v = 0; v < normals.count; v++) expect(normals.getY(v)).toBeGreaterThan(0.8);
  }
});

test('patches take the material of their surface and receive shadows', () => {
  const seen: string[] = [];
  const meshes = createGroundPatchMeshes(arrival, (surface) => {
    seen.push(surface);
    return material();
  });
  expect(seen).toEqual(arrival.terrain!.map((p) => p.surface));
  for (const mesh of meshes) expect(mesh.receiveShadow).toBe(true);
});

test('createScene draws the patches of a course with terrain, and the stairs and the ramp stay in the ground boxes it merges', () => {
  const scene = createScene(arrival, { flat: true });
  const patchMeshes = scene.children.filter((child) => (child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry.getAttribute('position').count === arrival.terrain![0]!.heights.length);
  expect(patchMeshes.length).toBeGreaterThan(0);
  const withoutTerrain: BuiltCourse = { ...arrival, terrain: undefined };
  const bare = createScene(withoutTerrain, { flat: true });
  expect(scene.children.length).toBe(bare.children.length + arrival.terrain!.length);
});
