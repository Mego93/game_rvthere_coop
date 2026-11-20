import { BRIDGE_ABUTMENT, CORRIDOR_OUTER, WATER_DEPTH_BELOW_ROAD, routeFrame, type BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import type { SceneOptions } from './groundTextures';

export interface WaterPlane {
  // Centre of the plane.
  x: number;
  y: number;
  z: number;
  // Turn about the vertical axis that puts the plane's long side along the road.
  yaw: number;
  length: number;
  width: number;
}

// Across the ravine; the land beyond rises over the plane's edges, so it only needs to be wide enough to fill the cut.
export const WATER_WIDTH = 2 * CORRIDOR_OUTER;

// One plane under each ravine span, between the abutments, WATER_DEPTH_BELOW_ROAD under the approach deck.
export function waterPlanes(course: BuiltCourse): WaterPlane[] {
  if (course.ravines.length === 0) return [];
  const frame = routeFrame(course);
  return course.ravines.flatMap((span) => {
    const from = span.from + BRIDGE_ABUTMENT;
    const to = span.to - BRIDGE_ABUTMENT;
    if (to <= from) return [];
    const a = frame.pointAt(from);
    const b = frame.pointAt(to);
    const middle = frame.pointAt((from + to) / 2);
    // The deck at the abutment, not in the middle, where a broken bridge dips.
    const deck = frame.heightAtAlong(from + 1);
    return [{ x: middle.x, y: deck - WATER_DEPTH_BELOW_ROAD, z: middle.z, yaw: Math.atan2(-(b.z - a.z), b.x - a.x), length: to - from, width: WATER_WIDTH }];
  });
}

const WATER_COLOUR = 0x2f6f8f;
const SCROLL_SPEED = 0.012;

// A small tiling normal map from layered sines, so the water needs no file.
function rippleNormals(): THREE.DataTexture {
  const size = 64;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      heights[y * size + x] = Math.sin(u * 2 + Math.sin(v * 3)) * 0.5 + Math.sin(v * 3 + u) * 0.3 + Math.sin(u * 5 - v * 2) * 0.2;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
      const length = Math.hypot(dx, dy, 1);
      data.set([Math.round(((-dx / length) * 0.5 + 0.5) * 255), Math.round(((-dy / length) * 0.5 + 0.5) * 255), Math.round(((1 / length) * 0.5 + 0.5) * 255), 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// The water: translucent, with a slowly scrolling normal. Phones (lite) get a flat colour with no sky reflection and no normal map.
export function createWaterMeshes(course: BuiltCourse, { lite = false, flat = false }: SceneOptions = {}): THREE.Group {
  const group = new THREE.Group();
  const planes = waterPlanes(course);
  if (planes.length === 0) return group;
  const normals = lite || flat ? null : rippleNormals();
  const material = new THREE.MeshStandardMaterial({
    color: WATER_COLOUR,
    transparent: true,
    opacity: 0.72,
    roughness: lite || flat ? 1 : 0.12,
    metalness: 0,
    envMapIntensity: lite || flat ? 0 : 1,
    depthWrite: false,
    normalMap: normals,
  });
  for (const plane of planes) {
    const geometry = new THREE.PlaneGeometry(plane.length, plane.width);
    // The ripples repeat every 6 m on every plane.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * plane.length) / 6, (uv.getY(i) * plane.width) / 6);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, plane.yaw, 0);
    mesh.position.set(plane.x, plane.y, plane.z);
    mesh.renderOrder = 1;
    if (normals) {
      mesh.onBeforeRender = () => {
        normals.offset.set((performance.now() * SCROLL_SPEED) % 1, (performance.now() * SCROLL_SPEED * 0.6) % 1);
      };
    }
    group.add(mesh);
  }
  return group;
}
