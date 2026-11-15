import type { VehicleConfig, VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { fitToTarget, hasModel, instantiate } from './models';

const BODY_COLOURS: Record<VehicleConfig['id'], number> = { lodgy: 0x4a6fa5, rv: 0xefe6d2 };

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

// Which RV is drawn when the Car Kit is loaded: the step-17 boxes or the Car Kit delivery van.
const RV_MODEL = 'delivery' as 'boxes' | 'delivery';
const MODEL_KEY: Record<VehicleConfig['id'], string> = { lodgy: 'vehicle.lodgy', rv: 'vehicle.rv' };
// The Car Kit's wheel radius in its own units.
const MODEL_WHEEL_RADIUS = 0.3;
// A step longer than this is a restart, not driving, and does not turn the wheels.
const MAX_SPIN_STEP = 5;

interface WheelSpin {
  wheels: THREE.Object3D[];
  radius: number;
  angle: number;
  last: THREE.Vector3 | null;
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
  spins.set(group, { wheels, radius: config.wheelRadius, angle: 0, last: null });
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

// The Car Kit model when it is loaded; else boxes: the Lodgy a body, a dark windscreen strip marking the front (-Z) and four wheels; the RV a motorhome.
export function createVehicleMesh(config: VehicleConfig): THREE.Group {
  if (hasModel(MODEL_KEY[config.id]) && (config.id === 'lodgy' || RV_MODEL === 'delivery')) {
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
  for (const wheel of spin.wheels) wheel.rotation.x = spin.angle;
}
