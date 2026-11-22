import type { Box, BuiltCourse, Spot, Vec3 } from '@lodgy/shared';
import * as THREE from 'three';
import { SPOT_LABELS, markerShown } from '../ui/story/spots';
import { CAMELS, CAMP, CUSHION, OUTSIDE, RUG, TABLE, cushions } from './campLayout';
import { mergeBoxes, toGeometry } from './groundMerge';
import type { SceneOptions } from './groundTextures';
import { fitted, hasModel, instantiate, shadowed, type FitSize } from './models';
import { markerTexture } from './villaScene';

export interface CampScene {
  group: THREE.Group;
  // Shows the table's marker within range and bobs it.
  update(args: { feet: Vec3 | null; now: number }): void;
  dispose(): void;
}

const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

const CLOTH = 0xe6d3a8;
const FENCE = 0xb48a5a;
const RUG_RED = 0x9c3b2e;
const RUG_BORDER = 0xd9a441;
const TABLE_COLOUR = 0x5f7a4d;
const CUSHION_COLOUR = 0xc2662d;

function modelAt(key: string, x: number, y: number, z: number, size: FitSize, yaw = 0): THREE.Group | null {
  if (!hasModel(key)) return null;
  const model = instantiate(key);
  if (!model) return null;
  const root = fitted(model, size, yaw);
  root.position.set(x, y, z);
  return shadowed(root);
}

const inTent = (box: Box) => box.center.x >= CAMP.tent.x0 - 0.5 && box.center.x <= CAMP.tent.x1 + 0.5 && box.center.z >= CAMP.tent.z0 - 0.5 && box.center.z <= CAMP.tent.z1 + 0.5;

// The camp: the fence in reed brown, the tent's walls in canvas with the tent model's roof over them, a rug with the low table and six cushions, camels in the corners and palms and rocks beyond the fence. Purely visual; the shared course owns every collision. The parked buggy is the world's vehicle.
export function createCampScene(course: BuiltCourse, _options: SceneOptions = {}): CampScene {
  const group = new THREE.Group();

  const cloth = course.walls.filter(inTent);
  const fence = course.walls.filter((box) => !inTent(box));
  for (const [boxes, colour] of [[cloth, CLOTH], [fence, FENCE]] as const) {
    const merged = mergeBoxes(boxes, undefined, true);
    if (!merged) continue;
    const mesh = new THREE.Mesh(toGeometry(merged), solid(colour));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The tent's roof: the model stretched over the footprint, standing on the walls.
  const width = CAMP.tent.x1 - CAMP.tent.x0 + 0.6;
  const depth = CAMP.tent.z1 - CAMP.tent.z0 + 0.6;
  const roof = modelAt('decor.tent', (CAMP.tent.x0 + CAMP.tent.x1) / 2, CAMP.floor, (CAMP.tent.z0 + CAMP.tent.z1) / 2, { x: width, y: CAMP.wall + 0.5, z: depth });
  if (roof) group.add(roof);

  // The rug, a border and a field, a hair above the tent floor.
  const border = new THREE.Mesh(new THREE.BoxGeometry(RUG.width, 0.02, RUG.depth), solid(RUG_BORDER));
  border.position.set(RUG.x, CAMP.floor + 0.012, RUG.z);
  border.receiveShadow = true;
  const field = new THREE.Mesh(new THREE.BoxGeometry(RUG.width - 0.5, 0.02, RUG.depth - 0.5), solid(RUG_RED));
  field.position.set(RUG.x, CAMP.floor + 0.024, RUG.z);
  field.receiveShadow = true;
  group.add(border, field);

  const rugTop = CAMP.floor + 0.034;
  const table = modelAt('camp.table', TABLE.x, rugTop, TABLE.z, { x: TABLE.diameter, y: TABLE.height, z: TABLE.diameter });
  if (table) group.add(table);
  else {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE.diameter / 2, TABLE.diameter / 2, 0.08, 20), solid(TABLE_COLOUR));
    top.position.set(TABLE.x, rugTop + TABLE.height - 0.04, TABLE.z);
    top.castShadow = true;
    group.add(top);
  }
  for (const cushion of cushions()) {
    const made = modelAt('camp.cushion', cushion.x, rugTop, cushion.z, { x: CUSHION.size, y: CUSHION.thick, z: CUSHION.size }, cushion.yaw);
    if (made) {
      // The file's pad is grey; a warm tint makes it a floor cushion.
      made.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const tinted = (mesh.material as THREE.MeshStandardMaterial).clone();
        tinted.color.multiply(new THREE.Color(CUSHION_COLOUR));
        tinted.userData.shared = false;
        mesh.material = tinted;
      });
      group.add(made);
      continue;
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(CUSHION.size, CUSHION.thick, CUSHION.size), solid(CUSHION_COLOUR));
    pad.position.set(cushion.x, rugTop + CUSHION.thick / 2, cushion.z);
    pad.rotation.y = cushion.yaw;
    group.add(pad);
  }

  for (const camel of CAMELS) {
    const made = modelAt('decor.camel', camel.x, 0, camel.z, { y: camel.height }, camel.yaw);
    if (made) group.add(made);
  }
  for (const item of OUTSIDE) {
    const made = modelAt(item.key, item.x, 0, item.z, { y: item.size }, (item.x * 7 + item.z * 3) % 6);
    if (made) group.add(made);
  }

  // The table's marker: a pill with the job above it, shown within range.
  const spots = (course.spots ?? []).filter((spot) => spot.kind === 'kitchen');
  const markers: { spot: Spot; sprite: THREE.Sprite }[] = [];
  for (const spot of spots) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(SPOT_LABELS[spot.kind]), transparent: true, depthWrite: false }));
    sprite.scale.set(1.2, 0.5, 1);
    sprite.center.set(0.5, 0);
    sprite.position.set(spot.pos.x, spot.pos.y + 1.4, spot.pos.z);
    sprite.visible = false;
    sprite.name = `marker-${spot.id}`;
    group.add(sprite);
    markers.push({ spot, sprite });
  }

  return {
    group,
    update({ feet, now }) {
      for (const { spot, sprite } of markers) {
        sprite.visible = markerShown(spot, feet);
        if (sprite.visible) sprite.position.y = spot.pos.y + 1.4 + Math.sin(now * 3 + spot.pos.x) * 0.05;
      }
    },
    dispose() {},
  };
}
