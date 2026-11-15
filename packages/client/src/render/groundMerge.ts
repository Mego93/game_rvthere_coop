import type { Box, GroundBox, Surface } from '@lodgy/shared';
import * as THREE from 'three';

export const TEXTURE_METRES_PER_REPEAT = 4;

export interface MergedBoxes {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export function groupBySurface(ground: readonly GroundBox[]): Partial<Record<Surface, GroundBox[]>> {
  const groups: Partial<Record<Surface, GroundBox[]>> = {};
  for (const box of ground) (groups[box.surface] ??= []).push(box);
  return groups;
}

const AXES = ['x', 'y', 'z'] as const;

// One world-space geometry for many boxes. Uvs are planar in world metres (top faces by x,z; sides by whichever
// axis the face looks along) so neighbouring boxes of one surface share a continuous texture.
export function mergeBoxes(boxes: readonly Box[], metresPerRepeat = TEXTURE_METRES_PER_REPEAT, bottom = false): MergedBoxes | null {
  if (boxes.length === 0) return null;
  const faces = bottom ? 6 : 5;
  const positions = new Float32Array(boxes.length * faces * 12);
  const normals = new Float32Array(boxes.length * faces * 12);
  const uvs = new Float32Array(boxes.length * faces * 8);
  const indices = new Uint32Array(boxes.length * faces * 6);
  const quat = new THREE.Quaternion();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let vertex = 0;
  let index = 0;
  for (const box of boxes) {
    quat.set(box.rot.x, box.rot.y, box.rot.z, box.rot.w);
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [1, -1]) {
        if (!bottom && axis === 1 && sign === -1) continue;
        const b = (axis + 1) % 3;
        const c = (axis + 2) % 3;
        normal.set(0, 0, 0).setComponent(axis, sign).applyQuaternion(quat);
        const around = Math.abs(normal.y) >= Math.abs(normal.x) && Math.abs(normal.y) >= Math.abs(normal.z) ? 'top' : Math.abs(normal.x) >= Math.abs(normal.z) ? 'x' : 'z';
        // Counter-clockwise seen from outside: b x c points along +axis.
        const corners = sign === 1 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : [[-1, -1], [-1, 1], [1, 1], [1, -1]];
        const first = vertex;
        for (const [cb, cc] of corners as [number, number][]) {
          point.set(0, 0, 0).setComponent(axis, sign * box.halfExtents[AXES[axis]!]);
          point.setComponent(b, cb * box.halfExtents[AXES[b]!]).setComponent(c, cc * box.halfExtents[AXES[c]!]);
          point.applyQuaternion(quat);
          const x = point.x + box.center.x;
          const y = point.y + box.center.y;
          const z = point.z + box.center.z;
          positions.set([x, y, z], vertex * 3);
          normals.set([normal.x, normal.y, normal.z], vertex * 3);
          const [u, v] = around === 'top' ? [x, z] : around === 'x' ? [z, y] : [x, y];
          uvs.set([u / metresPerRepeat, v / metresPerRepeat], vertex * 2);
          vertex++;
        }
        indices.set([first, first + 1, first + 2, first, first + 2, first + 3], index);
        index += 6;
      }
    }
  }
  return { positions, normals, uvs, indices };
}

export function toGeometry(merged: MergedBoxes): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(merged.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(merged.indices, 1));
  return geometry;
}
