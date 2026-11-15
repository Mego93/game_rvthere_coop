import { ITEM_KINDS, PROP_KINDS, type ItemKind, type PropKind, type PropSnapshot } from '@lodgy/shared';
import * as THREE from 'three';

const COLOURS: Record<PropKind, number> = { crate: 0xb5833f, barrier: 0xc0392b, cart: 0x8b5a2b, scooter: 0x8e1b1b };
const ITEM_COLOURS: Record<ItemKind, number> = { jerrycan: 0xd32f2f, toolbox: 0x1e6fd9, healthKit: 0xf5f5f5 };
const UNKNOWN_HALF = 0.25;

const material = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0 });

// A prop or item drawn as a box of its kind's size; a kind this client does not know is a grey 0.5 m cube.
function buildPropMesh(kind: string): THREE.Mesh {
  if (Object.hasOwn(ITEM_KINDS, kind)) {
    const h = ITEM_KINDS[kind as ItemKind].halfExtents;
    const box = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), material(ITEM_COLOURS[kind as ItemKind]));
    if (kind === 'healthKit') {
      // A red cross on top, its bars standing on the lid.
      for (const [w, d] of [[h.x * 1.2, h.z * 0.4], [h.x * 0.4, h.z * 1.2]] as const) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h.y * 0.1, d), material(0xd32f2f));
        bar.position.y = h.y * 1.05;
        box.add(bar);
      }
    }
    return box;
  }
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

export function createPropMesh(kind: string): THREE.Mesh {
  const mesh = buildPropMesh(kind);
  mesh.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
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
