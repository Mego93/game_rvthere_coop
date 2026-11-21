import type { Box, BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { CROSSING, RENTAL_BOX, RENTAL_SIGN, TERMINAL, TERMINAL_PLACES, booths, crossingBars, lampPosts } from './arrivalLayout';
import { mergeBoxes, toGeometry } from './groundMerge';
import type { SceneOptions } from './groundTextures';
import { fitted, hasModel, instantiate, shadowed, type FitSize } from './models';
import { textSignTexture } from './signTexture';

export interface ArrivalScene {
  group: THREE.Group;
}

const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

const HALL_WALL = 0xdadfe3;
const FENCE = 0x4f5a63;
const STAND = 0xf1f1ec;
const ROOF = 0xb8322a;
const STRIPE = 0xf2f2f0;

function modelAt(key: string, x: number, y: number, z: number, size: FitSize, yaw = 0): THREE.Group | null {
  if (!hasModel(key)) return null;
  const model = instantiate(key);
  if (!model) return null;
  const root = fitted(model, size, yaw);
  root.position.set(x, y, z);
  return shadowed(root);
}

function wallMesh(boxes: readonly Box[], colour: number): THREE.Mesh | null {
  const merged = mergeBoxes(boxes, undefined, true);
  if (!merged) return null;
  const mesh = new THREE.Mesh(toGeometry(merged), solid(colour));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// The airport the friends arrive at: the course's walls in airport colours, a terminal behind the start and one beside the hall, the crossing's stripes, lamp posts and palms along the plaza, and the rental stand of three ticket booths under its sign. Purely visual; the shared course owns every collision.
export function createArrivalScene(course: BuiltCourse, _options: SceneOptions = {}): ArrivalScene {
  const group = new THREE.Group();

  // Tall walls are the hall's, the low ones the plaza's fences; the rental box is drawn as its booths.
  const rental = (box: Box) => Math.abs(box.center.x - (RENTAL_BOX.x0 + RENTAL_BOX.x1) / 2) < 0.01 && Math.abs(box.center.z - (RENTAL_BOX.z0 + RENTAL_BOX.z1) / 2) < 0.01;
  const hall = wallMesh(course.walls.filter((box) => box.halfExtents.y > 1 && !rental(box)), HALL_WALL);
  const fences = wallMesh(course.walls.filter((box) => box.halfExtents.y <= 1), FENCE);
  if (hall) group.add(hall);
  if (fences) group.add(fences);

  for (const place of TERMINAL_PLACES) {
    // The size is in the turned frame: a quarter turn swaps the width and the depth.
    const turned = Math.abs(Math.sin(place.yaw)) > 0.5;
    const terminal = modelAt('arrival.terminal', place.x, 0, place.z, { x: turned ? TERMINAL.depth : TERMINAL.width, y: TERMINAL.height, z: turned ? TERMINAL.width : TERMINAL.depth }, place.yaw);
    if (terminal) group.add(terminal);
  }

  // The crossing's bars across the lane.
  const stripes = crossingBars().map((z) => ({
    center: { x: 0, y: 0.03, z },
    halfExtents: { x: CROSSING.x - 0.2, y: 0.015, z: CROSSING.bar / 2 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
  }));
  const stripeMerged = mergeBoxes(stripes, undefined, false);
  if (stripeMerged) {
    const mesh = new THREE.Mesh(toGeometry(stripeMerged), new THREE.MeshStandardMaterial({ color: STRIPE, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The rental stand: a roof slab, three booths and the sign, facing the stop.
  const centreX = (RENTAL_BOX.x0 + RENTAL_BOX.x1) / 2;
  const centreZ = (RENTAL_BOX.z0 + RENTAL_BOX.z1) / 2;
  const depth = RENTAL_BOX.x1 - RENTAL_BOX.x0;
  const length = RENTAL_BOX.z1 - RENTAL_BOX.z0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(depth, RENTAL_BOX.height, length), solid(STAND));
  body.position.set(centreX, RENTAL_BOX.height / 2, centreZ);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  for (const booth of booths()) {
    const model = modelAt('arrival.booth', booth.x, 0, booth.z, { x: depth * 1.02, y: RENTAL_BOX.height, z: booth.length * 0.98 });
    if (model) group.add(model);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.4, 0.25, length + 0.6), solid(ROOF));
  roof.position.set(centreX + 0.5, RENTAL_BOX.height + 0.12, centreZ);
  roof.castShadow = true;
  group.add(roof);
  const signTexture = textSignTexture(RENTAL_SIGN.text, { width: 1024, height: 190, background: '#b8322a', foreground: '#ffffff', border: '#ffffff' });
  if (signTexture) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(RENTAL_SIGN.width, RENTAL_SIGN.height), new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false }));
    // Turned a quarter so its face looks east, toward the stop; the text then reads left to right for someone standing there.
    sign.rotation.y = Math.PI / 2;
    sign.position.set(RENTAL_BOX.x1 + 0.9, RENTAL_SIGN.y + RENTAL_BOX.height / 2 + 0.2, centreZ);
    group.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), solid(FENCE));
    for (const dz of [-RENTAL_SIGN.width / 2 + 0.4, RENTAL_SIGN.width / 2 - 0.4]) {
      const leg = post.clone();
      leg.position.set(RENTAL_BOX.x1 + 0.9, RENTAL_BOX.height + 0.6, centreZ + dz);
      group.add(leg);
    }
  }

  // Lamp posts and palms outside the plaza's fences.
  for (const [index, post] of lampPosts().entries()) {
    const lamp = modelAt('decor.light.square', post.x, 0, post.z, { y: 6 }, post.x < 0 ? Math.PI / 2 : -Math.PI / 2);
    if (lamp) group.add(lamp);
    const palm = modelAt(index % 3 === 0 ? 'decor.palm.b' : 'decor.palm.a', post.x + Math.sign(post.x) * 7, 0, post.z - 14, {}, index);
    if (palm) group.add(palm);
  }
  return { group };
}

