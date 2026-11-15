import * as THREE from 'three';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createDecorRenderer, DECOR_UPDATE_SECONDS } from './decorRenderer';
import type { DecorPlacement } from './decorScatter';
import { disposeScene } from './disposeScene';

const shared = {
  tall: { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial() },
  low: { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial() },
};
for (const { geometry, material } of Object.values(shared)) {
  geometry.userData.shared = true;
  material.userData.shared = true;
}

vi.mock('./models', () => ({
  hasModel: (key: string) => key !== 'decor.palm.e',
  instantiate: (key: string) => {
    if (key === 'decor.palm.e') return null;
    const { geometry, material } = key === 'decor.palm.a' ? shared.tall : shared.low;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(key === 'decor.palm.a' ? 6 : 0.5);
    mesh.position.y = key === 'decor.palm.a' ? 3 : 0.25;
    const root = new THREE.Group();
    root.add(mesh);
    return root;
  },
}));

const p = (model: string, x: number, z: number): DecorPlacement => ({ model: model as DecorPlacement['model'], x, y: 0, z, yaw: 0, scale: 1 });
const route: [number, number][] = [
  [0, 0],
  [0, -1000],
];
const placements = [p('decor.palm.a', 20, -10), p('decor.scrub', 5, -20), p('decor.palm.e', 5, -30), p('decor.scrub', 30, -800)];
const meshes = (group: THREE.Group) => group.children as THREE.InstancedMesh[];

describe('createDecorRenderer', () => {
  beforeEach(() => vi.clearAllMocks());

  test('one instanced mesh per model primitive, skipping models that failed to load', () => {
    const decor = createDecorRenderer(placements, route, { touch: false, softwareGl: false });
    expect(meshes(decor.group).length).toBe(2);
    decor.update({ x: 0, z: 0 }, 1);
    expect(meshes(decor.group).map((m) => m.count).sort()).toEqual([1, 1]);
  });

  test('shows only the cells near the camera', () => {
    const decor = createDecorRenderer(placements, route, { touch: false, softwareGl: false });
    decor.update({ x: 0, z: -800 }, 1);
    const counts = meshes(decor.group).map((m) => (m.visible ? m.count : 0));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  test('touch has the smaller radius', () => {
    const far = [p('decor.scrub', 0, -300)];
    const desktop = createDecorRenderer(far, route, { touch: false, softwareGl: false });
    const phone = createDecorRenderer(far, route, { touch: true, softwareGl: false });
    desktop.update({ x: 0, z: 0 }, 1);
    phone.update({ x: 0, z: 0 }, 1);
    expect(meshes(desktop.group)[0]!.count).toBe(1);
    expect(meshes(phone.group)[0]!.count).toBe(0);
  });

  test('software GL has the smallest radius', () => {
    const near = [p('decor.scrub', 0, -150)];
    const soft = createDecorRenderer(near, route, { touch: false, softwareGl: true });
    const phone = createDecorRenderer(near, route, { touch: true, softwareGl: false });
    soft.update({ x: 0, z: 0 }, 1);
    phone.update({ x: 0, z: 0 }, 1);
    expect(meshes(soft.group)[0]!.count).toBe(0);
    expect(meshes(phone.group)[0]!.count).toBe(1);
  });

  test('updates at most once per interval and only when the visible cells change', () => {
    const decor = createDecorRenderer(placements, route, { touch: false, softwareGl: false });
    const mesh = meshes(decor.group)[0]!;
    decor.update({ x: 0, z: 0 }, 1);
    const version = mesh.instanceMatrix.version;
    decor.update({ x: 0, z: -900 }, 1 + DECOR_UPDATE_SECONDS / 2);
    expect(mesh.instanceMatrix.version).toBe(version);
    decor.update({ x: 5, z: -5 }, 1 + DECOR_UPDATE_SECONDS + 0.1);
    expect(mesh.instanceMatrix.version).toBe(version);
    decor.update({ x: 0, z: -900 }, 3);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
  });

  test('only tall models cast shadows, never on touch or software GL', () => {
    const cast = (options: { touch: boolean; softwareGl: boolean }) => meshes(createDecorRenderer(placements, route, options).group).filter((m) => m.castShadow).length;
    expect(cast({ touch: false, softwareGl: false })).toBe(1);
    expect(cast({ touch: true, softwareGl: false })).toBe(0);
    expect(cast({ touch: false, softwareGl: true })).toBe(0);
  });

  test('instances share the loaded geometry and disposeScene leaves it alone', () => {
    const decor = createDecorRenderer(placements, route, { touch: false, softwareGl: false });
    const scene = new THREE.Scene();
    scene.add(decor.group);
    const geometryDispose = vi.spyOn(shared.tall.geometry, 'dispose');
    const materialDispose = vi.spyOn(shared.tall.material, 'dispose');
    expect(meshes(decor.group).some((m) => m.geometry === shared.tall.geometry && m.material === shared.tall.material)).toBe(true);
    decor.dispose();
    disposeScene(scene);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
