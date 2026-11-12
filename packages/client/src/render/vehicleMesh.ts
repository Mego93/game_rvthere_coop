import type { VehicleConfig, VehicleState } from '@lodgy/shared';
import * as THREE from 'three';

const BODY_COLOURS: Record<VehicleConfig['id'], number> = { lodgy: 0x4a6fa5, rv: 0xefe6d2 };

const part = (width: number, height: number, depth: number, colour: number) =>
  new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true }),
  );

// The vehicle drawn as boxes: a body, a dark windscreen strip marking the front (-Z), and four wheels.
export function createVehicleMesh(config: VehicleConfig): THREE.Group {
  const h = config.halfExtents;
  const group = new THREE.Group();
  group.add(part(h.x * 2, h.y * 2, h.z * 2, BODY_COLOURS[config.id]));

  const windscreen = part(h.x * 1.8, h.y * 0.6, 0.1, 0x1f2937);
  windscreen.position.set(0, h.y * 0.5, -h.z - 0.03);
  group.add(windscreen);

  const wheelY = config.wheelY - config.suspensionRest;
  for (const x of [-config.wheelX, config.wheelX]) {
    for (const z of [-config.wheelZ, config.wheelZ]) {
      const wheel = part(0.25, config.wheelRadius * 2, config.wheelRadius * 2, 0x111827);
      wheel.position.set(x, wheelY, z);
      group.add(wheel);
    }
  }
  return group;
}

export function placeVehicleMesh(mesh: THREE.Group, state: VehicleState): void {
  mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
  mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
}
