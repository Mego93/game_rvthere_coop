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
  const figures = (c: typeof small) => c.checkpoints.filter((cp) => cp.figure).length;
  expect(vertices(b) / figures(large)).toBeCloseTo(vertices(a) / figures(small));
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

test('rocks are drawn as their boulder on the ground, not as a wall box', () => {
  const marrakech = getCourse('marrakech');
  const rockWalls = marrakech.walls.filter((box) => box.rock);
  expect(rockWalls).toHaveLength(24);
  const drawn = visibleWalls(marrakech);
  expect(drawn.some((box) => box.rock)).toBe(false);
  expect(drawn.length).toBe(marrakech.corridor!.wallsFrom - rockWalls.length);
  const scene = createScene(marrakech, { flat: true });
  const boulders: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const g = mesh.geometry as THREE.BoxGeometry | undefined;
    if (mesh.isMesh && g?.parameters && g.parameters.width === 1.6 && g.parameters.height === 1.2 && g.parameters.depth === 1.4) boulders.push(mesh);
  });
  for (const wall of rockWalls) {
    const mesh = boulders.find((m) => Math.hypot(m.position.x - wall.center.x, m.position.z - wall.center.z) < 0.01);
    expect(mesh, 'a boulder at each rock').toBeDefined();
    // The rock's wall box centre is its half height above the ground, and the drawn boulder's centre too.
    expect(mesh!.position.y).toBeCloseTo(wall.center.y, 6);
  }
});

test('the walls beside obstacles on a corridor course are not drawn', () => {
  const marrakech = getCourse('marrakech');
  const drawn = visibleWalls(marrakech);
  const { runs, caps } = obstacleWalls(marrakech);
  const hidden = [...runs.flat(), ...caps];
  expect(hidden.length).toBeGreaterThan(20);
  expect(drawn.length).toBe(marrakech.walls.length - hidden.length - marrakech.walls.filter((box) => box.rock).length);
  const key = (box: { center: object; halfExtents: object; rot: object }) => JSON.stringify([box.center, box.halfExtents, box.rot]);
  const hiddenKeys = new Set(hidden.map(key));
  expect(drawn.some((box) => hiddenKeys.has(key(box)))).toBe(false);
  expect(marrakech.walls.slice(marrakech.corridor!.wallsFrom).every((box) => hiddenKeys.has(key(box)))).toBe(true);
  const airport = getCourse('airport');
  expect(visibleWalls(airport)).toEqual(airport.walls);
});
