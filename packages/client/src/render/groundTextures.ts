import type { Surface } from '@lodgy/shared';
import * as THREE from 'three';

const BASE_URL = '/textures/';

export interface SceneOptions {
  // No normal maps and no anisotropic filtering (touch).
  lite?: boolean;
  // Flat colours instead of textures: software GL fills pixels on the CPU and cannot afford them.
  flat?: boolean;
}

export type TextureSet = 'asphalt' | 'gravel' | 'sand' | 'pebbles' | 'red-earth';
export type TextureKind = 'diffuse' | 'normal';

export const SURFACE_TEXTURE: Record<Surface, TextureSet> = { road: 'asphalt', gravel: 'gravel', sand: 'sand', riverbed: 'pebbles' };
export const TEXTURE_SETS: readonly TextureSet[] = ['asphalt', 'gravel', 'sand', 'pebbles', 'red-earth'];

const textures = new Map<string, THREE.Texture>();
let preload: Promise<void> | null = null;

export function groundTexture(set: TextureSet, kind: TextureKind): THREE.Texture | null {
  return textures.get(`${set}/${kind}`) ?? null;
}

export function groundTextureCount(normals: boolean): number {
  return TEXTURE_SETS.length * (normals ? 2 : 1);
}

// Never rejects: a failed file logs once and its surface keeps its flat colour. Touch devices skip the normal maps.
export function preloadGroundTextures(normals: boolean, onProgress?: (done: number, total: number) => void): Promise<void> {
  preload ??= (async () => {
    const loader = new THREE.TextureLoader();
    const kinds: TextureKind[] = normals ? ['diffuse', 'normal'] : ['diffuse'];
    const files = TEXTURE_SETS.flatMap((set) => kinds.map((kind) => ({ set, kind })));
    let done = 0;
    await Promise.all(
      files.map(async ({ set, kind }) => {
        try {
          const texture = await loader.loadAsync(`${BASE_URL}${set}/${kind}.jpg`);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = kind === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.userData.shared = true;
          textures.set(`${set}/${kind}`, texture);
        } catch (error) {
          console.warn(`texture ${set}/${kind} failed to load`, error);
        }
        onProgress?.(++done, files.length);
      }),
    );
  })();
  return preload;
}
