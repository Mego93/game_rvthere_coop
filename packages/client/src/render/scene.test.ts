import { getCourse, obstacleWalls } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test, vi } from 'vitest';
import { disposeScene } from './disposeScene';
import { createScene, visibleWalls } from './scene';

const course = getCourse('segment-demo');
const OLD_CHECKPOINT_BLUE = 0x3b82f6;

test('T4: no blue checkpoint box, one Souleyman per checkpoint', () => {
  const scene = createScene(course, { flat: true });
  const blue: THREE.Object3D[] = [];
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    // Service stops use the same blue; they only exist on courses with stops.
    if (material?.transparent && material.color?.getHex() === OLD_CHECKPOINT_BLUE) blue.push(object);
  });
  expect(blue).toHaveLength(course.stops.filter((stop) => stop.kind !== 'fuel').length);
});

const souleymanMeshes = (scene: THREE.Scene) => {
  const found: THREE.Mesh[] = [];
  scene.traverse((object) => { if (object.name === 'souleyman' && (object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh); });
  return found;
};

test('T4: the Souleyman mesh count is a few and does not grow with the checkpoint count', () => {
  const small = getCourse('segment-demo');
  const large = getCourse('airport');
  expect(large.checkpoints.length).not.toBe(small.checkpoints.length);
  const a = souleymanMeshes(createScene(small, { flat: true }));
  const b = souleymanMeshes(createScene(large, { flat: true }));
  expect(a.length).toBeGreaterThan(0);
  expect(a.length).toBeLessThanOrEqual(6);
  expect(b.length).toBe(a.length);
  const vertices = (meshes: THREE.Mesh[]) => meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
  expect(vertices(b) / large.checkpoints.length).toBeCloseTo(vertices(a) / small.checkpoints.length);
});

test('T4: disposeScene frees his geometry and materials', () => {
  const scene = createScene(course, { flat: true });
  const meshes = souleymanMeshes(scene);
  expect(meshes.length).toBeGreaterThan(0);
  const spies = meshes.flatMap((mesh) => [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as THREE.Material, 'dispose')]);
  disposeScene(scene);
  for (const spy of spies) expect(spy).toHaveBeenCalled();
  expect(scene.children).toHaveLength(0);
});

test('the walls beside obstacles on a corridor course are not drawn', () => {
  const marrakech = getCourse('marrakech');
  const drawn = visibleWalls(marrakech);
  const { runs, caps } = obstacleWalls(marrakech);
  expect(drawn.length).toBe(marrakech.walls.length - runs.flat().length - caps.length);
  expect(runs.flat().length + caps.length).toBeGreaterThan(20);
  expect(drawn.every((box, i) => box === marrakech.walls[i])).toBe(true);
  const airport = getCourse('airport');
  expect(visibleWalls(airport)).toBe(airport.walls);
});
