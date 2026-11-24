import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PropPlacement } from './dressMap';
import { PROP_CHUNK, createPropLayer } from './propLayer';

const box = (height = 2) => () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), new THREE.MeshBasicMaterial());
  mesh.position.y = height / 2;
  root.add(mesh);
  return root;
};
const two = () => {
  const root = box()();
  const second = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
  second.position.set(1, 3, 0);
  root.add(second);
  return root;
};
const at = (key: string, x: number, z: number, extra: Partial<PropPlacement> = {}): PropPlacement => ({ key: key as PropPlacement['key'], role: 'clutter', x, y: 0, z, yaw: 0, scale: 1, ...extra });
const models = (key: string) => (key === 'a' ? box()() : key === 'b' ? two() : null);
const manifest = { a: {}, b: {} };
const instanced = (layer: { group: THREE.Group }) => {
  const found: THREE.InstancedMesh[] = [];
  layer.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) found.push(o as THREE.InstancedMesh); });
  return found;
};

describe('prop layer (R3)', () => {
  it('draws every placement of a model near each other with one instanced mesh per mesh of the model', () => {
    const scene = new THREE.Scene();
    const placements = [at('a', 1, 1), at('a', 3, 2), at('a', 5, 5), at('b', 2, 2), at('b', 4, 4)];
    const layer = createPropLayer(scene, placements, manifest, { drawDistance: 220, shadows: false, model: models });
    expect(scene.children).toContain(layer.group);
    const meshes = instanced(layer);
    // a: one mesh in one chunk; b: two meshes (it has two) in one chunk.
    expect(meshes).toHaveLength(3);
    expect(meshes.map((m) => m.count).sort()).toEqual([2, 2, 3]);
    expect(layer.stats.instances).toBe(5);
  });

  it('places an instance at its position, turned by its yaw and scaled, on the model\'s own offset', () => {
    const scene = new THREE.Scene();
    const layer = createPropLayer(scene, [at('b', 10, 20, { y: 1.5, yaw: Math.PI / 2, scale: 2 })], manifest, { drawDistance: 220, shadows: false, model: models });
    const small = instanced(layer).find((m) => (m.geometry as THREE.BoxGeometry).parameters.width === 0.5)!;
    const matrix = new THREE.Matrix4();
    small.getMatrixAt(0, matrix);
    const point = new THREE.Vector3().setFromMatrixPosition(matrix);
    // The second mesh sits at (1, 3, 0) in the model; scaled by 2 and turned a quarter about y it lands at (10, 1.5 + 6, 20 - 2).
    expect(point.x).toBeCloseTo(10, 5);
    expect(point.y).toBeCloseTo(7.5, 5);
    expect(point.z).toBeCloseTo(18, 5);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(2, 5);
  });

  it('splits far-apart placements of one model into chunks', () => {
    const scene = new THREE.Scene();
    const layer = createPropLayer(scene, [at('a', 0, 0), at('a', 2 * PROP_CHUNK, 0), at('a', 0, 2 * PROP_CHUNK)], manifest, { drawDistance: 220, shadows: false, model: models });
    expect(instanced(layer)).toHaveLength(3);
  });

  it('skips a key with no model or no manifest entry, and counts only what it draws', () => {
    const scene = new THREE.Scene();
    const layer = createPropLayer(scene, [at('a', 0, 0), at('missing', 1, 1), at('c', 2, 2)], manifest, { drawDistance: 220, shadows: false, model: (key) => (key === 'c' ? box()() : models(key)) });
    expect(layer.stats.instances).toBe(1);
  });

  it('hides a chunk beyond the draw distance: 90 m on a phone, 220 m on a desktop', () => {
    const placements = [at('a', 50, 0), at('a', 150, 0), at('a', 300, 0)];
    const visibleAt = (drawDistance: number) => {
      const layer = createPropLayer(new THREE.Scene(), placements, manifest, { drawDistance, shadows: false, model: models });
      layer.update({ x: 0, z: 0 });
      return instanced(layer).filter((m) => m.visible).map((m) => Math.round(new THREE.Vector3().setFromMatrixPosition((m.getMatrixAt(0, new THREE.Matrix4()), new THREE.Matrix4().fromArray(m.instanceMatrix.array as unknown as number[]))).x));
    };
    expect(visibleAt(90)).toEqual([50]);
    expect(visibleAt(220)).toEqual([50, 150]);
  });

  it('shows a chunk again when the camera comes back, and updates cheaply with nothing to draw', () => {
    const layer = createPropLayer(new THREE.Scene(), [at('a', 300, 0)], manifest, { drawDistance: 90, shadows: false, model: models });
    layer.update({ x: 0, z: 0 });
    expect(instanced(layer)[0]!.visible).toBe(false);
    layer.update({ x: 280, z: 0 });
    expect(instanced(layer)[0]!.visible).toBe(true);
    const empty = createPropLayer(new THREE.Scene(), [], manifest, { drawDistance: 90, shadows: false, model: models });
    empty.update({ x: 0, z: 0 });
    expect(empty.stats.instances).toBe(0);
  });

  it('casts shadows only when asked, and only for models taller than a metre', () => {
    const tall = createPropLayer(new THREE.Scene(), [at('a', 0, 0)], manifest, { drawDistance: 90, shadows: true, model: models });
    expect(instanced(tall)[0]!.castShadow).toBe(true);
    const off = createPropLayer(new THREE.Scene(), [at('a', 0, 0)], manifest, { drawDistance: 90, shadows: false, model: models });
    expect(instanced(off)[0]!.castShadow).toBe(false);
    const low = createPropLayer(new THREE.Scene(), [at('c', 0, 0)], { c: {} }, { drawDistance: 90, shadows: true, model: () => box(0.5)() });
    expect(instanced(low)[0]!.castShadow).toBe(false);
  });

  it('disposes its instanced meshes and takes its group out of the scene', () => {
    const scene = new THREE.Scene();
    const layer = createPropLayer(scene, [at('a', 0, 0)], manifest, { drawDistance: 90, shadows: false, model: models });
    layer.dispose();
    expect(scene.children).not.toContain(layer.group);
  });
});
