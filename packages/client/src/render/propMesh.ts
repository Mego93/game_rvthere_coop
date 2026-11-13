import { PROP_KINDS, type PropKind, type PropSnapshot } from '@lodgy/shared';
import * as THREE from 'three';

const COLOURS: Record<PropKind, number> = { crate: 0xb5833f, barrier: 0xd9d9d9 };

// A prop drawn as a box of its kind's size; null for a kind this client does not know.
export function createPropMesh(kind: string): THREE.Mesh | null {
  if (!Object.hasOwn(PROP_KINDS, kind)) return null;
  const h = PROP_KINDS[kind as PropKind].halfExtents;
  return new THREE.Mesh(
    new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2),
    new THREE.MeshLambertMaterial({ color: COLOURS[kind as PropKind], flatShading: true }),
  );
}

export function placePropMesh(mesh: THREE.Mesh, pose: Pick<PropSnapshot, 'pos' | 'rot'>): void {
  mesh.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  mesh.quaternion.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w);
}

export function disposePropMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}
