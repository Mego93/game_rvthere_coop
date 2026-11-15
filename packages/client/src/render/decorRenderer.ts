import * as THREE from 'three';
import { buildCells, DESKTOP_DECOR, SOFTWARE_DECOR, TOUCH_DECOR, visibleCells, type DecorCell, type DecorLimits } from './decorChunks';
import type { DecorPlacement } from './decorScatter';
import { hasModel, instantiate } from './models';

export const DECOR_UPDATE_SECONDS = 0.5;
const SHADOW_MIN_HEIGHT = 3;

export interface DecorOptions {
  touch: boolean;
  softwareGl: boolean;
}

export interface DecorRenderer {
  readonly group: THREE.Group;
  // Cheap to call every frame: it acts at most once per DECOR_UPDATE_SECONDS, and only when the visible cells changed.
  update(camera: { x: number; z: number }, nowSeconds: number): void;
  dispose(): void;
}

// One drawn primitive of a model, shared by every model key that uses the same geometry and material.
interface Primitive {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  mesh: THREE.InstancedMesh | null;
  capacity: number;
}

interface ModelParts {
  height: number;
  parts: { primitive: number; local: THREE.Matrix4 }[];
}

const materialId = (material: THREE.Material | THREE.Material[]) => (Array.isArray(material) ? material.map((m) => m.uuid).join(',') : material.uuid);

export function createDecorRenderer(placements: readonly DecorPlacement[], route: readonly (readonly [number, number])[], { touch, softwareGl }: DecorOptions): DecorRenderer {
  const limits: DecorLimits = softwareGl ? SOFTWARE_DECOR : touch ? TOUCH_DECOR : DESKTOP_DECOR;
  const shadows = !touch && !softwareGl;
  const group = new THREE.Group();
  const primitives: Primitive[] = [];
  const byGeometry = new Map<string, number>();
  const models = new Map<string, ModelParts>();

  const partsOf = (key: string): ModelParts | null => {
    const known = models.get(key);
    if (known) return known;
    const root = instantiate(key);
    if (!root) return null;
    root.updateMatrixWorld(true);
    const parts: ModelParts['parts'] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = `${mesh.geometry.uuid}|${materialId(mesh.material)}`;
      let index = byGeometry.get(id);
      if (index === undefined) {
        index = primitives.length;
        byGeometry.set(id, index);
        primitives.push({ geometry: mesh.geometry, material: mesh.material, castShadow: false, mesh: null, capacity: 0 });
      }
      parts.push({ primitive: index, local: mesh.matrixWorld.clone() });
    });
    const height = new THREE.Box3().setFromObject(root).max.y;
    for (const part of parts) if (height > SHADOW_MIN_HEIGHT && shadows) primitives[part.primitive]!.castShadow = true;
    const entry = { height, parts };
    models.set(key, entry);
    return entry;
  };

  // Placements whose model failed to load are left out.
  const usable = placements.filter((p) => hasModel(p.model) && partsOf(p.model));
  const cells = buildCells(usable, route);

  // Each cell's instance matrices per primitive, composed once here.
  const matrices = new Map<number, Float32Array[]>();
  const compose = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const euler = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  for (const cell of cells) {
    const lists: number[][] = primitives.map(() => []);
    for (const p of cell.placements) {
      euler.setFromAxisAngle(up, p.yaw);
      place.compose(at.set(p.x, p.y, p.z), euler, size.set(p.scale, p.scale, p.scale));
      for (const part of models.get(p.model)!.parts) {
        compose.multiplyMatrices(place, part.local);
        const list = lists[part.primitive]!;
        for (const value of compose.elements) list.push(value);
        primitives[part.primitive]!.capacity++;
      }
    }
    matrices.set(cell.id, lists.map((list) => Float32Array.from(list)));
  }

  for (const primitive of primitives) {
    if (primitive.capacity === 0) continue;
    const mesh = new THREE.InstancedMesh(primitive.geometry, primitive.material, primitive.capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    // The matrices change with the visible set, so a bounding sphere taken once would be wrong.
    mesh.frustumCulled = false;
    mesh.castShadow = primitive.castShadow;
    primitive.mesh = mesh;
    group.add(mesh);
  }

  let lastUpdate = -Infinity;
  let shown: DecorCell[] = [];
  let shownAny = false;

  const rebuild = (visible: DecorCell[]) => {
    for (let i = 0; i < primitives.length; i++) {
      const mesh = primitives[i]!.mesh;
      if (!mesh) continue;
      const target = mesh.instanceMatrix.array as Float32Array;
      let offset = 0;
      for (const cell of visible) {
        const block = matrices.get(cell.id)![i]!;
        target.set(block, offset);
        offset += block.length;
      }
      mesh.count = offset / 16;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return {
    group,
    update(camera, nowSeconds) {
      if (nowSeconds - lastUpdate < DECOR_UPDATE_SECONDS) return;
      lastUpdate = nowSeconds;
      const visible = visibleCells(cells, camera, limits.radius, limits.cap);
      if (shownAny && visible.length === shown.length && visible.every((cell, i) => cell === shown[i])) return;
      shown = visible;
      shownAny = true;
      rebuild(visible);
    },
    dispose() {
      // Geometry and materials belong to the loaded models; only the instance buffers are ours.
      for (const primitive of primitives) primitive.mesh?.dispose();
      group.clear();
    },
  };
}
