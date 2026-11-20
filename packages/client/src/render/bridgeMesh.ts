import { BRIDGE_RAIL_HEIGHT, BRIDGE_RAIL_THICKNESS, rotate, routeFrame, type Box, type BuiltCourse, type GroundBox } from '@lodgy/shared';
import * as THREE from 'three';
import { mergeBoxes, toGeometry } from './groundMerge';

// Planks lie across the deck, one every PLANK_PITCH m with a gap between them, a little above the deck box they cover.
export const PLANK_PITCH = 0.32;
export const PLANK_GAP = 0.05;
export const PLANK_RISE = 0.04;
export const PLANK_HALF_THICKNESS = 0.025;
// Railing posts, and the two rails between them.
export const POST_SPACING = 2.4;
export const POST_SIZE = 0.2;
const RAIL_SIZE = 0.1;

const DECK_BEAM = 0x3d2b1a;
const POST_WOOD = 0x6b4a2b;

export interface BridgeParts {
  deck: GroundBox[];
  rails: Box[];
}

// The ground boxes and railing walls of the bridges: those whose nearest route point lies inside a ravine span.
export function bridgeParts(course: BuiltCourse, walls: readonly Box[]): BridgeParts {
  if (course.ravines.length === 0) return { deck: [], rails: [] };
  const frame = routeFrame(course);
  const inside = (box: Box) => {
    const { along } = frame.nearest(box.center.x, box.center.z);
    return course.ravines.some((r) => along >= r.from && along <= r.to);
  };
  const isRail = (box: Box) => box.halfExtents.x <= BRIDGE_RAIL_THICKNESS && box.halfExtents.y <= BRIDGE_RAIL_HEIGHT && !box.rock;
  return { deck: course.ground.filter(inside), rails: walls.filter((box) => isRail(box) && inside(box)) };
}

const at = (box: Box, x: number, y: number, z: number) => {
  const p = rotate(box.rot, { x, y, z });
  return { x: box.center.x + p.x, y: box.center.y + p.y, z: box.center.z + p.z };
};

// The planks of one deck box, lying across it (its local x is across the road, z along it).
export function plankBoxes(deck: Box): Box[] {
  const length = deck.halfExtents.z * 2;
  const n = Math.max(1, Math.floor(length / PLANK_PITCH));
  const pitch = length / n;
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      center: at(deck, 0, deck.halfExtents.y + PLANK_RISE - PLANK_HALF_THICKNESS, -deck.halfExtents.z + (i + 0.5) * pitch),
      halfExtents: { x: deck.halfExtents.x, y: PLANK_HALF_THICKNESS, z: Math.max(0.01, (pitch - PLANK_GAP) / 2) },
      rot: deck.rot,
    });
  }
  return out;
}

// A railing wall drawn as wooden posts every POST_SPACING m (the ends included) with a top and a middle rail.
export function railPostBoxes(rail: Box): Box[] {
  const half = rail.halfExtents;
  const out: Box[] = [];
  const bottom = -half.y;
  const gaps = Math.max(1, Math.round((half.z * 2 - POST_SIZE) / POST_SPACING));
  for (let i = 0; i <= gaps; i++) {
    const z = -half.z + POST_SIZE / 2 + (i * (half.z * 2 - POST_SIZE)) / gaps;
    out.push({ center: at(rail, 0, 0, z), halfExtents: { x: POST_SIZE / 2, y: half.y, z: POST_SIZE / 2 }, rot: rail.rot });
  }
  for (const height of [0.45, 0.95]) {
    out.push({ center: at(rail, 0, bottom + height * 2 * half.y, 0), halfExtents: { x: RAIL_SIZE / 2, y: RAIL_SIZE / 2, z: half.z }, rot: rail.rot });
  }
  return out;
}

// Deterministic wood tones, so a bridge looks the same every run.
function woodColour(index: number, out: THREE.Color): THREE.Color {
  const noise = Math.sin(index * 12.9898) * 43758.5453;
  const k = noise - Math.floor(noise);
  return out.setHSL(0.075 + 0.015 * k, 0.38, 0.27 + 0.13 * k);
}

function coloured(boxes: readonly Box[], colour: (index: number, out: THREE.Color) => THREE.Color): THREE.BufferGeometry | null {
  const merged = mergeBoxes(boxes, undefined, false);
  if (!merged) return null;
  const geometry = toGeometry(merged);
  const verticesPerBox = merged.positions.length / 3 / boxes.length;
  const colours = new Float32Array(merged.positions.length);
  const tone = new THREE.Color();
  for (let i = 0; i < boxes.length; i++) {
    colour(i, tone);
    for (let v = 0; v < verticesPerBox; v++) colours.set([tone.r, tone.g, tone.b], (i * verticesPerBox + v) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

// The bridges' look: dark beams under the deck, wooden planks on top, wooden posts and rails. Purely visual; the boxes the physics uses are unchanged.
export function createBridgeMeshes(parts: BridgeParts): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const beams = mergeBoxes(parts.deck, undefined, true);
  if (beams) {
    const mesh = new THREE.Mesh(toGeometry(beams), new THREE.MeshStandardMaterial({ color: DECK_BEAM, roughness: 1, metalness: 0 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const planks = coloured(parts.deck.flatMap(plankBoxes), woodColour);
  if (planks) {
    const mesh = new THREE.Mesh(planks, woodMaterial());
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const posts = coloured(parts.rails.flatMap(railPostBoxes), (i, out) => out.set(POST_WOOD).offsetHSL(0, 0, (((i * 7) % 5) - 2) * 0.012));
  if (posts) {
    const mesh = new THREE.Mesh(posts, woodMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
