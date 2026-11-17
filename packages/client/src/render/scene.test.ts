import { getCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test, vi } from 'vitest';
import { disposeScene } from './disposeScene';
import { createScene } from './scene';

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
  expect(scene.children.filter((child) => child.name === 'souleyman')).toHaveLength(course.checkpoints.length);
});

test('T4: disposeScene frees his geometry and materials', () => {
  const scene = createScene(course, { flat: true });
  const figures = scene.children.filter((child) => child.name === 'souleyman');
  const meshes: THREE.Mesh[] = [];
  figures[0]!.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
  const spies = meshes.flatMap((mesh) => [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as THREE.Material, 'dispose')]);
  disposeScene(scene);
  for (const spy of spies) expect(spy).toHaveBeenCalled();
  expect(scene.children).toHaveLength(0);
});
