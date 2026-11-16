import { COIN_RADIUS, type Placed } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TURN_RATE = 1.5;
// The tube and thickness literals below were drawn for a 0.5 m coin.
const COIN_DRAW_SCALE = COIN_RADIUS / 0.5;

export interface CoinMeshes {
  // Shows the coins in `left`, hides the rest, and turns them to `seconds`.
  update(left: ReadonlySet<string>, seconds: number): void;
  dispose(): void;
}

export function createCoinMeshes(scene: THREE.Scene, coins: readonly Placed[]): CoinMeshes {
  // A disc with a raised rim ring and a raised inner face, one geometry; the emissive keeps it gold where no sky reflects.
  const parts = [
    new THREE.CylinderGeometry(COIN_RADIUS * 0.94, COIN_RADIUS * 0.94, 0.08 * COIN_DRAW_SCALE, 24),
    new THREE.TorusGeometry(COIN_RADIUS * 0.94, 0.035 * COIN_DRAW_SCALE, 8, 24).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(COIN_RADIUS * 0.6, COIN_RADIUS * 0.6, 0.11 * COIN_DRAW_SCALE, 20),
  ];
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x3d2a00, roughness: 0.25, metalness: 0.9 });
  const meshes = coins.map((coin) => {
    const mesh = new THREE.Mesh(geometry, material);
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
      geometry.dispose();
      material.dispose();
    },
  };
}
