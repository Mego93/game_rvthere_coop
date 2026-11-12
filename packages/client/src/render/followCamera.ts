import { AXIS_Y, add, quatFromAxisAngle, rotate, vec3, yawOf, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';

const OFFSET = vec3(0, 4.5, 11);
const LOOK_HEIGHT = 1.2;
// Fraction of the remaining distance the camera closes each second.
const FOLLOW_RATE = 6;

// Keeps the camera behind and above the vehicle, following its yaw only so rolls do not spin the view.
export function updateFollowCamera(camera: THREE.PerspectiveCamera, state: VehicleState, frameSeconds: number): void {
  const behind = rotate(quatFromAxisAngle(AXIS_Y, yawOf(state.rot)), OFFSET);
  const goal = add(state.pos, behind);
  const blend = 1 - Math.exp(-FOLLOW_RATE * frameSeconds);
  camera.position.lerp(new THREE.Vector3(goal.x, goal.y, goal.z), blend);
  camera.lookAt(state.pos.x, state.pos.y + LOOK_HEIGHT, state.pos.z);
}
