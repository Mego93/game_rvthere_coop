import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { fitted, fitToTarget, hasModel, instantiate, markShared, prepareModel } from './models';

const PUBLIC = join(import.meta.dirname, '../../public');
const box = (min: [number, number, number], max: [number, number, number]) => ({
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
});

describe('fitToTarget', () => {
  it('M2: scales the longest side to the target and puts the origin at the bottom centre', () => {
    const { scale, offset } = fitToTarget(box([-1, 2, -3], [3, 4, 5]), 4);
    expect(scale.x).toBeCloseTo(0.5);
    expect(scale.y).toBeCloseTo(0.5);
    expect(scale.z).toBeCloseTo(0.5);
    // Centre x is 1, centre z is 1, bottom is y 2; after scaling those move to the origin.
    expect(offset.x).toBeCloseTo(-0.5);
    expect(offset.y).toBeCloseTo(-1);
    expect(offset.z).toBeCloseTo(-0.5);
  });

  it('M2: an axis target scales each axis to its own size', () => {
    const { scale } = fitToTarget(box([0, 0, 0], [2, 1, 4]), { x: 1, y: 2, z: 2 });
    expect([scale.x, scale.y, scale.z]).toEqual([0.5, 2, 0.5]);
  });

  it('rejects an empty box or a non-positive target', () => {
    expect(() => fitToTarget(box([0, 0, 0], [0, 0, 0]), 1)).toThrow();
    expect(() => fitToTarget(box([0, 0, 0], [1, 1, 1]), 0)).toThrow();
  });
});

describe('prepareModel', () => {
  const sample = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6).translate(5, 7, 9), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const scene = new THREE.Group();
    scene.add(mesh);
    return { scene, mesh };
  };

  it('M2: the normalised model sits on y 0, centred on x and z, with the target longest side', () => {
    const { scene } = sample();
    const root = prepareModel(scene, 3);
    const measured = new THREE.Box3().setFromObject(root);
    const size = measured.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(3);
    expect(size.y).toBeCloseTo(2);
    expect(measured.min.y).toBeCloseTo(0);
    expect((measured.min.x + measured.max.x) / 2).toBeCloseTo(0);
    expect((measured.min.z + measured.max.z) / 2).toBeCloseTo(0);
  });

  it('A3: geometry, materials and textures are flagged shared, and unlit materials become lit ones', () => {
    const { scene, mesh } = sample();
    const map = new THREE.Texture();
    (mesh.material as THREE.MeshBasicMaterial).map = map;
    prepareModel(scene, 1);
    const material = mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(material.isMeshStandardMaterial).toBe(true);
    expect(material.color.getHex()).toBe(0xff0000);
    expect(material.map).toBe(map);
    expect(mesh.geometry.userData.shared).toBe(true);
    expect(material.userData.shared).toBe(true);
    expect(map.userData.shared).toBe(true);
  });

  it('M1: clones share geometry and materials', () => {
    const { scene } = sample();
    const root = prepareModel(scene, 1);
    const a = root.clone();
    const b = root.clone();
    const meshOf = (g: THREE.Object3D) => g.getObjectByProperty('isMesh', true) as THREE.Mesh;
    expect(meshOf(a).geometry).toBe(meshOf(b).geometry);
    expect(meshOf(a).material).toBe(meshOf(b).material);
    expect(a).not.toBe(b);
  });

  it('markShared flags a geometry, a material and its textures', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BufferGeometry();
    markShared(geometry, material);
    expect([geometry.userData.shared, material.userData.shared, texture.userData.shared]).toEqual([true, true, true]);
  });
});

describe('before preload', () => {
  it('M1: an unknown or unloaded key has no model and instantiates to null', () => {
    expect(hasModel('vehicle.lodgy')).toBe(false);
    expect(instantiate('vehicle.lodgy')).toBeNull();
    expect(instantiate('nope' as 'vehicle.lodgy')).toBeNull();
  });
});

describe('real files', () => {
  it('GLTFLoader parses a Nature Kit palm without a DOM and it fits its target', async () => {
    const bytes = readFileSync(join(PUBLIC, 'models/nature/tree_palm.glb'));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const root = prepareModel(gltf.scene, 6);
    let triangles = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) triangles += (m.geometry.index ? m.geometry.index.count : (m.geometry.attributes.position?.count ?? 0)) / 3;
    });
    expect(triangles).toBeLessThanOrEqual(1000);
    const measured = new THREE.Box3().setFromObject(root);
    expect(measured.getSize(new THREE.Vector3()).length()).toBeGreaterThan(0);
    expect(Math.max(...measured.getSize(new THREE.Vector3()).toArray())).toBeCloseTo(6);
    expect(measured.min.y).toBeCloseTo(0);
  });
});

describe('desert look', () => {
  const standard = (name: string, map: THREE.Texture | null) => new THREE.MeshStandardMaterial({ name, map, metalness: 1, color: 0x2ed8b8 });
  const wrap = (material: THREE.Material) => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    return scene;
  };

  it('drops the Nature Kit metal and mint colours', () => {
    const material = standard('grass', null);
    prepareModel(wrap(material), 1, 'nature');
    expect(material.metalness).toBe(0);
    expect(material.color.getHex()).not.toBe(new THREE.Color(0x2ed8b8).getHex());
  });

  it('multiplies an ochre tint into a City Kit colour map only', () => {
    const map = new THREE.Texture();
    const city = standard('colormap', map);
    const car = standard('colormap', map);
    prepareModel(wrap(city), 1, 'city-commercial');
    prepareModel(wrap(car), 1, 'car-kit');
    expect(city.color.getHex()).toBe(new THREE.Color(0xe6c79a).getHex());
    expect(car.color.getHex()).toBe(new THREE.Color(0x2ed8b8).getHex());
  });
});

describe('Sketchfab look', () => {
  const metal = (name: string, map: THREE.Texture | null, metalnessMap: THREE.Texture | null = null) =>
    new THREE.MeshStandardMaterial({ name, map, metalnessMap, metalness: 1, color: 0x336699 });
  const wrap = (material: THREE.Material) => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

  it('keeps the file colours (no tint), drops full metal and keeps at most 0.4 where a metal map says where', () => {
    const plain = metal('Wood_1', null);
    const mapped = metal('Pot', new THREE.Texture(), new THREE.Texture());
    prepareModel(wrap(plain), 1, 'sketchfab');
    prepareModel(wrap(mapped), 1, 'sketchfab');
    expect(plain.color.getHex()).toBe(0x336699);
    expect(plain.metalness).toBe(0);
    expect(mapped.color.getHex()).toBe(0x336699);
    expect(mapped.metalness).toBeLessThanOrEqual(0.4);
    expect(mapped.metalness).toBeGreaterThan(0);
  });
});

describe('fitted', () => {
  const unit = () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4).translate(0, 0.5, 0), new THREE.MeshBasicMaterial()));
    return group;
  };
  const sizeOf = (object: THREE.Object3D) => {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
  };

  it('stretches a model to the box, standing on y 0 and centred', () => {
    const box = sizeOf(fitted(unit(), { x: 1, y: 3, z: 2 }));
    expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([1, 3, 2].map((n) => expect.closeTo(n, 5)));
    expect(box.min.y).toBeCloseTo(0);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0);
  });

  it('turns the model before fitting, so the box is in the turned frame', () => {
    const box = sizeOf(fitted(unit(), { x: 4, y: 1, z: 2 }, Math.PI / 2));
    expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([4, 1, 2].map((n) => expect.closeTo(n, 5)));
  });

  it('an axis left out follows the mean of the others', () => {
    const size = sizeOf(fitted(unit(), { y: 2 })).getSize(new THREE.Vector3());
    expect(size.toArray()).toEqual([4, 2, 8].map((n) => expect.closeTo(n, 5)));
  });
});
