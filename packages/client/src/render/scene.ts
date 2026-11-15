import { ANCHOR_HEIGHT, ROAD_WIDTH, SHOP_COUNTER_HALF, STOP_POST_HEIGHT, type Box, type BuiltCourse, type ServiceStop, type Surface } from '@lodgy/shared';
import * as THREE from 'three';
import { fitted, hasModel, instantiate, shadowed, type FitSize } from './models';
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

// A shared model fitted to a box and set on the ground at x, y, z; null when the model did not load.
function modelAt(key: string, x: number, y: number, z: number, size: FitSize, yaw = 0): THREE.Group | null {
  if (!hasModel(key)) return null;
  const model = instantiate(key);
  if (!model) return null;
  const root = fitted(model, size, yaw);
  root.position.set(x, y, z);
  return shadowed(root);
}

// Metres from the road edge to the front of a stop's building; the stop's pad ends 8 m out and the building stands on the shoulder.
const STOP_BUILDING_GAP = 8;
const STOP_BUILDING = { width: 8, height: 5.5, depth: 4.5 };

// The building, awning and parasol of a stop, in the zone's frame: x across the road (outwards), z along it. Purely visual.
function stopScenery(stop: ServiceStop): THREE.Group | null {
  const key = stop.kind === 'fuel' ? 'stop.fuel' : 'stop.garage';
  const zone = stop.zone;
  const rot = new THREE.Quaternion(zone.rot.x, zone.rot.y, zone.rot.z, zone.rot.w);
  const outward = new THREE.Vector3(stop.operatePoint.x - zone.center.x, 0, stop.operatePoint.z - zone.center.z).applyQuaternion(rot.clone().invert());
  const side = outward.x < 0 ? -1 : 1;
  // Zone centre to the building's centre: the zone sits 0.5 m off the road and 2.5 m wide, the pad ends at 8 m, then the building's depth.
  const roadToZoneCentre = ROAD_WIDTH / 2 + 0.5 + zone.halfExtents.x;
  const centre = (ROAD_WIDTH / 2 + STOP_BUILDING_GAP + STOP_BUILDING.depth / 2) - roadToZoneCentre;
  const ground = stop.operatePoint.y;
  const facing = -side * Math.PI / 2;
  const group = new THREE.Group();
  const building = modelAt(key, side * centre, 0, 0, { x: STOP_BUILDING.depth, y: STOP_BUILDING.height, z: STOP_BUILDING.width }, facing);
  if (!building) return null;
  group.add(building);
  const frontX = side * (centre - STOP_BUILDING.depth / 2);
  const awning = modelAt('stop.awning', frontX - side * 0.5, 2.6, 0, { x: 1.2, y: 1.2, z: 6 }, facing);
  if (awning) group.add(awning);
  const parasol = modelAt('stop.parasol', frontX - side * 1.5, 0, zone.halfExtents.z + 1.5, { y: 2.6 });
  if (parasol) group.add(parasol);
  group.position.set(zone.center.x, ground, zone.center.z);
  group.quaternion.copy(rot);
  return group;
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
    const scenery = stopScenery(stop);
    if (scenery) scene.add(scenery);
    if (stop.shopCounter) {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(SHOP_COUNTER_HALF.x * 2, SHOP_COUNTER_HALF.y * 2, SHOP_COUNTER_HALF.z * 2), solid(0xf97316));
      counter.position.set(stop.shopCounter.x, stop.shopCounter.y + SHOP_COUNTER_HALF.y, stop.shopCounter.z);
      scene.add(counter);
    }
  }

  for (const anchor of course.anchors) {
    const { x, y, z } = anchor.pose.pos;
    const quarter = new THREE.Quaternion(anchor.pose.rot.x, anchor.pose.rot.y, anchor.pose.rot.z, anchor.pose.rot.w);
    const yaw = new THREE.Euler().setFromQuaternion(quarter, 'YXZ').y;
    const modelled =
      anchor.kind === 'palm' ? modelAt('anchor.palm', x, y, z, { y: 5 }, yaw)
      : anchor.kind === 'boulder' ? modelAt('anchor.boulder', x, y, z, { x: 1.6, y: 1.2, z: 1.4 }, yaw)
      : anchor.kind === 'milestone' ? modelAt('anchor.milestone', x, y, z, { y: 1.2 }, yaw)
      : null;
    if (modelled) {
      scene.add(modelled);
      continue;
    }
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
