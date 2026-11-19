import { ITEM_KINDS, PROP_KINDS, type ItemKind, type PropKind, type PropSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { fitted, hasModel, instantiate, shadowed } from './models';

const COLOURS: Record<PropKind, number> = { crate: 0xb5833f, barrier: 0xc0392b, cart: 0x8b5a2b, scooter: 0x8e1b1b };
const UNKNOWN_HALF = 0.25;
export const PROP_MODEL_KEYS: Record<PropKind, string> = { crate: 'prop.crate', cart: 'prop.cart', barrier: 'prop.barrier', scooter: 'prop.scooter' };
export const ITEM_MODEL_KEYS: Record<ItemKind, string> = { jerrycan: 'item.jerrycan', toolbox: 'item.toolbox', healthKit: 'item.healthKit', tajine: 'item.tajine' };
// Turns that bring each file's long side onto the hit box's long side (x for the barrier, z for the cart) and the scooter's front to -z.
const PROP_YAW: Record<PropKind, number> = { crate: 0, barrier: 0, cart: Math.PI / 2, scooter: Math.PI };

const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0, ...extra });

const box = (width: number, height: number, depth: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(x, y, z);
  return mesh;
};

// A jerrycan: a red body with a ridged face, a handle bar and a spout.
function jerrycan(h: { x: number; y: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const red = material(0xe65100, { roughness: 0.55 });
  const dark = material(0x2b2b2b, { roughness: 0.6 });
  group.add(box(h.x * 2, h.y * 1.7, h.z * 2, red, 0, -h.y * 0.15, 0));
  group.add(box(h.x * 1.2, h.y * 0.12, h.z * 2.04, dark, 0, h.y * 0.1, 0));
  group.add(box(h.x * 1.2, h.y * 0.12, h.z * 2.04, dark, 0, -h.y * 0.55, 0));
  group.add(box(h.x * 0.2, h.y * 0.5, h.z * 0.4, red, -h.x * 0.55, h.y * 0.95, 0));
  group.add(box(h.x * 0.2, h.y * 0.5, h.z * 0.4, red, h.x * 0.1, h.y * 0.95, 0));
  group.add(box(h.x * 1.0, h.y * 0.16, h.z * 0.4, red, -h.x * 0.225, h.y * 1.2, 0));
  const spout = box(h.x * 0.3, h.y * 0.35, h.z * 0.3, dark, h.x * 0.55, h.y * 0.95, h.z * 0.55);
  spout.rotation.z = -0.5;
  group.add(spout);
  return group;
}

// A toolbox: a red body, a darker lid line, a bar handle on two posts and two latches.
function toolbox(h: { x: number; y: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const body = material(0xc62828, { roughness: 0.5, metalness: 0.2 });
  const trim = material(0x8e1b1b, { roughness: 0.5 });
  const metal = material(0xb8b8b8, { roughness: 0.35, metalness: 0.8 });
  group.add(box(h.x * 2, h.y * 1.4, h.z * 2, body, 0, -h.y * 0.3, 0));
  group.add(box(h.x * 2.04, h.y * 0.12, h.z * 2.04, trim, 0, h.y * 0.35, 0));
  group.add(box(h.x * 0.12, h.y * 0.4, h.z * 0.12, metal, -h.x * 0.55, h.y * 0.9, 0));
  group.add(box(h.x * 0.12, h.y * 0.4, h.z * 0.12, metal, h.x * 0.55, h.y * 0.9, 0));
  group.add(box(h.x * 1.3, h.y * 0.12, h.z * 0.14, metal, 0, h.y * 1.1, 0));
  for (const side of [-1, 1]) group.add(box(h.x * 0.2, h.y * 0.3, h.z * 0.06, metal, side * h.x * 0.6, h.y * 0.1, h.z * 1.02));
  return group;
}

// A white health kit with a red cross on its lid and on its front.
function healthKit(h: { x: number; y: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const white = material(0xf4f4f0, { roughness: 0.6 });
  const red = material(0xd32f2f, { roughness: 0.6 });
  group.add(box(h.x * 2, h.y * 2, h.z * 2, white));
  group.add(box(h.x * 1.2, h.y * 0.1, h.z * 0.4, red, 0, h.y * 1.02, 0));
  group.add(box(h.x * 0.4, h.y * 0.1, h.z * 1.2, red, 0, h.y * 1.02, 0));
  group.add(box(h.x * 0.9, h.y * 0.26, h.z * 0.06, red, 0, 0, -h.z * 1.01));
  group.add(box(h.x * 0.26, h.y * 0.9, h.z * 0.06, red, 0, 0, -h.z * 1.01));
  return group;
}

// A terracotta tajine: a flat dish with a cone lid and a knob.
function tajine(h: { x: number; y: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const clay = material(0xc2662d, { roughness: 0.8 });
  const dark = material(0x8a4520, { roughness: 0.8 });
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(h.x, h.x * 0.85, h.y * 0.35, 12), dark);
  dish.position.y = -h.y * 0.82;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(h.x * 0.8, h.y * 1.45, 12), clay);
  cone.position.y = -h.y * 0.05 + h.y * 0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(h.x * 0.14, 8, 6), dark);
  knob.position.y = h.y * 0.95;
  group.add(dish, cone, knob);
  return group;
}

// A model stretched to a collision box and centred on the body's origin.
export function fitToHalf(model: THREE.Object3D, h: { x: number; y: number; z: number }, yaw: number): THREE.Group {
  const fit = fitted(model, { x: h.x * 2, y: h.y * 2, z: h.z * 2 }, yaw);
  fit.position.y = -h.y;
  const root = new THREE.Group();
  root.add(fit);
  return shadowed(root);
}

export const fitPropModel = (model: THREE.Object3D, kind: PropKind): THREE.Group => fitToHalf(model, PROP_KINDS[kind].halfExtents, PROP_YAW[kind]);
export const fitItemModel = (model: THREE.Object3D, kind: ItemKind): THREE.Group => fitToHalf(model, ITEM_KINDS[kind].halfExtents, 0);

function loadedModel(key: string): THREE.Group | null {
  return hasModel(key) ? instantiate(key) : null;
}

function itemMesh(kind: ItemKind): THREE.Object3D {
  const model = loadedModel(ITEM_MODEL_KEYS[kind]);
  if (model) return fitItemModel(model, kind);
  const h = ITEM_KINDS[kind].halfExtents;
  return kind === 'jerrycan' ? jerrycan(h) : kind === 'toolbox' ? toolbox(h) : kind === 'tajine' ? tajine(h) : healthKit(h);
}

// A model of the prop's kind stretched to its collision box and centred on the body's origin, or null when it did not load.
function propModel(kind: PropKind): THREE.Group | null {
  const model = loadedModel(PROP_MODEL_KEYS[kind]);
  return model ? fitPropModel(model, kind) : null;
}

// A prop or item drawn as its model or a box of its kind's size; a kind this client does not know is a grey 0.5 m cube.
function buildPropMesh(kind: string): THREE.Object3D {
  if (Object.hasOwn(ITEM_KINDS, kind)) return itemMesh(kind as ItemKind);
  if (!Object.hasOwn(PROP_KINDS, kind)) {
    return new THREE.Mesh(new THREE.BoxGeometry(UNKNOWN_HALF * 2, UNKNOWN_HALF * 2, UNKNOWN_HALF * 2), material(0x888888));
  }
  const modelled = propModel(kind as PropKind);
  if (modelled) return modelled;
  const h = PROP_KINDS[kind as PropKind].halfExtents;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), material(COLOURS[kind as PropKind]));
  if (kind === 'barrier') {
    // A white band across the middle, slightly proud of the body.
    const band = new THREE.Mesh(new THREE.BoxGeometry(h.x * 0.4, h.y * 2.02, h.z * 2.02), material(0xf2f2f2));
    mesh.add(band);
  }
  return mesh;
}

const RIDER_TOP = 0x4a5a6a;
const RIDER_TROUSERS = 0x3a3a40;
const RIDER_SKIN = 0xd9a877;
const RIDER_HELMET = 0x2b2b2b;

// A seated blocky rider in a neutral outfit on a scooter's box: hips on the seat, hands on the bars; -z is forward.
export function createRider(h: { x: number; y: number; z: number }): THREE.Group {
  const rider = new THREE.Group();
  rider.name = 'rider';
  const top = material(RIDER_TOP);
  const trousers = material(RIDER_TROUSERS);
  const skin = material(RIDER_SKIN);
  const helmet = material(RIDER_HELMET);
  rider.add(box(h.x * 1.3, h.y * 0.85, h.z * 0.3, top, 0, h.y * 1.25, h.z * 0.15));
  const head = box(h.x * 0.8, h.y * 0.45, h.x * 0.8, skin, 0, h.y * 2.0, h.z * 0.12);
  rider.add(head, box(h.x * 0.9, h.y * 0.2, h.x * 0.9, helmet, 0, h.y * 2.2, h.z * 0.12));
  for (const side of [-1, 1]) {
    rider.add(box(h.x * 0.5, h.y * 0.25, h.z * 0.55, trousers, side * h.x * 0.4, h.y * 0.85, -h.z * 0.1));
    rider.add(box(h.x * 0.45, h.y * 0.7, h.z * 0.2, trousers, side * h.x * 0.4, h.y * 0.5, -h.z * 0.45));
    rider.add(box(h.x * 0.35, h.y * 0.25, h.z * 0.6, top, side * h.x * 0.8, h.y * 1.3, -h.z * 0.3));
  }
  rider.traverse((object) => {
    object.castShadow = true;
  });
  return rider;
}

export function createPropMesh(kind: string): THREE.Object3D {
  const mesh = buildPropMesh(kind);
  if (kind === 'scooter') mesh.add(createRider(PROP_KINDS.scooter.halfExtents));
  mesh.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return mesh;
}

export function placePropMesh(mesh: THREE.Object3D, pose: Pick<PropSnapshot, 'pos' | 'rot'>): void {
  mesh.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  mesh.quaternion.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w);
}

// Shared model geometry and materials outlive the mesh.
export function disposePropMesh(mesh: THREE.Object3D): void {
  mesh.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.geometry.userData.shared !== true) node.geometry.dispose();
    const material = node.material as THREE.Material;
    if (material.userData.shared !== true) material.dispose();
  });
}
