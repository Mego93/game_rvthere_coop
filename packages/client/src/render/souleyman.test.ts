import { CHARACTER_SCALE, quatFromAxisAngle, AXIS_Y, vec3, type Checkpoint } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SOULEYMAN_GREETING } from '../ui/hud/eventToast';
import { loadManifestModel } from './modelTestHelper';
import { createSouleymanMesh, createSouleymanMeshes, isFigureCheckpointAt, SOULEYMAN_LATERAL, souleymanPlacements } from './souleyman';

const box = { center: vec3(0, 0, 0), halfExtents: vec3(1, 1, 1), rot: { x: 0, y: 0, z: 0, w: 1 } };
const checkpoint = (id: string, x: number, y: number, z: number, yaw: number, figure = true): Checkpoint => ({
  id,
  ...(figure ? { figure: true as const } : {}),
  trigger: box,
  spawn: { pos: vec3(x, y, z), rot: quatFromAxisAngle(AXIS_Y, yaw) },
});

test('T1: yaw 0 puts him SOULEYMAN_LATERAL to the right, on the spawn height', () => {
  const [placement] = souleymanPlacements([checkpoint('a', 5, 2.5, -40, 0)]);
  expect(placement!.x).toBeCloseTo(5 + SOULEYMAN_LATERAL);
  expect(placement!.z).toBeCloseTo(-40);
  expect(placement!.y).toBe(2.5);
});

test('T1: the offset rotates with the yaw; one placement per checkpoint in order', () => {
  const list = [checkpoint('a', 0, 0, 0, 0), checkpoint('b', 10, 1, 20, Math.PI / 2), checkpoint('c', -3, 2, 7, 1)];
  const placed = souleymanPlacements(list);
  expect(placed).toHaveLength(3);
  // Yaw 90 degrees turns left: forward is -x, so right is -z.
  expect(placed[1]!.x).toBeCloseTo(10);
  expect(placed[1]!.z).toBeCloseTo(20 - SOULEYMAN_LATERAL);
  expect(placed[1]!.y).toBe(1);
  expect(placed[2]!.x).toBeCloseTo(-3 + SOULEYMAN_LATERAL * Math.cos(1));
  expect(placed[2]!.z).toBeCloseTo(7 - SOULEYMAN_LATERAL * Math.sin(1));
});

test('only figure checkpoints get a Souleyman; the look still follows the checkpoint index', () => {
  const list = [checkpoint('a', 0, 0, 0, 0), checkpoint('b', 10, 0, -50, 0, false), checkpoint('c', 20, 0, -100, 0), checkpoint('d', 30, 0, -150, 0, false)];
  const placed = souleymanPlacements(list);
  expect(placed).toHaveLength(2);
  expect(placed.map((p) => p.z)).toEqual([0, -100]);
  expect(placed.map((p) => p.variant)).toEqual([0, 2]);
});

test('a checkpoint event greets only at the nearest figure checkpoint', () => {
  const list = [checkpoint('a', 0, 0, 0, 0), checkpoint('b', 0, 0, -500, 0, false), checkpoint('c', 0, 0, -1000, 0)];
  expect(isFigureCheckpointAt(list, { x: 1, z: -498 })).toBe(false);
  expect(isFigureCheckpointAt(list, { x: -2, z: -1003 })).toBe(true);
  expect(isFigureCheckpointAt(list, undefined)).toBe(true);
});

test('T2: the figure faces the road centre for two yaws', () => {
  for (const yaw of [0, 0.9]) {
    const cp = checkpoint('a', 4, 0, -9, yaw);
    const [p] = souleymanPlacements([cp]);
    const facing = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p!.yaw);
    const toCentre = new THREE.Vector3(4 - p!.x, 0, -9 - p!.z).normalize();
    expect(facing.dot(toCentre)).toBeCloseTo(1);
  }
});

test('T3: height is about 1.8 x CHARACTER_SCALE, everything casts shadows, hood, turban and robe exist', () => {
  const figure = createSouleymanMesh();
  const size = new THREE.Box3().setFromObject(figure).getSize(new THREE.Vector3());
  expect(Math.abs(size.y - 1.8 * CHARACTER_SCALE) / (1.8 * CHARACTER_SCALE)).toBeLessThan(0.05);
  expect(new THREE.Box3().setFromObject(figure).min.y).toBeCloseTo(0);
  const names = new Set<string>();
  figure.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      expect((object as THREE.Mesh).castShadow).toBe(true);
      names.add(object.name);
    }
  });
  for (const part of ['hood', 'turban', 'robe']) expect(names.has(part)).toBe(true);
});

test('the greeting text', () => {
  expect(SOULEYMAN_GREETING).toBe('Souleyman: Saved. Bonne route!');
});

const footprint = (yaw: number) => {
  const bounds = new THREE.Box3();
  for (const mesh of createSouleymanMeshes([{ x: 10, y: 2, z: -5, yaw }])) bounds.union(new THREE.Box3().setFromObject(mesh));
  return bounds;
};

test('merged meshes stand on y, are 1.8 x CHARACTER_SCALE tall and centred on x, z', () => {
  const bounds = footprint(0);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(2);
  expect(size.y).toBeCloseTo(1.8 * CHARACTER_SCALE, 1);
  expect(centre.x).toBeCloseTo(10, 1);
  expect(centre.z).toBeCloseTo(-5, 1);
  expect(size.x).toBeGreaterThan(size.z + 0.1);
});

test('a quarter turn swaps the footprint extents', () => {
  const a = footprint(0).getSize(new THREE.Vector3());
  const b = footprint(Math.PI / 2).getSize(new THREE.Vector3());
  expect(b.x).toBeCloseTo(a.z, 2);
  expect(b.z).toBeCloseTo(a.x, 2);
  expect(b.x).toBeLessThan(b.z - 0.1);
});

// The model path (step 33): the game's blocky character in four looks, merged per material and per look.
const { loaded } = vi.hoisted(() => ({ loaded: new Map<string, () => THREE.Group>() }));

vi.mock('./models', async (original) => ({
  ...(await original<typeof import('./models')>()),
  hasModel: (key: string) => loaded.has(key),
  instantiate: (key: string) => loaded.get(key)?.() ?? null,
}));

describe('four looks on the game character', () => {
  const place = (index: number) => ({ x: index * 3, y: 1, z: -7, yaw: 0.3, variant: index % 4 });

  beforeEach(async () => {
    loaded.clear();
    const character = await loadManifestModel('character.player');
    const headdress = await loadManifestModel('souleyman.headdress');
    loaded.set('character.player', () => character.clone(true));
    loaded.set('souleyman.headdress', () => headdress.clone(true));
  });

  const names = (figure: THREE.Object3D) => {
    const found: string[] = [];
    figure.traverse((node) => found.push(node.name));
    return found;
  };

  test('T3: a figure of each look stands on the ground, is about 1.8 x CHARACTER_SCALE tall to the head and casts shadows', () => {
    for (let variant = 0; variant < 4; variant++) {
      const figure = createSouleymanMesh(variant);
      figure.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(figure);
      expect(box.min.y, `look ${variant}`).toBeCloseTo(0, 2);
      const head = figure.getObjectByName('head') as THREE.Mesh;
      head.geometry.computeBoundingBox();
      expect(head.geometry.boundingBox!.clone().applyMatrix4(head.matrixWorld).max.y, `look ${variant}`).toBeCloseTo(1.8 * CHARACTER_SCALE, 2);
      figure.traverse((node) => {
        if ((node as THREE.Mesh).isMesh && !node.name.startsWith('look-')) expect((node as THREE.Mesh).castShadow, node.name).toBe(true);
      });
    }
  });

  test('T3: each look has its own head wear: pointed hood, white turban, red fez, the Sketchfab headdress parented to the head', () => {
    const wear = (variant: number) => names(createSouleymanMesh(variant)).filter((name) => ['hood', 'turban', 'fez', 'headdress'].includes(name));
    expect(wear(0)).toContain('hood');
    expect(wear(1)).toContain('turban');
    expect(wear(2)).toContain('fez');
    expect(wear(3)).toContain('headdress');
    const figure = createSouleymanMesh(3);
    const headdress = figure.getObjectByName('headdress')!;
    expect(headdress.parent).toBe(figure.getObjectByName('head'));
    for (const variant of [0, 1, 2]) expect(names(createSouleymanMesh(variant))).not.toContain('headdress');
  });

  test('T3: the four looks differ in robe colour and in silhouette', () => {
    const robe = (variant: number) => (createSouleymanMesh(variant).getObjectByName('robe') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const colours = new Set([0, 1, 2, 3].map((variant) => robe(variant).color.getHex()));
    expect(colours.size).toBe(4);
    const tops = [0, 1, 2, 3].map((variant) => new THREE.Box3().setFromObject(createSouleymanMesh(variant)).max.y);
    expect(new Set(tops.map((y) => y.toFixed(3))).size).toBeGreaterThan(1);
  });

  test('T3: souleymanPlacements gives the look index % 4 in checkpoint order', () => {
    const list = Array.from({ length: 9 }, (_, index) => checkpoint(`c${index}`, index, 0, 0, 0));
    expect(souleymanPlacements(list).map((p) => p.variant)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
  });

  test('T3: the merged mesh count is bounded by looks x 6 and does not grow with the figure count', () => {
    const few = createSouleymanMeshes([0, 1, 2, 3].map(place));
    const many = createSouleymanMeshes(Array.from({ length: 80 }, (_, index) => place(index)));
    expect(few.length).toBeGreaterThan(4);
    expect(few.length).toBeLessThanOrEqual(4 * 6);
    expect(many.length).toBe(few.length);
    for (const mesh of many) expect(mesh.name).toBe('souleyman');
    const vertices = (meshes: THREE.Mesh[]) => meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    expect(vertices(many)).toBeGreaterThan(vertices(few) * 15);
  });

  test('T3: a figure is merged at its place, standing on y, and every look is present', () => {
    const meshes = createSouleymanMeshes([place(0), place(1), place(2), place(3)]);
    const bounds = new THREE.Box3();
    for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh));
    expect(bounds.min.y).toBeCloseTo(1, 2);
    expect(bounds.min.x).toBeLessThan(0);
    expect(bounds.max.x).toBeGreaterThan(9);
    const withoutModel = (loaded.clear(), createSouleymanMeshes([0, 1, 2, 3].map(place)));
    expect(withoutModel.length).toBeLessThanOrEqual(6);
  });
});
