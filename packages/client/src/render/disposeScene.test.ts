import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { disposeScene } from './disposeScene';

test('disposes geometries, materials and their maps, and empties the scene', () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const map = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map });
  const multi = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const spriteMaterial = new THREE.SpriteMaterial({ map: new THREE.Texture() });
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(new THREE.SphereGeometry(), multi), new THREE.Sprite(spriteMaterial));
  scene.add(group, new THREE.AmbientLight());
  const spies = [geometry, map, material, ...multi, spriteMaterial, spriteMaterial.map!].map((item) => vi.spyOn(item, 'dispose'));
  disposeScene(scene);
  for (const spy of spies) expect(spy).toHaveBeenCalled();
  expect(scene.children).toHaveLength(0);
});

test('skips shared geometry, materials and textures but disposes per-run ones', () => {
  const scene = new THREE.Scene();
  const sharedGeometry = new THREE.BoxGeometry();
  sharedGeometry.userData.shared = true;
  const sharedMap = new THREE.Texture();
  sharedMap.userData.shared = true;
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: sharedMap });
  sharedMaterial.userData.shared = true;
  const runGeometry = new THREE.BoxGeometry();
  const runMap = new THREE.Texture();
  const runMaterial = new THREE.MeshBasicMaterial({ map: runMap });
  // A per-run material may still point at a shared texture; that texture is kept.
  const mixedMaterial = new THREE.MeshBasicMaterial({ map: sharedMap });
  scene.add(new THREE.Mesh(sharedGeometry, sharedMaterial), new THREE.Mesh(runGeometry, runMaterial), new THREE.Mesh(sharedGeometry, mixedMaterial));
  const kept = [sharedGeometry, sharedMaterial, sharedMap].map((item) => vi.spyOn(item, 'dispose'));
  const freed = [runGeometry, runMaterial, runMap, mixedMaterial].map((item) => vi.spyOn(item, 'dispose'));
  disposeScene(scene);
  for (const spy of kept) expect(spy).not.toHaveBeenCalled();
  for (const spy of freed) expect(spy).toHaveBeenCalled();
  expect(scene.children).toHaveLength(0);
});
