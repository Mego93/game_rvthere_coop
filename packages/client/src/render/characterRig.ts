import type { Appearance, EyesChoice, SmileChoice } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHARACTER_LOOKS, SKIN_TONES, type HairStyle } from './characterLooks';

const SWEATSHIRT = '#8a8f98';
const SUIT = '#2b2f3a';
const WHITE = '#ffffff';
const TIE = '#14141a';
const ZIP = '#9a9aa2';
const GLASSES = '#101014';
const CAP = '#2f5d8a';
const FEZ = '#a8322d';
const FACE = '#1a1a1f';
const MOUTH = '#2a1616';
const DRAWSTRING = '#8e8e98';

// Added parts are named with this prefix and never reuse a name of the model.
const PREFIX = 'look-';

// [width, height, depth, x, y, z] of a box centred at x, y, z.
type Box = readonly [number, number, number, number, number, number];

// Colour materials and geometries are shared across every figure and never disposed per mesh.
const materials = new Map<string, THREE.MeshStandardMaterial>();
const geometries = new Map<string, THREE.BufferGeometry>();

function shared<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
  resource.userData.shared = true;
  return resource;
}

// The one material of the face parts, which carry their own vertex colours.
function faceMaterial(): THREE.MeshStandardMaterial {
  let material = materials.get('face');
  if (!material) {
    material = shared(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
    materials.set('face', material);
  }
  return material;
}

export function colourMaterial(hex: string): THREE.MeshStandardMaterial {
  let material = materials.get(hex);
  if (!material) {
    material = shared(new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 1, metalness: 0 }));
    materials.set(hex, material);
  }
  return material;
}

export function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = shared(build());
    geometries.set(key, geometry);
  }
  return geometry;
}

export const unitBox = () => cached('unit', () => new THREE.BoxGeometry(1, 1, 1));

export function merged(key: string, boxes: readonly Box[], extra: () => THREE.BufferGeometry[] = () => []): THREE.BufferGeometry {
  return cached(key, () => {
    const pieces = boxes.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    return mergeGeometries([...pieces, ...extra()])!;
  });
}

// Head-local units: 1 unit is a tenth of the model's; the head box is x and z within 4, y 0..8, the face on +Z.
const SLAB = [8.6, 1.2, 8.6, 0, 8.0, 0] as const;
const HAIR: Record<Exclude<HairStyle, 'bald'>, readonly Box[]> = {
  short: [SLAB, [8.6, 3.2, 1.2, 0, 6.0, -3.7], [0.6, 2.8, 5.4, 4.2, 6.0, -1.3], [0.6, 2.8, 5.4, -4.2, 6.0, -1.3]],
  wavy: [[8.6, 1.8, 8.6, 0, 7.9, 0], [8.6, 4.4, 1.4, 0, 5.8, -3.6], [1.0, 3.6, 6.0, 4.15, 5.8, -1.0], [1.0, 3.6, 6.0, -4.15, 5.8, -1.0], [3.0, 1.0, 0.8, -1.5, 7.5, 4.2], [2.6, 0.9, 1.0, 2.5, 8.8, 0.5], [2.0, 0.8, 1.0, -2.5, 8.6, -1.0]],
  swept: [[8.6, 1.4, 8.6, 0, 7.9, 0], [8.6, 3.0, 1.2, 0, 6.0, -3.7], [0.6, 2.4, 5.0, 4.2, 6.2, -1.5], [0.6, 2.4, 5.0, -4.2, 6.2, -1.5], [5.0, 1.4, 1.0, 1.2, 7.4, 4.2], [2.4, 0.9, 0.8, 3.0, 6.9, 4.2]],
  long: [SLAB, [8.6, 8.0, 1.4, 0, 4.0, -3.6], [1.0, 6.5, 5.0, 4.15, 4.75, -1.5], [1.0, 6.5, 5.0, -4.15, 4.75, -1.5]],
};
// The moustache sits above the mouth (y 1.5..2.3) and the beard below it; the chin strip is at most two thirds of the head wide and 2 tall.
export const MOUSTACHE_BOX: Box = [3.6, 0.6, 0.5, 0, 2.85, 4.2];
export const BEARD_BOXES: readonly Box[] = [MOUSTACHE_BOX, [5.0, 1.4, 0.6, 0, 0.7, 4.15], [0.5, 1.4, 2.2, 4.1, 0.7, 2.9], [0.5, 1.4, 2.2, -4.1, 0.7, 2.9]];
const GLASSES_BOXES: readonly Box[] = [[1.4, 0.2, 0.2, 0, 4.0, 4.15], [0.2, 0.2, 4.0, 4.0, 4.0, 2.2], [0.2, 0.2, 4.0, -4.0, 4.0, 2.2]];
const CAP_BOXES: readonly Box[] = [[9.8, 1.6, 9.8, 0, 9.0, 0], [8.0, 0.4, 2.4, 0, 8.5, 5.2]];

// Torso-local units: x within 0.4, y 0.3..1.2, z within 0.3, the front on +Z.
const ZIP_BOX: Box = [0.04, 0.4, 0.03, 0, 1.0, 0.315];
const UNDER_BOX: Box = [0.36, 0.85, 0.03, 0, 0.75, 0.315];
const COLLAR_BOX: Box = [0.34, 0.12, 0.04, 0, 1.14, 0.31];
const HEM_BOX: Box = [0.82, 0.08, 0.62, 0, 0.34, 0];
const TRIM_BOXES: readonly Box[] = [[0.05, 0.9, 0.03, 0, 0.75, 0.315], [0.82, 0.07, 0.62, 0, 0.335, 0]];
const HOOD_BOX: Box = [0.56, 0.22, 0.14, 0, 1.1, -0.33];
// The hood's rim at the front of the neck and two drawstrings, one light mesh.
const DRAWSTRING_BOXES: readonly Box[] = [[0.4, 0.07, 0.04, 0, 1.17, 0.31], [0.03, 0.3, 0.03, -0.07, 1.0, 0.32], [0.03, 0.3, 0.03, 0.07, 1.0, 0.32]];
// Arm-local: the forearm below a short sleeve, a hair wider than the arm (0.4 wide and deep).
const CUFF_LEFT: Box = [0.42, 0.3, 0.42, 0.2, -0.85, 0];
const CUFF_RIGHT: Box = [0.42, 0.3, 0.42, -0.2, -0.85, 0];
const SUIT_COLLAR_BOX: Box = [0.3, 0.14, 0.03, 0, 1.13, 0.315];
const TIE_BOX: Box = [0.07, 0.5, 0.03, 0, 0.92, 0.32];

function add(parent: THREE.Object3D | undefined, name: string, geometry: THREE.BufferGeometry, colour: string | null, shadow: boolean, box?: Box): void {
  if (!parent) return;
  const mesh = new THREE.Mesh(geometry, colour === null ? faceMaterial() : colourMaterial(colour));
  mesh.name = PREFIX + name;
  if (box) {
    mesh.scale.set(box[0], box[1], box[2]);
    mesh.position.set(box[3], box[4], box[5]);
  }
  mesh.castShadow = shadow;
  parent.add(mesh);
}

// One box part from the shared unit box, scaled and placed.
const addBox = (parent: THREE.Object3D | undefined, name: string, box: Box, colour: string) => add(parent, name, unitBox(), colour, false, box);

// Face parts: [box, colour] merged into one mesh with vertex colours, on the +Z face (z 4.0 is the head's surface).
type Part = readonly [Box, string];
const eyeBoxes = (parts: readonly Part[]): Part[] => parts.flatMap(([[w, h, d, x, y, z], colour]): Part[] => [[[w, h, d, x, y, z], colour], [[w, h, d, -x, y, z], colour]]);
const EYES: Record<EyesChoice, readonly Part[]> = {
  default: eyeBoxes([[[1.0, 1.0, 0.2, 1.7, 4.0, 4.1], FACE]]),
  wide: eyeBoxes([[[1.8, 1.8, 0.2, 1.7, 4.0, 4.1], WHITE], [[0.9, 0.9, 0.12, 1.7, 4.0, 4.26], FACE]]),
  sleepy: eyeBoxes([[[1.4, 0.3, 0.2, 1.7, 3.6, 4.1], FACE]]),
  happy: eyeBoxes([[[0.6, 0.3, 0.2, 1.7, 4.4, 4.1], FACE], [[0.5, 0.3, 0.2, 1.15, 4.0, 4.1], FACE], [[0.5, 0.3, 0.2, 2.25, 4.0, 4.1], FACE]]),
};
const MOUTHS: Record<SmileChoice, readonly Part[]> = {
  default: [[[1.8, 0.4, 0.2, 0, 1.75, 4.1], MOUTH], [[0.6, 0.4, 0.2, 1.2, 2.05, 4.1], MOUTH], [[0.6, 0.4, 0.2, -1.2, 2.05, 4.1], MOUTH]],
  grin: [[[4.0, 0.8, 0.2, 0, 1.9, 4.1], MOUTH], [[3.4, 0.35, 0.12, 0, 2.05, 4.26], WHITE]],
  neutral: [[[2.8, 0.3, 0.2, 0, 1.8, 4.1], MOUTH]],
};

function faceGeometry(key: string, parts: readonly Part[]): THREE.BufferGeometry {
  return cached(key, () => {
    const pieces = parts.map(([[w, h, d, x, y, z], colour]) => {
      const piece = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
      const rgb = new THREE.Color(colour);
      const values: number[] = [];
      for (let i = 0; i < piece.getAttribute('position').count; i++) values.push(rgb.r, rgb.g, rgb.b);
      piece.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
      return piece;
    });
    return mergeGeometries(pieces)!;
  });
}

const glassesGeometry = () => merged('glasses', GLASSES_BOXES, () => [-1.7, 1.7].map((x) => new THREE.TorusGeometry(1.0, 0.18, 4, 10).translate(x, 3.9, 4.15)));

// Dresses a character model (leg, torso, arm and head nodes) in a look; nodes the model lacks are skipped.
export function applyLook(model: THREE.Object3D, appearance: Appearance): void {
  const look = CHARACTER_LOOKS[appearance.characterId];
  const node = (name: string) => model.getObjectByName(name);
  const paint = (name: string, colour: string) => {
    const target = node(name) as THREE.Mesh | undefined;
    if (target) target.material = colourMaterial(colour);
  };
  const skin = SKIN_TONES[appearance.skin];
  const own = appearance.top === 'default';
  const top = appearance.top === 'sweatshirt' ? SWEATSHIRT : appearance.top === 'suit' ? SUIT : look.top;

  // The head's painted face conflicted with the moustache, beard and glasses: it is flat skin with our own eyes and mouth.
  paint('head', skin);
  paint('leg-left', look.trousers);
  paint('leg-right', look.trousers);
  for (const name of ['torso', 'arm-left', 'arm-right']) paint(name, top);

  const torso = node('torso');
  if (own) {
    if (look.outfit === 'halfzip') addBox(torso, 'zip', ZIP_BOX, ZIP);
    else if (look.outfit === 'jacket') addBox(torso, 'under', UNDER_BOX, look.under ?? look.top);
    else if (look.outfit === 'sweater') {
      addBox(torso, 'collar', COLLAR_BOX, look.under ?? WHITE);
      addBox(torso, 'hem', HEM_BOX, look.under ?? WHITE);
    } else if (look.outfit === 'cardigan') add(torso, 'trim', merged('cardigan-trim', TRIM_BOXES), look.trim ?? look.top, false);
    else if (look.outfit === 'hoodie') {
      add(torso, 'hood', unitBox(), look.top, true, HOOD_BOX);
      add(torso, 'drawstring', merged('drawstring', DRAWSTRING_BOXES), DRAWSTRING, false);
    } else if (look.outfit === 'tee') {
      addBox(node('arm-left'), 'cuff', CUFF_LEFT, skin);
      addBox(node('arm-right'), 'cuff', CUFF_RIGHT, skin);
    }
  } else if (appearance.top === 'suit') {
    addBox(torso, 'collar', SUIT_COLLAR_BOX, WHITE);
    addBox(torso, 'tie', TIE_BOX, TIE);
  }

  const head = node('head');
  add(head, 'eyes', faceGeometry(`eyes-${appearance.eyes}`, EYES[appearance.eyes]), null, false);
  add(head, 'mouth', faceGeometry(`mouth-${appearance.smile}`, MOUTHS[appearance.smile]), null, false);
  if (look.hair.style !== 'bald') add(head, 'hair', merged(`hair-${look.hair.style}`, HAIR[look.hair.style]), look.hair.colour, true);
  if (look.facial === 'moustache') add(head, 'facial', unitBox(), look.hair.colour, false, MOUSTACHE_BOX);
  else if (look.facial === 'beard') add(head, 'facial', merged('beard', BEARD_BOXES), look.hair.colour, false);
  if ((appearance.glasses === 'default' ? look.glasses : appearance.glasses) === 'round') add(head, 'glasses', glassesGeometry(), GLASSES, false);
  if (appearance.hat === 'cap') add(head, 'hat', merged('cap', CAP_BOXES), CAP, true);
  else if (appearance.hat === 'fez') add(head, 'hat', cached('fez', () => new THREE.CylinderGeometry(2.9, 4.0, 2.5, 8).translate(0, 9.05, 0)), FEZ, true);
}

// A head of one flat skin colour with the default eyes and mouth and, if `beard` is a colour, a beard in it (for figures that are not a CharacterId).
export function dressFace(head: THREE.Object3D | undefined, skin: string, beard: string | null): void {
  if (!head) return;
  (head as THREE.Mesh).material = colourMaterial(skin);
  add(head, 'eyes', faceGeometry('eyes-default', EYES.default), null, false);
  add(head, 'mouth', faceGeometry('mouth-default', MOUTHS.default), null, false);
  if (beard) add(head, 'facial', merged('beard', BEARD_BOXES), beard, false);
}
