import { CHARACTER_SCALE, ROAD_WIDTH, yawOf, type Checkpoint } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SOULEYMAN_LATERAL = ROAD_WIDTH / 2 + 1.5;

const ROBE = 0xd8c8a8;
const HOOD = 0x8a6a45;
const TURBAN = 0x2f5f8f;
const SKIN = 0x9a6b4a;
const BEARD = 0x2a2420;

const flat = (colour: number) => new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 1, metalness: 0 });

function part(name: string, w: number, h: number, d: number, material: THREE.Material, x: number, bottom: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, bottom + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A blocky man in a hooded djellaba and a turban, feet at the origin, facing -z, 1.8 m before CHARACTER_SCALE.
export function createSouleymanMesh(): THREE.Group {
  const robe = flat(ROBE);
  const hood = flat(HOOD);
  const turban = flat(TURBAN);
  const skin = flat(SKIN);
  const beard = flat(BEARD);
  const group = new THREE.Group();
  group.name = 'souleyman';
  group.add(part('robe', 0.56, 1.2, 0.36, robe, 0, 0, 0));
  for (const side of [-1, 1]) group.add(part('arm', 0.12, 0.7, 0.16, robe, side * 0.34, 0.45, 0));
  group.add(part('hood', 0.44, 0.4, 0.44, hood, 0, 1.2, 0.03));
  group.add(part('face', 0.26, 0.24, 0.1, skin, 0, 1.3, -0.2));
  group.add(part('beard', 0.22, 0.16, 0.08, beard, 0, 1.2, -0.23));
  group.add(part('turban', 0.5, 0.2, 0.5, turban, 0, 1.6, 0.02));
  group.scale.setScalar(CHARACTER_SCALE);
  return group;
}

// Right of each checkpoint's spawn heading, facing back across the road. Reads only the spawn pose.
export function souleymanPlacements(checkpoints: readonly Checkpoint[]): { x: number; z: number; y: number; yaw: number }[] {
  // Checkpoint spawns sit on the road centre line.
  return checkpoints.map(({ spawn }) => {
    const yaw = yawOf(spawn.rot);
    return {
      x: spawn.pos.x + Math.cos(yaw) * SOULEYMAN_LATERAL,
      z: spawn.pos.z - Math.sin(yaw) * SOULEYMAN_LATERAL,
      y: spawn.pos.y,
      yaw: yaw + Math.PI / 2,
    };
  });
}

// All placements baked into one mesh per material (named 'souleyman'), so the draw calls do not grow with the checkpoint count.
export function createSouleymanMeshes(placements: readonly { x: number; z: number; y: number; yaw: number }[]): THREE.Mesh[] {
  if (placements.length === 0) return [];
  const proto = createSouleymanMesh();
  proto.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  proto.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    byMaterial.set(mesh.material as THREE.Material, [...(byMaterial.get(mesh.material as THREE.Material) ?? []), mesh]);
  });
  const place = new THREE.Matrix4();
  const meshes: THREE.Mesh[] = [];
  for (const [material, pieces] of byMaterial) {
    const geometries: THREE.BufferGeometry[] = [];
    for (const spot of placements) {
      place.compose(new THREE.Vector3(spot.x, spot.y, spot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw), new THREE.Vector3(1, 1, 1));
      for (const piece of pieces) geometries.push(piece.geometry.clone().applyMatrix4(place.clone().multiply(piece.matrixWorld)));
    }
    const merged = mergeGeometries(geometries)!;
    for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'souleyman';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  for (const pieces of byMaterial.values()) for (const piece of pieces) piece.geometry.dispose();
  return meshes;
}
