import { COIN_RADIUS, type Placed } from '@lodgy/shared';
import * as THREE from 'three';

const TURN_RATE = 1.5;

export interface CoinMeshes {
  // Shows the coins in `left`, hides the rest, and turns them to `seconds`.
  update(left: ReadonlySet<string>, seconds: number): void;
  dispose(): void;
}

export function createCoinMeshes(scene: THREE.Scene, coins: readonly Placed[]): CoinMeshes {
  const geometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.08, 24);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xffc83d, flatShading: true, roughness: 1, metalness: 0 });
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
