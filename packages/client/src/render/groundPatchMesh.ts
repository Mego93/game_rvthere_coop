import type { BuiltCourse, GroundPatch, Surface } from '@lodgy/shared';
import * as THREE from 'three';
import { TEXTURE_METRES_PER_REPEAT } from './groundMerge';

function patchGeometry(patch: GroundPatch): THREE.BufferGeometry {
  const { cell, cols, rows, heights } = patch;
  const stride = cols + 1;
  const positions = new Float32Array(heights.length * 3);
  const uvs = new Float32Array(heights.length * 2);
  for (let zi = 0; zi <= rows; zi++) {
    for (let xi = 0; xi <= cols; xi++) {
      const v = zi * stride + xi;
      const x = patch.x0 + xi * cell;
      const z = patch.z0 + zi * cell;
      positions.set([x, heights[v]!, z], v * 3);
      uvs.set([x / TEXTURE_METRES_PER_REPEAT, z / TEXTURE_METRES_PER_REPEAT], v * 2);
    }
  }
  // Each cell is split along its (x1, z0)-(x0, z1) diagonal, as Rapier splits it, so the drawn surface is the one stood on; both triangles are counter-clockwise seen from above.
  const indices = new Uint32Array(cols * rows * 6);
  let at = 0;
  for (let zi = 0; zi < rows; zi++) {
    for (let xi = 0; xi < cols; xi++) {
      const v00 = zi * stride + xi;
      const v10 = v00 + 1;
      const v01 = v00 + stride;
      const v11 = v01 + 1;
      indices.set([v00, v01, v10, v11, v10, v01], at);
      at += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// One mesh per walkable heightfield of the course, in the material of its surface.
export function createGroundPatchMeshes(course: BuiltCourse, materialFor: (surface: Surface) => THREE.Material): THREE.Mesh[] {
  return (course.terrain ?? []).map((patch) => {
    const mesh = new THREE.Mesh(patchGeometry(patch), materialFor(patch.surface));
    mesh.receiveShadow = true;
    mesh.name = `ground-patch-${patch.id}`;
    return mesh;
  });
}
