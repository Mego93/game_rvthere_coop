import { deepFreeze, vec3, type Vec3 } from './math';

export type VehicleId = 'lodgy' | 'rv';

export interface SeatConfig {
  id: string;
  // Chassis-local sitting position.
  pos: Vec3;
  // -1 left (-X), +1 right (+X); the door is on this side.
  side: -1 | 1;
}

export interface VehicleConfig {
  id: VehicleId;
  halfExtents: Vec3;
  mass: number;
  // Height of the centre of mass relative to the chassis centre.
  comY: number;
  // Wheel attachment points relative to the chassis centre: (+-wheelX, wheelY, +-wheelZ).
  wheelX: number;
  wheelY: number;
  wheelZ: number;
  wheelRadius: number;
  suspensionRest: number;
  suspensionTravel: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  // Height of the chassis centre above the ground when at rest.
  rideHeight: number;
  grip: number;
  sideGrip: number;
  // Total drive force at standstill, shared by the four wheels.
  engineForce: number;
  maxSpeed: number;
  reverseSpeed: number;
  brakeForce: number;
  maxSteer: number;
  // Front bumper point where the winch cable leaves the vehicle, relative to the chassis centre.
  winchMount: Vec3;
  // seats[0] is the driver seat.
  seats: readonly SeatConfig[];
  // In the vehicle yaw frame; y is ignored, the ground is found below.
  spawnSlots: readonly Vec3[];
}

export const VEHICLES: Record<VehicleId, VehicleConfig> = deepFreeze({
  lodgy: {
    id: 'lodgy',
    halfExtents: vec3(0.88, 0.55, 2.25),
    mass: 1500,
    comY: -0.2,
    wheelX: 0.78,
    wheelY: -0.4,
    wheelZ: 1.4,
    wheelRadius: 0.33,
    suspensionRest: 0.3,
    suspensionTravel: 0.25,
    suspensionStiffness: 30,
    suspensionCompression: 2.5,
    suspensionRelaxation: 2,
    rideHeight: 0.95,
    grip: 1.6,
    sideGrip: 1,
    engineForce: 5000,
    maxSpeed: 20,
    reverseSpeed: 6,
    brakeForce: 12000,
    maxSteer: 0.55,
    winchMount: vec3(0, -0.3, -2.25),
    seats: [
      { id: 'driver', pos: vec3(-0.4, 0.1, -0.7), side: -1 },
      { id: 'seat1', pos: vec3(0.4, 0.1, -0.7), side: 1 },
      { id: 'seat2', pos: vec3(-0.4, 0.1, 0.4), side: -1 },
      { id: 'seat3', pos: vec3(0.4, 0.1, 0.4), side: 1 },
      { id: 'seat4', pos: vec3(-0.4, 0.1, 1.5), side: -1 },
      { id: 'seat5', pos: vec3(0.4, 0.1, 1.5), side: 1 },
    ],
    spawnSlots: [
      vec3(-2.08, 0, -0.7),
      vec3(2.08, 0, -0.7),
      vec3(-2.08, 0, 0.4),
      vec3(2.08, 0, 0.4),
      vec3(-2.08, 0, 1.5),
      vec3(2.08, 0, 1.5),
    ],
  },
  rv: {
    id: 'rv',
    halfExtents: vec3(1.15, 1.2, 3.4),
    mass: 3750,
    comY: 0.1,
    wheelX: 1.05,
    wheelY: -1.05,
    wheelZ: 2.3,
    wheelRadius: 0.4,
    suspensionRest: 0.35,
    suspensionTravel: 0.3,
    suspensionStiffness: 30,
    suspensionCompression: 2.5,
    suspensionRelaxation: 2,
    rideHeight: 1.7,
    grip: 1.6,
    sideGrip: 1,
    engineForce: 7500,
    maxSpeed: 15,
    reverseSpeed: 5,
    brakeForce: 24000,
    maxSteer: 0.45,
    winchMount: vec3(0, -0.9, -3.4),
    seats: [
      { id: 'driver', pos: vec3(-0.55, 0.0, -2.2), side: -1 },
      { id: 'seat1', pos: vec3(0.55, 0.0, -2.2), side: 1 },
      { id: 'seat2', pos: vec3(-0.55, 0.0, -0.4), side: -1 },
      { id: 'seat3', pos: vec3(0.55, 0.0, -0.4), side: 1 },
      { id: 'seat4', pos: vec3(-0.55, 0.0, 1.8), side: -1 },
      { id: 'seat5', pos: vec3(0.55, 0.0, 1.8), side: 1 },
    ],
    spawnSlots: [
      vec3(-2.35, 0, -2.2),
      vec3(2.35, 0, -2.2),
      vec3(-2.35, 0, -0.4),
      vec3(2.35, 0, -0.4),
      vec3(-2.35, 0, 1.8),
      vec3(2.35, 0, 1.8),
    ],
  },
});

export function getVehicleConfig(id: string): VehicleConfig {
  const config = Object.hasOwn(VEHICLES, id) ? VEHICLES[id as VehicleId] : undefined;
  if (!config) throw new Error(`Unknown vehicle: ${id}`);
  return config;
}
