import * as THREE from 'three';

// Frees the GPU resources of everything in the scene and empties it; the renderer is shared and stays.
export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const drawable = object as THREE.Mesh;
    drawable.geometry?.dispose();
    const materials = Array.isArray(drawable.material) ? drawable.material : drawable.material ? [drawable.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
  scene.clear();
}
