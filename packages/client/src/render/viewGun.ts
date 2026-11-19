import * as THREE from 'three';
import { hasModel, instantiate, shadowed } from './models';

// A handgun in front of the first-person camera, lower right, muzzle forward; null when the model did not load. Add it as a child of the camera.
export function createViewGun(): THREE.Group | null {
  if (!hasModel('prop.gun')) return null;
  const model = shadowed(instantiate('prop.gun')!);
  model.traverse((object) => {
    object.castShadow = false;
    object.receiveShadow = false;
  });
  const group = new THREE.Group();
  group.name = 'view-gun';
  group.add(model);
  // The file's muzzle is +z; the camera looks down -z.
  model.rotation.y = Math.PI;
  group.position.set(0.15, -0.2, -0.55);
  group.scale.setScalar(0.75);
  group.visible = false;
  return group;
}
