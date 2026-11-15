import * as THREE from 'three';

const owned = (resource: { userData: Record<string, unknown> }) => resource.userData.shared !== true;

// Frees the GPU resources of everything in the scene and empties it; the renderer and resources flagged shared stay.
export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (drawable.geometry && owned(drawable.geometry)) drawable.geometry.dispose();
    const materials = Array.isArray(drawable.material) ? drawable.material : drawable.material ? [drawable.material] : [];
    for (const material of materials) {
      if (!owned(material)) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && owned(value)) value.dispose();
      }
      material.dispose();
    }
  });
  scene.clear();
}
