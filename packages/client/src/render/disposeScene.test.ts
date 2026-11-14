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
