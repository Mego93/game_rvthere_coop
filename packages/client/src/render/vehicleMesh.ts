import { CHARACTER_SCALE, type Vec3, type VehicleConfig, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { SEAT_RING_SECONDS } from '../ui/hud/seatToast';
import { fitToTarget, hasModel, instantiate, shadowed } from './models';

const BODY_COLOURS: Record<VehicleConfig['id'], number> = { lodgy: 0x4a6fa5, rv: 0xefe6d2, buggy: 0xd9822b };

const part = (name: string, width: number, height: number, depth: number, colour: number, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 1, metalness: 0 }),
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  return mesh;
};

const CREAM = BODY_COLOURS.rv;
const TERRACOTTA = 0xc1623f;
const GLASS = 0x1f2937;
const REAR_PANEL = 0xcfc6b2;
const DARK = 0x111827;

function addWheels(group: THREE.Group, config: VehicleConfig): void {
  const wheelY = config.wheelY - config.suspensionRest;
  for (const x of [-config.wheelX, config.wheelX]) {
    for (const z of [-config.wheelZ, config.wheelZ]) {
      group.add(part('wheel', 0.25, config.wheelRadius * 2, config.wheelRadius * 2, DARK, x, wheelY, z));
    }
  }
}

// Which RV is drawn: the real camper (the Car Kit van, then boxes, if it fails to load), the Car Kit delivery van, or the step-17 boxes.
const RV_MODEL = 'camper' as 'boxes' | 'delivery' | 'camper';
const MODEL_KEY: Record<VehicleConfig['id'], string> = { lodgy: 'vehicle.lodgy', rv: 'vehicle.rv', buggy: 'vehicle.buggy' };
const REAL_KEY: Record<VehicleConfig['id'], string> = { lodgy: 'vehicle.lodgy.real', rv: 'vehicle.rv.real', buggy: 'vehicle.buggy.real' };
// The most the real model's length is stretched to reach the collision box; height and width are never distorted.
const MAX_STRETCH = 1.3;
// The Car Kit's wheel radius in its own units.
const MODEL_WHEEL_RADIUS = 0.3;
// A step longer than this is a restart, not driving, and does not turn the wheels.
const MAX_SPIN_STEP = 5;

interface WheelSpin {
  wheels: THREE.Object3D[];
  radius: number;
  angle: number;
  last: THREE.Vector3 | null;
  // Which way positive rolling turns the wheel nodes about their x axis.
  sign: 1 | -1;
}

const spins = new WeakMap<THREE.Object3D, WheelSpin>();
const forward = new THREE.Vector3();
const step = new THREE.Vector3();

// The Car Kit model fitted to the collision box: body stretched to its width and length, wheels kept round and placed at the stretched arches. Front is +Z in the file, so it is turned half a circle.
export function createModelMesh(config: VehicleConfig): THREE.Group | null {
  const model = instantiate(MODEL_KEY[config.id]);
  const node = model?.children[0];
  if (!model || !node) return null;
  const h = config.halfExtents;
  const bottom = config.wheelY - config.suspensionRest - config.wheelRadius;
  node.scale.set(1, 1, 1);
  node.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const fit = fitToTarget(new THREE.Box3().setFromObject(node), { x: h.x * 2, y: h.y - bottom, z: h.z * 2 });
  node.scale.set(fit.scale.x, fit.scale.y, fit.scale.z);
  node.position.set(fit.offset.x, fit.offset.y + bottom, fit.offset.z);
  const wheels = node.children.filter((child) => child.name.startsWith('wheel'));
  const wheelScale = config.wheelRadius / MODEL_WHEEL_RADIUS;
  for (const wheel of wheels) {
    node.remove(wheel);
    wheel.position.set(
      wheel.position.x * fit.scale.x + fit.offset.x,
      wheel.position.y * fit.scale.y + fit.offset.y + bottom,
      wheel.position.z * fit.scale.z + fit.offset.z,
    );
    wheel.scale.setScalar(wheelScale);
    model.add(wheel);
  }
  model.rotation.y = Math.PI;
  const group = new THREE.Group();
  group.add(model);
  spins.set(group, { wheels, radius: config.wheelRadius, angle: 0, last: null, sign: 1 });
  return group;
}

export interface RealFit {
  scale: number;
  stretch: number;
}

// One scale for all axes from the wanted height, then the length stretched toward the wanted length by at most maxStretch (never shrunk).
export function fitReal(size: { x: number; y: number; z: number }, target: { height: number; length: number }, maxStretch = MAX_STRETCH): RealFit {
  if (!(size.y > 0 && size.z > 0)) throw new Error('model has an empty bounding box');
  const scale = target.height / size.y;
  return { scale, stretch: Math.min(maxStretch, Math.max(1, target.length / (size.z * scale))) };
}

// A real model (front is -Z in its file) on the ground under the collision box. Separate wheel nodes stay round and are moved to the fitted positions so they can roll.
export function createRealMesh(config: VehicleConfig): THREE.Group | null {
  const model = instantiate(REAL_KEY[config.id]);
  const node = model?.children[0];
  if (!model || !node) return null;
  const h = config.halfExtents;
  const bottom = config.wheelY - config.suspensionRest - config.wheelRadius;
  node.scale.set(1, 1, 1);
  node.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(node);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // The Lodgy's top is its box top; the camper's tyres keep their real size, so its roof is one box height above the ground.
  const fit = fitReal(size, { height: config.id === 'rv' ? h.y * 2 : h.y - bottom, length: h.z * 2 });
  const along = fit.scale * fit.stretch;
  const wheels = node.children.filter((child) => child.name.startsWith('wheel'));
  const wheelSize = wheels[0] ? new THREE.Box3().setFromObject(wheels[0]).getSize(new THREE.Vector3()) : null;
  const place = new THREE.Vector3(-centre.x * fit.scale, bottom - box.min.y * fit.scale, -centre.z * along);
  node.scale.set(fit.scale, fit.scale, along);
  node.position.copy(place);
  for (const wheel of wheels) {
    node.remove(wheel);
    wheel.position.set(wheel.position.x * fit.scale + place.x, wheel.position.y * fit.scale + place.y, wheel.position.z * along + place.z);
    wheel.scale.setScalar(fit.scale);
    model.add(wheel);
  }
  const group = new THREE.Group();
  group.add(model);
  shadowed(group);
  if (wheelSize) spins.set(group, { wheels, radius: (wheelSize.y / 2) * fit.scale, angle: 0, last: null, sign: -1 });
  return group;
}

// The buggy has no roof and no doors, so its players are drawn sitting in it, six of them: three rows of two seats.
export const seatsShown = (config: VehicleConfig): boolean => config.id === 'buggy';

// m, how far the cushion's top is below the seat position, and how high a seated figure's hips are above its feet origin.
const CUSHION_DROP = 0.2;
const SEATED_HIPS = 0.52;
const SEAT_STEEL = 0xaab1b8;
const SEAT_LEATHER = 0x3b2f25;
const SEAT_WIDTH = 0.5;
const BENCH_WIDTH = 1.5;

// Where a seated figure's feet origin is, in the vehicle's frame; null for a seat the vehicle does not have.
export function seatedFigureAt(config: VehicleConfig, seatId: string): Vec3 | null {
  const seat = config.seats.find((candidate) => candidate.id === seatId);
  return seat ? { x: seat.pos.x, y: seat.pos.y - CUSHION_DROP - SEATED_HIPS, z: seat.pos.z } : null;
}

const tube = (name: string, from: THREE.Vector3, to: THREE.Vector3, radius: number, colour: number): THREE.Mesh => {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 0.6, metalness: 0.2 }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
};

// A bucket seat for each front place, a bench for each of the two rear rows, and a roll bar behind the last row; the model has two seats of its own, which these cover.
function createSeating(config: VehicleConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'seating';
  const rows = new Map<number, typeof config.seats>();
  for (const seat of config.seats) rows.set(seat.pos.z, [...(rows.get(seat.pos.z) ?? []), seat]);
  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  ordered.forEach(([z, seats], row) => {
    const y = seats[0]!.pos.y - CUSHION_DROP;
    const bench = row > 0;
    if (bench) {
      group.add(part(`bench-${row}`, BENCH_WIDTH, 0.1, SEAT_WIDTH + 0.06, SEAT_STEEL, 0, y - 0.12, z));
      group.add(part(`back-${row}`, BENCH_WIDTH, 0.55, 0.1, SEAT_LEATHER, 0, y + 0.3, z + 0.3));
    }
    for (const seat of seats) {
      group.add(part(`seat-${seat.id}`, SEAT_WIDTH, 0.14, SEAT_WIDTH, SEAT_LEATHER, seat.pos.x, y - 0.07, z));
      if (!bench) group.add(part(`back-${seat.id}`, SEAT_WIDTH, 0.6, 0.1, SEAT_LEATHER, seat.pos.x, y + 0.3, z + 0.3));
    }
  });
  const last = ordered[ordered.length - 1]!;
  const floor = last[1][0]!.pos.y - CUSHION_DROP - 0.15;
  const back = last[0] + 0.62;
  const top = last[1][0]!.pos.y + 0.85;
  const bar = new THREE.Group();
  bar.name = 'roll-bar';
  const reach = BENCH_WIDTH / 2 + 0.08;
  for (const side of [-1, 1]) {
    bar.add(tube('roll-bar-upright', new THREE.Vector3(side * reach, floor, back), new THREE.Vector3(side * reach, top, back), 0.04, SEAT_STEEL));
    // The side rails run forward over the rear rows to the cage the model already has.
    bar.add(tube('roll-bar-rail', new THREE.Vector3(side * reach, top, back), new THREE.Vector3(side * reach, top - 0.1, ordered[1]![0]), 0.035, SEAT_STEEL));
  }
  bar.add(tube('roll-bar-top', new THREE.Vector3(-reach, top, back), new THREE.Vector3(reach, top, back), 0.04, SEAT_STEEL));
  group.add(bar);
  return group;
}

// The buggy's model fitted to its physics: built at its own size, so it only needs putting on the ground under the collision box and the wheels set where the wheels are (round, able to roll); then the seats.
export function createBuggyMesh(config: VehicleConfig): THREE.Group | null {
  const model = instantiate(MODEL_KEY[config.id]);
  const node = model?.children[0];
  if (!model || !node) return null;
  const bottom = config.wheelY - config.suspensionRest - config.wheelRadius;
  node.scale.set(1, 1, 1);
  node.position.set(0, bottom, 0);
  const wheels = node.children.filter((child) => child.name.startsWith('wheel'));
  // The wheels' own radius in the file; the config's is the physics'.
  const radius = wheels[0] ? new THREE.Box3().setFromObject(wheels[0]).getSize(new THREE.Vector3()).y / 2 : config.wheelRadius;
  for (const wheel of wheels) {
    wheel.position.set(Math.sign(wheel.position.x) * config.wheelX, config.wheelY - config.suspensionRest - bottom, Math.sign(wheel.position.z) * config.wheelZ);
    wheel.scale.multiplyScalar(config.wheelRadius / radius);
  }
  const group = new THREE.Group();
  group.add(model);
  group.add(createSeating(config));
  shadowed(group);
  spins.set(group, { wheels, radius: config.wheelRadius, angle: 0, last: null, sign: -1 });
  return group;
}

function createRvMesh(config: VehicleConfig): THREE.Group {
  const group = new THREE.Group();
  group.add(part('body', 2.3, 2.4, 4.42, CREAM, 0, 0, 1.19));
  group.add(part('cab', 2.3, 1.92, 2.38, CREAM, 0, -0.24, -2.21));
  group.add(part('windscreen', 2.07, 0.7, 0.1, GLASS, 0, 0.3, -3.43));
  for (const side of [-1, 1]) {
    group.add(part('window', 0.05, 0.5, 1.0, GLASS, side * 1.17, 0.25, -2.2));
    group.add(part('window', 0.05, 0.5, 1.0, GLASS, side * 1.17, 0.4, 1.0));
  }
  group.add(part('rear', 2.0, 1.6, 0.05, REAR_PANEL, 0, 0, 3.42));
  group.add(part('vent', 0.8, 0.15, 0.8, CREAM, 0, 1.275, 0.8));
  group.add(part('bumper', 2.3, 0.3, 0.3, DARK, 0, -0.95, -3.4));
  for (const side of [-1, 1]) group.add(part('stripe', 0.03, 0.3, 4.0, TERRACOTTA, side * 1.17, -0.3, 0));
  for (const x of [-1.15, 1.15]) {
    for (const z of [-config.wheelZ, config.wheelZ]) group.add(part('arch', 0.3, 0.4, 1.0, DARK, x, -1.0, z));
  }
  addWheels(group, config);
  return group;
}

// The real model when it is loaded, else the Car Kit one (the Lodgy always; the RV unless boxes are chosen), else boxes: the Lodgy a body, a dark windscreen strip marking the front (-Z) and four wheels; the RV a motorhome.
// Software GL is bound by triangle count, so it keeps the light Car Kit models (the e2e frame rate depends on it).
export function createVehicleMesh(config: VehicleConfig, light = false): THREE.Group {
  if (config.id === 'buggy') return (hasModel(MODEL_KEY.buggy) ? createBuggyMesh(config) : null) ?? createBoxMesh(config);
  const real = !light && (config.id === 'lodgy' || RV_MODEL === 'camper');
  const kit = config.id === 'lodgy' || RV_MODEL !== 'boxes';
  if (real && hasModel(REAL_KEY[config.id])) {
    const drawn = createRealMesh(config);
    if (drawn) return drawn;
  }
  if (kit && hasModel(MODEL_KEY[config.id])) {
    const drawn = createModelMesh(config);
    if (drawn) return drawn;
  }
  return createBoxMesh(config);
}

export function createBoxMesh(config: VehicleConfig): THREE.Group {
  if (config.id === 'rv') return createRvMesh(config);
  const h = config.halfExtents;
  const group = new THREE.Group();
  group.add(part('body', h.x * 2, h.y * 2, h.z * 2, BODY_COLOURS[config.id]));
  group.add(part('windscreen', h.x * 1.8, h.y * 0.6, 0.1, GLASS, 0, h.y * 0.5, -h.z - 0.03));
  addWheels(group, config);
  if (seatsShown(config)) group.add(createSeating(config));
  return group;
}

export function placeVehicleMesh(mesh: THREE.Group, state: VehicleState): void {
  mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
  mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
  const spin = spins.get(mesh);
  if (!spin) return;
  // Roll by the distance driven along the nose; the file's wheels turn about their own x, which points to the vehicle's -x.
  if (spin.last) {
    step.copy(mesh.position).sub(spin.last);
    forward.set(0, 0, -1).applyQuaternion(mesh.quaternion);
    const driven = step.dot(forward);
    if (Math.abs(driven) < MAX_SPIN_STEP) spin.angle = (spin.angle + driven / spin.radius) % (Math.PI * 2);
    spin.last.copy(mesh.position);
  } else spin.last = mesh.position.clone();
  for (const wheel of spin.wheels) wheel.rotation.x = spin.angle * spin.sign;
}

const RING_INNER = 0.38 * CHARACTER_SCALE;
const RING_OUTER = 0.5 * CHARACTER_SCALE;
const RING_PEAK = 0.75;

// A translucent ring in the player's colour, drawn over the body so it shows inside the model.
export function createSeatRing(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_INNER, RING_OUTER, 32), material);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 10;
  ring.visible = false;
  return ring;
}

// Shows the ring at the seat while `age` (seconds since boarding) is set, fading out; allocates nothing per call.
export function placeSeatRing(ring: THREE.Mesh, vehicle: THREE.Group, config: VehicleConfig, seatId: string | null, colour: string, age: number | null): void {
  if (seatId === null || age === null) {
    ring.visible = false;
    return;
  }
  // Looked up once per seat, not per frame.
  if (ring.userData.seatId !== seatId) {
    ring.userData.seatId = seatId;
    ring.userData.seat = config.seats.find((candidate) => candidate.id === seatId);
  }
  const seat = ring.userData.seat as VehicleConfig['seats'][number] | undefined;
  if (!seat) {
    ring.visible = false;
    return;
  }
  if (ring.parent !== vehicle) vehicle.add(ring);
  const material = ring.material as THREE.MeshBasicMaterial;
  if (ring.userData.colour !== colour) {
    ring.userData.colour = colour;
    material.color.set(colour);
  }
  ring.position.set(seat.pos.x, seat.pos.y - 0.2, seat.pos.z);
  material.opacity = RING_PEAK * Math.max(0, 1 - age / SEAT_RING_SECONDS);
  ring.scale.setScalar(1 + 0.25 * Math.sin(age * 6));
  ring.visible = true;
}

export function disposeSeatRing(ring: THREE.Mesh): void {
  ring.removeFromParent();
  ring.geometry.dispose();
  (ring.material as THREE.Material).dispose();
}
