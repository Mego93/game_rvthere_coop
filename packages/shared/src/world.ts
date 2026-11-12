import { GRAVITY, TICK_DT, type Surface } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import type { Vec3 } from './math';
import type { PlayerInput } from './protocol';
import type { Rapier } from './rapier';
import { buildStatics } from './statics';
import { createVehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';

export interface WorldOptions {
  courseId: string;
  vehicleId: string;
}

export interface WorldEvent {
  kind: string;
  tick: number;
  playerId?: string;
  pos?: Vec3;
}

export interface WorldSnapshot {
  tick: number;
  vehicle: VehicleState;
}

export interface WorldDebug {
  forwardSpeed: number;
  wheelSurfaces: (Surface | null)[];
}

export interface World {
  readonly course: BuiltCourse;
  readonly vehicleConfig: VehicleConfig;
  // Advances one fixed tick and returns that tick's events.
  step(inputs: ReadonlyMap<string, PlayerInput>): WorldEvent[];
  snapshot(): WorldSnapshot;
  debug(): WorldDebug;
}

export function createWorld(rapier: Rapier, options: WorldOptions): World {
  const course = getCourse(options.courseId);
  const vehicleConfig = getVehicleConfig(options.vehicleId);
  const start = course.checkpoints[0];
  if (!start) throw new Error(`Course ${course.id} has no checkpoint`);

  const physics = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  const statics = buildStatics(rapier, physics, course);
  const vehicle = createVehicle(rapier, physics, vehicleConfig, start.spawn, statics.surfaceOf);
  let tick = 0;

  return {
    course,
    vehicleConfig,
    step(inputs) {
      // Until seats exist (step 3), the first input in the map drives the vehicle.
      const driver = inputs.values().next().value;
      vehicle.step({
        throttle: driver?.moveY ?? 0,
        steer: driver?.moveX ?? 0,
        brake: driver?.jump ?? false,
      });
      physics.step();
      tick += 1;
      return [];
    },
    snapshot: () => ({ tick, vehicle: vehicle.state() }),
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces() }),
  };
}
