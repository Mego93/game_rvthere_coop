import { CHARACTER_IDS, CHARACTER_NAMES, PLAYER_COLOURS, defaultAppearance, type Box, type BuiltCourse, type CharacterId, type Spot, type Vec3 } from '@lodgy/shared';
import * as THREE from 'three';
import { SPOT_LABELS, markerShown } from '../ui/story/spots';
import { mergeBoxes, toGeometry } from './groundMerge';
import type { SceneOptions } from './groundTextures';
import { fitted, hasModel, instantiate, shadowed, type FitSize } from './models';
import { createPlayerMesh, disposePlayerMesh } from './playerMesh';
import { applySeatedPose, SEAT_DROP } from './seatedPose';
import { DESK, OLIVES, OLIVE_TINT, PALMS, PLACEMENTS, VILLA_COURT, VILLA_GYM, VILLA_HOUSE, VILLA_POOL, VILLA_WATER_Y, seatFor } from './villaLayout';
import { createPoolWater } from './water';

export interface VillaScene {
  group: THREE.Group;
  // Moves the markers' visibility, bobs them, and seats the absent friends on the couch.
  update(args: { feet: Vec3 | null; absent: readonly CharacterId[]; now: number; night: boolean }): void;
  dispose(): void;
}

const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

const LAWN = 0x6f9b4b;
const POOL_TILE = 0x5fc0d2;
const HOUSE_FLOOR = 0xe9dcc3;
const TERRACE_STONE = 0xd2bb92;
const COURT_BASE = 0x3f7c8f;
const GYM_FLOOR = 0x8a8c92;
const GATE_PATH = 0xcdb999;
const WALL = 0xf0e6d2;
const FENCE = 0xd8b890;

type Region = { x0: number; x1: number; z0: number; z1: number };
const within = (box: Box, region: Region) => box.center.x >= region.x0 && box.center.x <= region.x1 && box.center.z >= region.z0 && box.center.z <= region.z1;

// The colour of a ground box by where it is.
export function groundColour(box: Box): number {
  const top = box.center.y + box.halfExtents.y;
  if (top < -0.01) return POOL_TILE;
  if (within(box, VILLA_COURT)) return COURT_BASE;
  if (within(box, VILLA_GYM)) return GYM_FLOOR;
  if (Math.abs(top - 0.1) < 0.01) return TERRACE_STONE;
  if (Math.abs(top - 0.05) < 0.01 && within(box, VILLA_HOUSE)) return HOUSE_FLOOR;
  return LAWN;
}

function modelAt(key: string, x: number, y: number, z: number, size: FitSize, yaw: number): THREE.Group | null {
  if (!hasModel(key)) return null;
  const model = instantiate(key);
  if (!model) return null;
  const root = fitted(model, size, yaw);
  root.position.set(x, y, z);
  return shadowed(root);
}

// The parasol file holds a pair; one is kept.
function singleParasol(x: number, y: number, z: number, size: FitSize): THREE.Group | null {
  if (!hasModel('villa.parasol')) return null;
  const model = instantiate('villa.parasol');
  if (!model) return null;
  for (const name of ['Sphere.002', 'Sphere.003']) model.getObjectByName(name)?.removeFromParent();
  const root = fitted(model, size);
  root.position.set(x, y, z);
  return shadowed(root);
}

const tintedMaterials = new Map<THREE.Material, THREE.Material>();
// The broadleaf's materials, grey-green; each is copied once and the copy shared by every olive.
function oliveTinted(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material): THREE.Material => {
      let next = tintedMaterials.get(material);
      if (!next) {
        next = material.clone();
        (next as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(OLIVE_TINT));
        next.userData.shared = true;
        tintedMaterials.set(material, next);
      }
      return next;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

const markerTextures = new Map<string, THREE.CanvasTexture>();
function markerTexture(label: string): THREE.CanvasTexture {
  let texture = markerTextures.get(label);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 80;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(20, 16, 12, 0.78)';
    context.strokeStyle = '#f2a541';
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(6, 6, 180, 54, 27);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(84, 60);
    context.lineTo(96, 74);
    context.lineTo(108, 60);
    context.fillStyle = '#f2a541';
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '700 30px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 96, 34, 160);
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.shared = true;
  markerTextures.set(label, texture);
  return texture;
}

export function createVillaScene(course: BuiltCourse, options: SceneOptions & { weekday?: boolean } = {}): VillaScene {
  const group = new THREE.Group();

  // The ground in a few flat colours by place; the pool floor is tiled aqua.
  const byColour = new Map<number, Box[]>();
  for (const box of course.ground) {
    const colour = groundColour(box);
    byColour.set(colour, [...(byColour.get(colour) ?? []), box]);
  }
  for (const [colour, boxes] of byColour) {
    const merged = mergeBoxes(boxes, undefined, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(toGeometry(merged), solid(colour));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // The gate path: the road from the Lodgy to the front door.
  const path = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, 34), solid(GATE_PATH));
  path.position.set(0, 0.02, 14);
  path.receiveShadow = true;
  group.add(path);

  // Walls: the house and gym walls whitewashed, the perimeter in warm clay.
  const perimeter = course.walls.filter((box) => Math.abs(box.center.x) >= 39.8 || box.center.z <= -29.8 || box.center.z >= 39.8 || Math.abs(box.center.z - 30) < 0.01);
  const houseWalls = course.walls.filter((box) => !perimeter.includes(box));
  for (const [boxes, colour] of [[houseWalls, WALL], [perimeter, FENCE]] as const) {
    const merged = mergeBoxes(boxes, undefined, true);
    if (!merged) continue;
    const mesh = new THREE.Mesh(toGeometry(merged), solid(colour));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The desk the laptops stand on.
  const desk = new THREE.Mesh(new THREE.BoxGeometry(DESK.halfX * 2, 0.06, DESK.halfZ * 2), solid(0x8a6240));
  desk.position.set(DESK.x, DESK.y + DESK.top - 0.03, DESK.z);
  desk.castShadow = true;
  group.add(desk);
  // The cold plunge in the gym pavilion.
  const plunge = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 2), solid(0x6fc9dc, 0.3));
  plunge.position.set(31, 0.4 + 0.05, 20);
  group.add(plunge);

  // The pool's water, a little under the lip.
  group.add(createPoolWater({ x0: VILLA_POOL.x0, x1: VILLA_POOL.x1, z0: VILLA_POOL.z0, z1: VILLA_POOL.z1, y: VILLA_WATER_Y }, options));

  for (const placement of PLACEMENTS) {
    const model = placement.key === 'villa.parasol' ? singleParasol(placement.x, placement.y, placement.z, placement.size) : modelAt(placement.key, placement.x, placement.y, placement.z, placement.size, placement.yaw);
    if (model) group.add(model);
  }
  for (const olive of OLIVES) {
    const tree = modelAt('decor.broadleaf', olive.x, 0, olive.z, { y: olive.size }, (olive.x * 7 + olive.z * 3) % 6);
    if (!tree) continue;
    oliveTinted(tree);
    group.add(tree);
  }
  for (const palm of PALMS) {
    const tree = modelAt(palm.key, palm.x, 0, palm.z, {}, palm.x + palm.z);
    if (tree) group.add(tree);
  }

  // Spot markers: a pill with the spot's job above it, shown within range.
  const markers: { spot: Spot; sprite: THREE.Sprite }[] = [];
  for (const spot of course.spots ?? []) {
    if (spot.kind === 'couch') continue;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(SPOT_LABELS[spot.kind]), transparent: true, depthWrite: false }));
    sprite.scale.set(1.2, 0.5, 1);
    sprite.center.set(0.5, 0);
    sprite.position.set(spot.pos.x, spot.pos.y + (spot.kind === 'laptop' ? 1.3 : 2.1), spot.pos.z);
    sprite.visible = false;
    sprite.name = `marker-${spot.id}`;
    group.add(sprite);
    markers.push({ spot, sprite });
  }

  // Friends nobody plays sit on the couch with a laptop on their knees.
  const absentFigures = new Map<CharacterId, THREE.Group>();
  const seat = (id: CharacterId, index: number) => {
    const colour = PLAYER_COLOURS[index % PLAYER_COLOURS.length]!;
    const figure = createPlayerMesh(CHARACTER_NAMES[id], colour, defaultAppearance(id));
    applySeatedPose(figure);
    const place = seatFor(id, CHARACTER_IDS);
    figure.position.set(place.x, place.y + SEAT_DROP, place.z);
    // The figures face south, into the room.
    figure.rotation.set(0, Math.PI, 0);
    const laptop = modelAt('villa.laptop', 0, 0.62, -0.42, { x: 0.34, y: 0.23, z: 0.32 }, Math.PI);
    if (laptop) figure.add(laptop);
    return figure;
  };

  return {
    group,
    update({ feet, absent, now }) {
      for (const { spot, sprite } of markers) {
        const shown = markerShown(spot, feet);
        sprite.visible = shown;
        if (shown) sprite.position.y = spot.pos.y + (spot.kind === 'laptop' ? 1.3 : 2.1) + Math.sin(now * 3 + spot.pos.x) * 0.05;
      }
      for (const [id, figure] of absentFigures) {
        if (absent.includes(id)) continue;
        group.remove(figure);
        disposePlayerMesh(figure);
        absentFigures.delete(id);
      }
      for (const id of absent) {
        if (absentFigures.has(id)) continue;
        const figure = seat(id, CHARACTER_IDS.indexOf(id));
        absentFigures.set(id, figure);
        group.add(figure);
      }
    },
    dispose() {
      for (const figure of absentFigures.values()) disposePlayerMesh(figure);
      absentFigures.clear();
    },
  };
}
