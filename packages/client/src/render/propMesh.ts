import { PROP_KINDS, type PropKind, type PropSnapshot } from '@lodgy/shared';
import * as THREE from 'three';

const COLOURS: Record<PropKind, number> = { crate: 0xb5833f, barrier: 0xc0392b };
const UNKNOWN_HALF = 0.25;

const material = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

// A prop drawn as a box of its kind's size; a kind this client does not know is a grey 0.5 m cube.
export function createPropMesh(kind: string): THREE.Mesh {
  if (!Object.hasOwn(PROP_KINDS, kind)) {
    return new THREE.Mesh(new THREE.BoxGeometry(UNKNOWN_HALF * 2, UNKNOWN_HALF * 2, UNKNOWN_HALF * 2), material(0x888888));
  }
  const h = PROP_KINDS[kind as PropKind].halfExtents;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), material(COLOURS[kind as PropKind]));
  if (kind === 'barrier') {
    // A white band across the middle, slightly proud of the body.
    const band = new THREE.Mesh(new THREE.BoxGeometry(h.x * 0.4, h.y * 2.02, h.z * 2.02), material(0xf2f2f2));
    mesh.add(band);
  }
  return mesh;
}

export function placePropMesh(mesh: THREE.Mesh, pose: Pick<PropSnapshot, 'pos' | 'rot'>): void {
  mesh.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  mesh.quaternion.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w);
}

export function disposePropMesh(mesh: THREE.Mesh): void {
  mesh.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    (node.material as THREE.Material).dispose();
  });
}
