import { WINCH_WARN_LENGTH, type Vec3 } from '@lodgy/shared';
import * as THREE from 'three';

const HOOK_SIZE = 0.16;
const ROPE_COLOR = 0x1f2937;
const ROPE_WARN_COLOR = 0xdc2626;

export function ropeColor(distance: number): number {
  return distance >= WINCH_WARN_LENGTH ? ROPE_WARN_COLOR : ROPE_COLOR;
}

// A small box for the hook and a line for the rope; the rope's first point is the mount, its second the hook.
export function createWinchMesh(): THREE.Group {
  const group = new THREE.Group();
  const hook = new THREE.Mesh(
    new THREE.BoxGeometry(HOOK_SIZE, HOOK_SIZE, HOOK_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, flatShading: true, roughness: 1, metalness: 0 }),
  );
  hook.name = 'hook';
  const rope = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: ROPE_COLOR }),
  );
  rope.name = 'rope';
  rope.frustumCulled = false;
  group.add(hook, rope);
  return group;
}

// The rope is drawn only when `visible`; a stowed hook sits at the mount with no rope.
export function placeWinchMesh(group: THREE.Group, mount: Vec3, hook: Vec3, visible: boolean): void {
  const hookMesh = group.getObjectByName('hook')!;
  const rope = group.getObjectByName('rope') as THREE.Line;
  hookMesh.position.set(hook.x, hook.y, hook.z);
  rope.visible = visible;
  (rope.material as THREE.LineBasicMaterial).color.setHex(ropeColor(Math.hypot(hook.x - mount.x, hook.y - mount.y, hook.z - mount.z)));
  const position = rope.geometry.getAttribute('position');
  position.setXYZ(0, mount.x, mount.y, mount.z);
  position.setXYZ(1, hook.x, hook.y, hook.z);
  position.needsUpdate = true;
}

export function disposeWinchMesh(group: THREE.Group): void {
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Line)) return;
    node.geometry.dispose();
    (node.material as THREE.Material).dispose();
  });
}
