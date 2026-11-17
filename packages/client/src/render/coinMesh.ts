import { COIN_RADIUS, type Placed } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hasModel, instantiate } from './models';

const TURN_RATE = 1.5;
// The tube and thickness literals below were drawn for a 0.5 m coin.
const COIN_DRAW_SCALE = COIN_RADIUS / 0.5;

// The file's disc lies flat (its axis is y); this stands it up with its faces toward z, COIN_RADIUS * 2 across, centred on the origin.
export function fitCoinModel(model: THREE.Object3D): THREE.Group {
  const upright = new THREE.Group();
  upright.add(model);
  upright.rotation.x = Math.PI / 2;
  upright.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(upright);
  const size = box.getSize(new THREE.Vector3());
  const scale = (COIN_RADIUS * 2) / Math.max(size.x, size.y, size.z);
  const centre = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.add(upright);
  wrapper.scale.setScalar(scale);
  upright.position.copy(centre.multiplyScalar(-1));
  return wrapper;
}

export interface CoinMeshes {
  // Shows the coins in `left`, hides the rest, and turns them to `seconds`.
  update(left: ReadonlySet<string>, seconds: number): void;
  dispose(): void;
}

const COIN_EMISSIVE = 0x3d2a00;

// Each coin material of the model, copied once with the same dim gold emissive as the procedural coin so it stays visible at night and under overcast.
function tinted(model: THREE.Object3D, copies: Map<THREE.Material, THREE.Material>): void {
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material as THREE.MeshStandardMaterial;
    let copy = copies.get(original);
    if (!copy) {
      copy = original.clone();
      (copy as THREE.MeshStandardMaterial).emissive?.setHex(COIN_EMISSIVE);
      copy.userData.shared = false;
      copies.set(original, copy);
    }
    mesh.material = copy;
  });
}

export function createCoinMeshes(scene: THREE.Scene, coins: readonly Placed[]): CoinMeshes {
  const copies = new Map<THREE.Material, THREE.Material>();
  const models = coins.map(() => (hasModel('coin') ? instantiate('coin') : null));
  // Decided once: with no model for the first coin, every coin is the procedural disc.
  const modelled = models.length > 0 && models.every((model) => model !== null);
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  if (!modelled) {
    // A disc with a raised rim ring and a raised inner face, one geometry; the emissive keeps it gold where no sky reflects.
    const parts = [
      new THREE.CylinderGeometry(COIN_RADIUS * 0.94, COIN_RADIUS * 0.94, 0.08 * COIN_DRAW_SCALE, 24),
      new THREE.TorusGeometry(COIN_RADIUS * 0.94, 0.035 * COIN_DRAW_SCALE, 8, 24).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(COIN_RADIUS * 0.6, COIN_RADIUS * 0.6, 0.11 * COIN_DRAW_SCALE, 20),
    ];
    geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    geometry.rotateX(Math.PI / 2);
    material = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: COIN_EMISSIVE, roughness: 0.25, metalness: 0.9 });
  }
  const meshes = coins.map((coin, index) => {
    const model = modelled ? models[index]! : null;
    let mesh: THREE.Object3D;
    if (model) {
      const fit = fitCoinModel(model);
      tinted(fit, copies);
      mesh = new THREE.Group().add(fit);
    } else mesh = new THREE.Mesh(geometry!, material!);
    mesh.position.set(coin.pose.pos.x, coin.pose.pos.y, coin.pose.pos.z);
    scene.add(mesh);
    return { id: coin.id, mesh };
  });
  return {
    update(left, seconds) {
      for (const { id, mesh } of meshes) {
        mesh.visible = left.has(id);
        mesh.rotation.y = seconds * TURN_RATE;
      }
    },
    dispose() {
      for (const { mesh } of meshes) scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      for (const copy of copies.values()) copy.dispose();
    },
  };
}
