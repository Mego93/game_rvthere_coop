import * as THREE from 'three';

// A seated typing pose: thighs forward, forearms out to the keys, head tipped to the screen. The figure's origin is its feet, so the caller lowers it onto the seat.
export const SEATED_POSE = {
  legs: -Math.PI / 2,
  arms: -1.15,
  head: 0.3,
  // How far the body drops from standing onto a couch seat, in metres.
  sink: 0.42,
} as const;

const SEAT_NODES = ['leg-left', 'leg-right', 'arm-left', 'arm-right', 'head'] as const;

// Sets the pose on a character mesh (the nodes of the character model); a figure without those nodes (the capsule fallback) is left as it is. Returns whether any node was posed.
export function applySeatedPose(mesh: THREE.Object3D): boolean {
  let posed = false;
  for (const name of SEAT_NODES) {
    const node = mesh.getObjectByName(name);
    if (!node) continue;
    const x = name.startsWith('leg') ? SEATED_POSE.legs : name.startsWith('arm') ? SEATED_POSE.arms : SEATED_POSE.head;
    node.rotation.set(x, 0, 0);
    posed = true;
  }
  return posed;
}
