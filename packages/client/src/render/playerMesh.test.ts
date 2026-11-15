import { type PlayerSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeAll, expect, test, vi } from 'vitest';
import { createPlayerMesh, disposePlayerMesh, placePlayerMesh, setNameVisible } from './playerMesh';

const shared = { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial() };
shared.geometry.userData.shared = true;
shared.material.userData.shared = true;

vi.mock('./models', () => ({
  hasModel: () => true,
  animationsOf: () => [
    new THREE.AnimationClip('idle', 1, [new THREE.NumberKeyframeTrack('leg-left.position[y]', [0, 1], [0, 0])]),
    new THREE.AnimationClip('walk', 1, [new THREE.NumberKeyframeTrack('leg-left.rotation[x]', [0, 0.5, 1], [-1, 1, -1])]),
  ],
  instantiate: () => {
    const root = new THREE.Group();
    for (const name of ['torso', 'arm-left', 'arm-right', 'leg-left']) {
      const mesh = new THREE.Mesh(shared.geometry, shared.material);
      mesh.name = name;
      root.add(mesh);
    }
    return root;
  },
  shadowed: (root: THREE.Object3D) => root,
}));

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) });
});

const at = (x: number, z: number) => ({ pos: { x, y: 0, z }, yaw: 0, downed: null }) as unknown as PlayerSnapshot;
const leg = (mesh: THREE.Group) => mesh.getObjectByName('leg-left')!;

test('M4: the shirt and sleeves take the player colour; the rest keeps the shared material', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect((mesh.getObjectByName('torso') as THREE.Mesh).material).not.toBe(shared.material);
  expect(((mesh.getObjectByName('arm-left') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('e0a030');
  expect((leg(mesh) as THREE.Mesh).material).toBe(shared.material);
});

test('M4: a player standing stays idle and one that moves plays the walk', () => {
  const still = createPlayerMesh('A', '#e0a030');
  const mover = createPlayerMesh('B', '#e0a030');
  for (let i = 0; i < 20; i++) {
    placePlayerMesh(still, at(0, 0), 0.05);
    placePlayerMesh(mover, at(0, -i * 0.2), 0.05);
  }
  expect(Math.abs(leg(still).rotation.x)).toBeLessThan(1e-6);
  expect(Math.abs(leg(mover).rotation.x)).toBeGreaterThan(0.01);
});

test('U2: the name label can be hidden', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect(mesh.getObjectByName('label')!.visible).toBe(true);
  setNameVisible(mesh, false);
  expect(mesh.getObjectByName('label')!.visible).toBe(false);
});

test('A3: disposing a player leaves the shared geometry and material alone', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  const geometry = vi.spyOn(shared.geometry, 'dispose');
  const material = vi.spyOn(shared.material, 'dispose');
  disposePlayerMesh(mesh);
  expect(geometry).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
});
