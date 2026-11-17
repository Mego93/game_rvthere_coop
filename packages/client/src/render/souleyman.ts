import { CHARACTER_SCALE, ROAD_WIDTH, yawOf, type Checkpoint } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cached, colourMaterial, dressFace, merged } from './characterRig';
import { hasModel, instantiate, shadowed } from './models';

export const SOULEYMAN_LATERAL = ROAD_WIDTH / 2 + 1.5;
// Four looks on the game's own blocky character, one per checkpoint by index % SOULEYMAN_LOOKS.
export const SOULEYMAN_LOOKS = 4;

type Spot = { x: number; z: number; y: number; yaw: number; variant?: number };
type Box = readonly [number, number, number, number, number, number];

const ROBE = 0xd8c8a8;
const HOOD = 0x8a6a45;
const TURBAN = 0x2f5f8f;
const SKIN = 0x9a6b4a;
const BEARD = 0x2a2420;

const flat = (colour: number) => new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 1, metalness: 0 });

function part(name: string, w: number, h: number, d: number, material: THREE.Material, x: number, bottom: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, bottom + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A blocky man in a hooded djellaba and a turban, feet at the origin, facing -z, 1.8 m before CHARACTER_SCALE.
function proceduralFigure(): THREE.Group {
  const robe = flat(ROBE);
  const hood = flat(HOOD);
  const turban = flat(TURBAN);
  const skin = flat(SKIN);
  const beard = flat(BEARD);
  const group = new THREE.Group();
  group.name = 'souleyman';
  group.add(part('robe', 0.56, 1.2, 0.36, robe, 0, 0, 0));
  for (const side of [-1, 1]) group.add(part('arm', 0.12, 0.7, 0.16, robe, side * 0.34, 0.45, 0));
  group.add(part('hood', 0.44, 0.4, 0.44, hood, 0, 1.2, 0.03));
  group.add(part('face', 0.26, 0.24, 0.1, skin, 0, 1.3, -0.2));
  group.add(part('beard', 0.22, 0.16, 0.08, beard, 0, 1.2, -0.23));
  group.add(part('turban', 0.5, 0.2, 0.5, turban, 0, 1.6, 0.02));
  group.scale.setScalar(CHARACTER_SCALE);
  return group;
}

const SKIN_HEX = '#9a6b4a';
const BEARD_HEX = '#2a2420';

interface Look {
  robe: string;
  // Vertical stripes on the front and back of the robe.
  stripe?: string;
  head: 'hood' | 'turban' | 'fez' | 'headdress';
  beard: string;
}

const LOOKS: readonly Look[] = [
  { robe: '#6e4b2a', head: 'hood', beard: BEARD_HEX },
  { robe: '#f0ece0', head: 'turban', beard: BEARD_HEX },
  { robe: '#d9c9a3', stripe: '#7d5a3a', head: 'fez', beard: BEARD_HEX },
  { robe: '#8b7a55', head: 'headdress', beard: BEARD_HEX },
];

const HOOD_COLOUR = '#4f341d';
const TURBAN_COLOUR = '#f6f3ea';
const FEZ_COLOUR = '#a8322d';

// Metres, in the model's own frame: the robe hangs from the shoulders over the legs (legs 0 to 0.53, torso 0.53 to 1.01, shoulders 0.43 apart).
// Box tuples hold the centre, not the bottom.
const ROBE_BOX: Box = [0.56, 0.78, 0.4, 0, 0.46, 0];
const CUFF_BOX: Box = [0.2, 0.1, 0.22, 0, 0.38, -0.054];
// Head-local units: a tenth of the model's, the head box x and z within 4, y 0..8, the face on +Z.
const HOOD_BOXES: readonly Box[] = [[10, 9, 2, 0, 4.5, -4.6], [1.6, 9, 9.6, 4.8, 4.5, -0.4], [1.6, 9, 9.6, -4.8, 4.5, -0.4], [10, 1.6, 10, 0, 8.8, -0.4]];
const TURBAN_BOXES: readonly Box[] = [[9.6, 2.2, 9.6, 0, 8.6, 0], [8.4, 2.0, 8.4, 0, 10.5, 0], [5.0, 1.6, 5.0, 0, 12.0, 0]];

const mesh = (name: string, geometry: THREE.BufferGeometry, colour: string, box?: Box): THREE.Mesh => {
  const part = new THREE.Mesh(geometry, colourMaterial(colour));
  part.name = name;
  if (box) {
    part.scale.set(box[0], box[1], box[2]);
    part.position.set(box[3], box[4], box[5]);
  }
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
};

const unit = () => cached('unit', () => new THREE.BoxGeometry(1, 1, 1));

// The headdress model over the head: its rim at the forehead, the opening on the face and the cloth falling to the neck, in the head's local units.
function headdress(head: THREE.Object3D, root: THREE.Object3D): THREE.Object3D | null {
  if (!hasModel('souleyman.headdress')) return null;
  const model = instantiate('souleyman.headdress');
  if (!model) return null;
  root.updateMatrixWorld(true);
  const unitsPerMetre = 1 / new THREE.Vector3().setFromMatrixScale(head.matrixWorld).x;
  const wrapper = new THREE.Group();
  wrapper.name = 'headdress';
  wrapper.add(model);
  wrapper.scale.setScalar(unitsPerMetre);
  // The file's opening is at -z; the head's face is at +z.
  wrapper.rotation.y = Math.PI;
  wrapper.position.set(0, -4, 0);
  shadowed(wrapper);
  return wrapper;
}

// One figure of the game's character in a look, feet at the origin, facing -z, 1.8 m before CHARACTER_SCALE; null when the model did not load.
function modelFigure(variant: number): THREE.Group | null {
  if (!hasModel('character.player')) return null;
  const model = instantiate('character.player');
  if (!model) return null;
  const look = LOOKS[variant % SOULEYMAN_LOOKS]!;
  shadowed(model);
  const node = (name: string) => model.getObjectByName(name) as THREE.Mesh | undefined;
  for (const name of ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right']) {
    const part = node(name);
    if (part) part.material = colourMaterial(look.robe);
  }
  const head = node('head');
  dressFace(head, SKIN_HEX, look.beard);
  const group = new THREE.Group();
  group.name = 'souleyman';
  group.add(model);
  // The file's front is +Z; he faces -Z.
  model.rotation.y = Math.PI;
  group.add(mesh('robe', unit(), look.robe, ROBE_BOX));
  for (const side of [-1, 1]) group.add(mesh('hand', unit(), SKIN_HEX, [CUFF_BOX[0], CUFF_BOX[1], CUFF_BOX[2], side * 0.32, CUFF_BOX[4], CUFF_BOX[5]]));
  if (look.stripe) {
    for (const x of [-0.2, -0.07, 0.07, 0.2]) {
      group.add(mesh('stripe', unit(), look.stripe, [0.045, 0.74, 0.41, x, 0.46, 0]));
    }
  }
  if (head) {
    if (look.head === 'hood') {
      head.add(mesh('hood', merged('souleyman-hood', HOOD_BOXES, () => [new THREE.ConeGeometry(5.2, 7, 4).rotateY(Math.PI / 4).translate(0, 12.2, -0.4)]), HOOD_COLOUR));
    } else if (look.head === 'turban') {
      head.add(mesh('turban', merged('souleyman-turban', TURBAN_BOXES), TURBAN_COLOUR));
    } else if (look.head === 'fez') {
      head.add(mesh('fez', cached('souleyman-fez', () => new THREE.CylinderGeometry(2.9, 4.0, 2.5, 8).translate(0, 9.25, 0)), FEZ_COLOUR));
    } else {
      const cloth = headdress(head, group);
      if (cloth) head.add(cloth);
    }
  }
  return group;
}

// A blocky man of the given look (the game's character in a djellaba, or the procedural figure when that model did not load).
export function createSouleymanMesh(variant = 0): THREE.Group {
  return modelFigure(variant) ?? proceduralFigure();
}

// Right of each checkpoint's spawn heading, facing back across the road. Reads only the spawn pose; the look is the checkpoint's index % SOULEYMAN_LOOKS.
export function souleymanPlacements(checkpoints: readonly Checkpoint[]): Required<Spot>[] {
  // Checkpoint spawns sit on the road centre line.
  return checkpoints.map(({ spawn }, index) => {
    const yaw = yawOf(spawn.rot);
    return {
      x: spawn.pos.x + Math.cos(yaw) * SOULEYMAN_LATERAL,
      z: spawn.pos.z - Math.sin(yaw) * SOULEYMAN_LATERAL,
      y: spawn.pos.y,
      yaw: yaw + Math.PI / 2,
      variant: index % SOULEYMAN_LOOKS,
    };
  });
}

// Pieces that share a material may come from the model (with tangents) and from boxes (without): only the shared attributes are merged.
function mergeable(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const common = Object.keys(geometries[0]!.attributes).filter((name) => geometries.every((geometry) => geometry.hasAttribute(name)));
  for (const geometry of geometries) for (const name of Object.keys(geometry.attributes)) if (!common.includes(name)) geometry.deleteAttribute(name);
  return geometries;
}

// One figure baked at every spot into one mesh per material.
function mergeFigures(proto: THREE.Group, spots: readonly Spot[]): THREE.Mesh[] {
  proto.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  proto.traverse((object) => {
    const piece = object as THREE.Mesh;
    if (!piece.isMesh) return;
    byMaterial.set(piece.material as THREE.Material, [...(byMaterial.get(piece.material as THREE.Material) ?? []), piece]);
  });
  const place = new THREE.Matrix4();
  const meshes: THREE.Mesh[] = [];
  for (const [material, pieces] of byMaterial) {
    const geometries: THREE.BufferGeometry[] = [];
    for (const spot of spots) {
      place.compose(new THREE.Vector3(spot.x, spot.y, spot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw), new THREE.Vector3(1, 1, 1));
      for (const piece of pieces) geometries.push(piece.geometry.clone().applyMatrix4(place.clone().multiply(piece.matrixWorld)));
    }
    const merged = mergeGeometries(mergeable(geometries))!;
    for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'souleyman';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  for (const pieces of byMaterial.values()) for (const piece of pieces) if (piece.geometry.userData.shared !== true) piece.geometry.dispose();
  return meshes;
}

// All placements baked into one mesh per material and look (named 'souleyman'), so the draw calls do not grow with the checkpoint count.
export function createSouleymanMeshes(placements: readonly Spot[]): THREE.Mesh[] {
  if (placements.length === 0) return [];
  // The procedural figure has one look.
  const looks = hasModel('character.player') ? SOULEYMAN_LOOKS : 1;
  const byLook = new Map<number, Spot[]>();
  for (const spot of placements) {
    const look = (spot.variant ?? 0) % looks;
    byLook.set(look, [...(byLook.get(look) ?? []), spot]);
  }
  return [...byLook].flatMap(([look, spots]) => mergeFigures(createSouleymanMesh(look), spots));
}
