import type { VehicleConfig, VehicleState } from '@lodgy/shared';
import * as THREE from 'three';

const BODY_COLOURS: Record<VehicleConfig['id'], number> = { lodgy: 0x4a6fa5, rv: 0xefe6d2 };

const part = (name: string, width: number, height: number, depth: number, colour: number, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true }),
  );
  mesh.name = name;
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

// The vehicle drawn as boxes: the Lodgy a body, a dark windscreen strip marking the front (-Z) and four wheels; the RV a motorhome.
export function createVehicleMesh(config: VehicleConfig): THREE.Group {
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
}
