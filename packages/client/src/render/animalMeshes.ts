import { ANIMAL_HALF_GOAT, ANIMAL_HALF_SCOOTER, type AnimalSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { createPropMesh, disposePropMesh } from './propMesh';

// Tipped about the long (z) axis: nearly on its side.
export const HIT_TILT = 1.4;
const GOAT_COLOUR = 0xcbbf9a;
const HORN_COLOUR = 0x5a4a32;

const box = (name: string, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// A blocky goat inside ANIMAL_HALF_GOAT, centred on its hit box, facing -z; the horns rise a little above the box.
export function createGoatMesh(): THREE.Group {
  const { x: hx, y: hy, z: hz } = ANIMAL_HALF_GOAT;
  const coat = new THREE.MeshStandardMaterial({ color: GOAT_COLOUR, flatShading: true, roughness: 1, metalness: 0 });
  const horn = new THREE.MeshStandardMaterial({ color: HORN_COLOUR, flatShading: true, roughness: 1, metalness: 0 });
  const group = new THREE.Group();
  const legH = hy * 0.8;
  group.add(box('body', hx * 2, hy * 0.9, hz * 1.4, coat, 0, -hy + legH + hy * 0.45, hz * 0.2));
  group.add(box('head', hx * 1.2, hy * 0.7, hz * 0.45, coat, 0, hy * 0.45, -hz * 0.75));
  const legW = hx * 0.35;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box('leg', legW, legH, legW, coat, sx * (hx - legW / 2), -hy + legH / 2, hz * 0.2 + sz * hz * 0.5));
  for (const sx of [-1, 1]) group.add(box('horn', hx * 0.15, hy * 0.35, hx * 0.15, horn, sx * hx * 0.4, hy * 0.45 + hy * 0.35 / 2 + hy * 0.35, -hz * 0.75));
  return group;
}

interface Entry {
  root: THREE.Group;
  inner: THREE.Object3D;
  kind: AnimalSnapshot['kind'];
  lie: number;
}

function build(kind: AnimalSnapshot['kind']): Entry {
  const inner = kind === 'goat' ? createGoatMesh() : createPropMesh('scooter');
  const root = new THREE.Group();
  root.add(inner);
  // The distance from the box centre down to where its side meets the ground when it lies over.
  const half = kind === 'goat' ? ANIMAL_HALF_GOAT : ANIMAL_HALF_SCOOTER;
  return { root, inner, kind, lie: half.y - half.x };
}

function dispose(scene: THREE.Scene, entry: Entry) {
  scene.remove(entry.root);
  if (entry.kind === 'goat') {
    entry.inner.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
    });
    const seen = new Set<THREE.Material>();
    entry.inner.traverse((node) => {
      if (node instanceof THREE.Mesh) seen.add(node.material as THREE.Material);
    });
    for (const material of seen) material.dispose();
  } else disposePropMesh(entry.inner);
}

export interface AnimalMeshes {
  // Creates meshes for ids that appear, places every one, and removes those no longer listed.
  update(animals: readonly AnimalSnapshot[]): void;
  dispose(): void;
}

export function createAnimalMeshes(scene: THREE.Scene): AnimalMeshes {
  const entries = new Map<number, Entry>();
  return {
    update(animals) {
      const present = new Set<number>();
      for (const animal of animals) {
        present.add(animal.id);
        let entry = entries.get(animal.id);
        if (entry && entry.kind !== animal.kind) {
          dispose(scene, entry);
          entries.delete(animal.id);
          entry = undefined;
        }
        if (!entry) {
          entry = build(animal.kind);
          entries.set(animal.id, entry);
          scene.add(entry.root);
        }
        entry.root.position.set(animal.x, animal.y, animal.z);
        entry.root.rotation.set(0, animal.yaw, 0);
        entry.inner.rotation.z = animal.hit ? HIT_TILT : 0;
        entry.inner.position.y = animal.hit ? -entry.lie : 0;
      }
      for (const [id, entry] of entries) {
        if (present.has(id)) continue;
        dispose(scene, entry);
        entries.delete(id);
      }
    },
    dispose() {
      for (const entry of entries.values()) dispose(scene, entry);
      entries.clear();
    },
  };
}
