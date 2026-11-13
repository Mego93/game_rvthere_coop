import type RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, TICK_DT, TICK_RATE } from './constants';
import type { Box, BuiltCourse, GroundBox, Placed } from './course';
import { getCourse } from './courses/index';
import { deepFreeze, type Pose } from './math';
import type { Rapier } from './rapier';
import { buildStatics } from './statics';
import { createVehicle, type Vehicle, type VehicleControls } from './vehicle';
import { getVehicleConfig, type VehicleId } from './vehicles';

export interface Rig {
  world: RAPIER.World;
  vehicle: Vehicle;
  // Advances the simulation by `seconds` with constant controls.
  run(seconds: number, controls?: Partial<VehicleControls>): void;
}

// A vehicle on the test ground, for tests and experiments that need no full game world.
export function createRig(rapier: Rapier, vehicleId: VehicleId, spawn: Pose, course: BuiltCourse = getCourse('test')): Rig {
  const world = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = TICK_DT;
  const statics = buildStatics(rapier, world, course);
  const vehicle = createVehicle(rapier, world, getVehicleConfig(vehicleId), spawn, statics.surfaceOf);
  return {
    world,
    vehicle,
    run(seconds, controls = {}) {
      for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
        vehicle.step({ throttle: 0, steer: 0, brake: false, ...controls });
        world.step();
        vehicle.afterPhysics();
      }
    },
  };
}

// A new, frozen course with the boxes added.
export function withBoxes(course: BuiltCourse, extra: { ground?: GroundBox[]; walls?: Box[] }): BuiltCourse {
  return deepFreeze({
    ...course,
    ground: [...course.ground, ...(extra.ground ?? [])],
    walls: [...course.walls, ...(extra.walls ?? [])],
  });
}

// A new, frozen course with the props added after the course's own.
export function withProps(course: BuiltCourse, props: Placed[]): BuiltCourse {
  return deepFreeze({ ...course, props: [...course.props, ...props] });
}
