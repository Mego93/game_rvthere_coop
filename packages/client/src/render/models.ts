import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_KEYS, MODEL_MANIFEST, MODELS_BASE_URL, type ModelKey, type ModelTarget } from './modelManifest';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Fit {
  scale: Vec3Like;
  offset: Vec3Like;
}

// scale applies to the model; offset is the position of the scaled model that puts the bottom centre of its box at the origin.
export function fitToTarget(box: { min: Vec3Like; max: Vec3Like }, target: ModelTarget): Fit {
  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
  const wanted = typeof target === 'number' ? { x: target, y: target, z: target } : target;
  if (!(size.x > 0 || size.y > 0 || size.z > 0)) throw new Error('model has an empty bounding box');
  if (!(wanted.x > 0 && wanted.y > 0 && wanted.z > 0)) throw new Error('target size must be positive');
  let scale: Vec3Like;
  if (typeof target === 'number') {
    const s = target / Math.max(size.x, size.y, size.z);
    scale = { x: s, y: s, z: s };
  } else {
    const per = (want: number, have: number) => (have > 0 ? want / have : 1);
    scale = { x: per(wanted.x, size.x), y: per(wanted.y, size.y), z: per(wanted.z, size.z) };
  }
  return {
    scale,
    offset: {
      x: (-(box.min.x + box.max.x) / 2) * scale.x,
      y: -box.min.y * scale.y,
      z: (-(box.min.z + box.max.z) / 2) * scale.z,
    },
  };
}

// Shared resources outlive a scene; disposeScene skips anything flagged here.
export function markShared(geometry: THREE.BufferGeometry | undefined, material: THREE.Material | undefined): void {
  if (geometry) geometry.userData.shared = true;
  if (!material) return;
  material.userData.shared = true;
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.userData.shared = true;
  }
}

// KHR_materials_unlit loads as MeshBasicMaterial; lit materials let the sky and sun shade the model.
function lit(material: THREE.Material): THREE.Material {
  const basic = material as THREE.MeshBasicMaterial;
  if (!basic.isMeshBasicMaterial) return material;
  const standard = new THREE.MeshStandardMaterial({
    name: basic.name,
    color: basic.color,
    map: basic.map,
    vertexColors: basic.vertexColors,
    transparent: basic.transparent,
    opacity: basic.opacity,
    alphaTest: basic.alphaTest,
    side: basic.side,
    roughness: 1,
    metalness: 0,
  });
  basic.dispose();
  return standard;
}

// The Nature Kit's palette is minty and its materials are fully metallic; desert colours and no metal suit the scene.
const NATURE_TINTS: Record<string, number> = {
  grass: 0x7a8f3e,
  leafsGreen: 0x5f8a3a,
  stone: 0xb3a590,
  stoneDark: 0x948873,
  _defaultMat: 0xc9ad88,
  dirt: 0xc08560,
  woodBark: 0x7a5535,
  woodDark: 0x5e4129,
  wood: 0x8a6240,
  woodInner: 0xd9b88a,
};

// City Kit walls are near white; ochre (the spec's palette) multiplies into their colour map.
const PACK_TINTS: Record<string, number> = { 'city-commercial': 0xe6c79a, 'city-suburban': 0xe6c79a, 'city-roads': 0xeadcc4 };

// Models in this pack keep the colours they came with.
const UNTINTED_PACKS = new Set(['real']);

// Sketchfab models keep their colours but several came fully metallic, which reads black without a matching sky.
const SKETCHFAB_MAX_MAPPED_METAL = 0.4;

function desert(material: THREE.Material, pack: string | undefined): THREE.Material {
  if (UNTINTED_PACKS.has(pack ?? '')) return material;
  const standard = material as THREE.MeshStandardMaterial;
  if (pack === 'sketchfab' && standard.isMeshStandardMaterial) {
    standard.metalness = standard.metalnessMap ? Math.min(standard.metalness, SKETCHFAB_MAX_MAPPED_METAL) : 0;
    return material;
  }
  if (!standard.isMeshStandardMaterial || standard.metalnessMap) return material;
  standard.metalness = 0;
  const tint = standard.map ? PACK_TINTS[pack ?? ''] : NATURE_TINTS[standard.name];
  if (tint !== undefined) standard.color.set(tint);
  return material;
}

// Wraps a loaded scene in a root whose origin is the bottom centre and whose size matches the target.
export function prepareModel(scene: THREE.Object3D, target: ModelTarget, pack?: string): THREE.Group {
  scene.updateMatrixWorld(true);
  const { scale, offset } = fitToTarget(new THREE.Box3().setFromObject(scene), target);
  const converted = new Map<THREE.Material, THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material) => {
      let next = converted.get(material);
      if (!next) {
        next = desert(lit(material), pack);
        converted.set(material, next);
      }
      markShared(mesh.geometry, next);
      return next;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  scene.scale.set(scale.x, scale.y, scale.z);
  scene.position.set(offset.x, offset.y, offset.z);
  const root = new THREE.Group();
  root.add(scene);
  return root;
}

export interface FitSize {
  x?: number;
  y?: number;
  z?: number;
}

// A model turned by `yaw` and stretched to the given box in metres (axes left out follow the mean of the others); the wrapper's origin is the bottom centre.
export function fitted(model: THREE.Object3D, size: FitSize, yaw = 0): THREE.Group {
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.y = yaw;
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const have = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
  const ratios = (['x', 'y', 'z'] as const).map((axis) => (size[axis] !== undefined && have[axis] > 0 ? size[axis]! / have[axis] : null));
  const known = ratios.filter((r): r is number => r !== null);
  if (known.length === 0) return wrapper;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  wrapper.scale.set(ratios[0] ?? mean, ratios[1] ?? mean, ratios[2] ?? mean);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  return wrapper;
}

// Casting and receiving shadows on every mesh of a model instance.
export function shadowed<T extends THREE.Object3D>(root: T): T {
  root.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

const templates = new Map<ModelKey, THREE.Group>();
const clips = new Map<ModelKey, THREE.AnimationClip[]>();
let preloading: Promise<void> | null = null;

export function hasModel(key: string): boolean {
  return templates.has(key as ModelKey);
}

// The animation clips of a model's file; they target node names, so they play on any instantiate() clone.
export function animationsOf(key: string): readonly THREE.AnimationClip[] {
  return clips.get(key as ModelKey) ?? [];
}

export function instantiate(key: string): THREE.Group | null {
  return templates.get(key as ModelKey)?.clone() ?? null;
}

async function load(onProgress?: (done: number, total: number) => void): Promise<void> {
  const files = [...new Set(MODEL_KEYS.map((key) => MODEL_MANIFEST[key].file))];
  const loader = new GLTFLoader();
  let done = 0;
  const parsed = new Map<string, THREE.Object3D | null>();
  const animations = new Map<string, THREE.AnimationClip[]>();
  await Promise.all(
    files.map(async (file) => {
      try {
        const gltf = await loader.loadAsync(MODELS_BASE_URL + file);
        parsed.set(file, gltf.scene);
        animations.set(file, gltf.animations);
      } catch (error) {
        parsed.set(file, null);
        console.warn(`model ${file} failed to load`, error);
      }
      onProgress?.(++done, files.length);
    }),
  );
  for (const key of MODEL_KEYS) {
    const entry = MODEL_MANIFEST[key];
    const scene = parsed.get(entry.file);
    if (!scene) continue;
    try {
      // Keys that share a file each normalise their own copy of the node tree; geometry and materials stay shared.
      templates.set(key, prepareModel(scene.clone(), entry.targetSize, entry.pack));
      clips.set(key, animations.get(entry.file) ?? []);
    } catch (error) {
      console.warn(`model ${key} could not be prepared`, error);
    }
  }
}

// Never rejects: a failed file logs once and its keys stay without a model.
export function preloadAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
  preloading ??= load(onProgress).catch((error) => console.warn('model preload failed', error));
  return preloading;
}
