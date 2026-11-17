import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_MANIFEST, type ModelKey } from './modelManifest';
import { prepareModel } from './models';

// Test only: a manifest model parsed from its file in Node (textures are not decoded, geometry and materials are real) and prepared the way the game's loader prepares it.
export async function loadManifestModel(key: ModelKey): Promise<THREE.Group> {
  const entry = MODEL_MANIFEST[key];
  const bytes = readFileSync(join(import.meta.dirname, '../../public/models', entry.file));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'TEST_NO_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return prepareModel(gltf.scene, entry.targetSize, entry.pack);
}
