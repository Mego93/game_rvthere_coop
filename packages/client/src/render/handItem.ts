import * as THREE from 'three';

// Where the hand is in an arm node's own frame (the arm hangs along -y, the right arm's hand a little outside the node).
const HAND_RIGHT = new THREE.Vector3(-0.2, -0.85, 0.02);

// The point of the model the hand holds, as fractions of its box (x is always the middle): the pistol's grip, the knife's handle and a hand's width up the driver's shaft.
export const GRIPS = { gun: { y: 0.25, z: 0.18 }, knife: { y: 0.47, z: 0.11 }, driver: { y: 0.5, z: 0.11 } } as const;
export type GripKind = keyof typeof GRIPS;

// Puts a model in a character's right hand. The model's +z end (muzzle, blade) points down the arm, so it points forward when the arm is raised forward, and its +y is up.
export function holdInRightHand(arm: THREE.Object3D, model: THREE.Object3D, grip: GripKind): THREE.Group {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const at = GRIPS[grip];
  const point = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + size.y * at.y, box.min.z + size.z * at.z);
  const wrapper = new THREE.Group();
  wrapper.name = `held-${grip}`;
  arm.updateWorldMatrix(true, false);
  // The arm node's units are not metres (the character's model is scaled).
  wrapper.scale.setScalar(1 / new THREE.Vector3().setFromMatrixScale(arm.matrixWorld).x);
  wrapper.rotation.x = Math.PI / 2;
  wrapper.position.copy(HAND_RIGHT);
  model.position.sub(point);
  wrapper.add(model);
  arm.add(wrapper);
  return wrapper;
}

// Raised forward and a little up, the pose of an arm aiming.
export const AIM_ARM = new THREE.Euler(-1.5, 0, 0);
