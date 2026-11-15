import { ANCHOR_HEIGHT, SHOP_COUNTER_HALF, STOP_POST_HEIGHT, type Box, type BuiltCourse, type Surface } from '@lodgy/shared';
import * as THREE from 'three';
import { groupBySurface, mergeBoxes, toGeometry } from './groundMerge';
import { groundTexture, SURFACE_TEXTURE, type SceneOptions } from './groundTextures';
import { createTerrainMesh } from './terrain';

const SURFACE_COLOURS: Record<Surface, number> = {
  road: 0x8a7f72,
  gravel: 0xa39a8c,
  riverbed: 0x7d8a8f,
  sand: 0xd9b77a,
};

function boxMesh(box: Box, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2),
    material,
  );
  mesh.position.set(box.center.x, box.center.y, box.center.z);
  mesh.quaternion.set(box.rot.x, box.rot.y, box.rot.z, box.rot.w);
  mesh.receiveShadow = true;
  return mesh;
}

const solid = (colour: number) => new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 1, metalness: 0 });
const ghost = (colour: number) =>
  new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, depthWrite: false });

// A surface with its texture, or its flat colour when the texture did not load.
function groundMaterial(surface: Surface, { lite = false, flat = false }: SceneOptions): THREE.MeshStandardMaterial {
  const set = SURFACE_TEXTURE[surface];
  const map = flat ? null : groundTexture(set, 'diffuse');
  if (!map) return new THREE.MeshStandardMaterial({ color: SURFACE_COLOURS[surface], roughness: 1, metalness: 0 });
  map.anisotropy = lite ? 1 : 4;
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map, normalMap: lite ? null : groundTexture(set, 'normal'), roughness: 1, metalness: 0 });
}

function mergedMesh(boxes: readonly Box[], material: THREE.Material, bottom: boolean): THREE.Mesh | null {
  const merged = mergeBoxes(boxes, undefined, bottom);
  if (!merged) return null;
  const mesh = new THREE.Mesh(toGeometry(merged), material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createScene(course: BuiltCourse, options: SceneOptions = {}): THREE.Scene {
  const scene = new THREE.Scene();
  const groups = groupBySurface(course.ground);
  for (const surface of Object.keys(groups) as Surface[]) {
    const mesh = mergedMesh(groups[surface]!, groundMaterial(surface, options), false);
    if (mesh) scene.add(mesh);
  }
  const walls = mergedMesh(course.walls, solid(0xc98a5a), true);
  if (walls) scene.add(walls);
  scene.add(createTerrainMesh(course, options));
  for (const checkpoint of course.checkpoints) scene.add(boxMesh(checkpoint.trigger, ghost(0x3b82f6)));
  scene.add(boxMesh(course.finish, ghost(0x22c55e)));

  for (const water of course.decor) {
    if (water.kind !== 'water' || !water.size) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(water.size.x * 2, water.size.y * 2, water.size.z * 2),
      new THREE.MeshBasicMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.position.set(water.pose.pos.x, water.pose.pos.y, water.pose.pos.z);
    mesh.quaternion.set(water.pose.rot.x, water.pose.rot.y, water.pose.rot.z, water.pose.rot.w);
    scene.add(mesh);
  }

  for (const stop of course.stops) {
    scene.add(boxMesh(stop.zone, ghost(stop.kind === 'fuel' ? 0xf97316 : 0x3b82f6)));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, STOP_POST_HEIGHT, 0.3), solid(stop.kind === 'fuel' ? 0xf97316 : 0x3b82f6));
    post.position.set(stop.operatePoint.x, stop.operatePoint.y + STOP_POST_HEIGHT / 2, stop.operatePoint.z);
    scene.add(post);
    if (stop.shopCounter) {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(SHOP_COUNTER_HALF.x * 2, SHOP_COUNTER_HALF.y * 2, SHOP_COUNTER_HALF.z * 2), solid(0xf97316));
      counter.position.set(stop.shopCounter.x, stop.shopCounter.y + SHOP_COUNTER_HALF.y, stop.shopCounter.z);
      scene.add(counter);
    }
  }

  for (const anchor of course.anchors) {
    const { x, y, z } = anchor.pose.pos;
    if (anchor.kind === 'palm') {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), solid(0x7a5230));
      trunk.position.set(x, y + 1.2, z);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), solid(0x3f8f3f));
      crown.position.set(x, y + 2.6, z);
      scene.add(trunk, crown);
      continue;
    }
    if (anchor.kind === 'boulder') {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), solid(0x808080));
      rock.position.set(x, y + 0.6, z);
      rock.quaternion.set(anchor.pose.rot.x, anchor.pose.rot.y, anchor.pose.rot.z, anchor.pose.rot.w);
      scene.add(rock);
      continue;
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), solid(0xf59e0b));
    post.position.set(anchor.pose.pos.x, anchor.pose.pos.y + 0.6, anchor.pose.pos.z);
    scene.add(post);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), solid(0xf2f2f2));
    band.position.set(anchor.pose.pos.x, anchor.pose.pos.y + ANCHOR_HEIGHT, anchor.pose.pos.z);
    scene.add(band);
  }
  return scene;
}
