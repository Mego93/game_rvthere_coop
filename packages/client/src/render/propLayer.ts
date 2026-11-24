import * as THREE from 'three';
import type { PropPlacement } from './dressMap';
import { instantiate } from './models';

export const PROP_CHUNK = 96;
const SHADOW_MIN_HEIGHT = 1.2;

export interface PropLayerOptions {
  // Metres from the camera past which a chunk of props is not drawn.
  drawDistance: number;
  shadows: boolean;
  // Where a model comes from; the game's loaded models unless a test gives its own.
  model?: (key: string) => THREE.Object3D | null;
}

export interface PropLayer {
  group: THREE.Group;
  // Cheap to call every frame: shows the chunks within the draw distance of the camera and hides the rest.
  update(camera: { x: number; z: number }): void;
  dispose(): void;
  stats: { instances: number; meshes: number };
}

interface Chunk {
  mesh: THREE.InstancedMesh;
  x: number;
  z: number;
  radius: number;
}

// One InstancedMesh set per model: each mesh of a model gets one instanced mesh per chunk of the map it appears in, so the frustum and the draw distance can leave chunks out.
export function createPropLayer(scene: THREE.Object3D, placements: readonly PropPlacement[], manifest: Readonly<Record<string, unknown>>, options: PropLayerOptions): PropLayer {
  const source = options.model ?? instantiate;
  const group = new THREE.Group();
  group.name = 'props';
  const chunks: Chunk[] = [];
  const byKey = new Map<string, PropPlacement[]>();
  for (const p of placements) {
    if (!(p.key in manifest)) continue;
    const list = byKey.get(p.key);
    if (list) list.push(p);
    else byKey.set(p.key, [p]);
  }
  let instances = 0;
  const place = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  for (const [key, list] of byKey) {
    const root = source(key);
    if (!root) continue;
    root.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(root).max.y;
    const parts: { mesh: THREE.Mesh; local: THREE.Matrix4 }[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) parts.push({ mesh, local: mesh.matrixWorld.clone() });
    });
    const cells = new Map<string, PropPlacement[]>();
    for (const p of list) {
      const cell = `${Math.floor(p.x / PROP_CHUNK)},${Math.floor(p.z / PROP_CHUNK)}`;
      const found = cells.get(cell);
      if (found) found.push(p);
      else cells.set(cell, [p]);
    }
    for (const members of cells.values()) {
      for (const { mesh, local } of parts) {
        const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, members.length);
        members.forEach((p, i) => {
          turn.setFromAxisAngle(up, p.yaw);
          place.compose(new THREE.Vector3(p.x, p.y, p.z), turn, new THREE.Vector3(p.scale, p.scale, p.scale));
          instanced.setMatrixAt(i, matrix.multiplyMatrices(place, local));
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.castShadow = options.shadows && height > SHADOW_MIN_HEIGHT;
        instanced.receiveShadow = true;
        instanced.computeBoundingSphere();
        const sphere = instanced.boundingSphere!;
        chunks.push({ mesh: instanced, x: sphere.center.x, z: sphere.center.z, radius: sphere.radius });
        group.add(instanced);
      }
      instances += members.length;
    }
  }
  scene.add(group);
  return {
    group,
    stats: { instances, meshes: chunks.length },
    update(camera) {
      for (const c of chunks) c.mesh.visible = Math.hypot(c.x - camera.x, c.z - camera.z) - c.radius <= options.drawDistance;
    },
    dispose() {
      for (const c of chunks) c.mesh.dispose();
      group.removeFromParent();
    },
  };
}
