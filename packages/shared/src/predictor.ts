import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, TICK_DT } from './constants';
import type { BuiltCourse } from './course';
import { GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, add, rotate, scale, type Quat, type Vec3 } from './math';
import { wishVelocity } from './player';
import { sanitiseInput, type InputFields, type PlayerSnapshot } from './protocol';
import type { Rapier } from './rapier';
import { buildStatics } from './statics';
import type { VehicleConfig } from './vehicles';
import { createWalkController, stepWalk } from './walk';

export interface PredictedState {
  pos: Vec3;
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
}

export interface Predictor {
  // Moves the vehicle stand-in to this pose (from the latest snapshot).
  setVehicle(pos: Vec3, rot: Quat): void;
  // One tick: the next state for this input. `previousJump` is the jump button of the input before.
  stepPlayer(state: PredictedState, input: InputFields, previousJump: boolean): PredictedState;
  dispose(): void;
}

const copyState = (state: PredictedState): PredictedState => ({
  pos: { ...state.pos },
  walk: { ...state.walk },
  carry: { ...state.carry },
  vy: state.vy,
  grounded: state.grounded,
});

export const predictedFrom = (player: PlayerSnapshot): PredictedState => copyState(player);

export function createPredictor(rapier: Rapier, course: BuiltCourse, vehicle: VehicleConfig): Predictor {
  const physics = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  try {
    buildStatics(rapier, physics, course);

    // Dynamic at zero gravity: the walking controller's autostep skips dynamic bodies, and a fixed body is not found after a zero step.
    const h = vehicle.halfExtents;
    const standIn = physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setGravityScale(0).setCanSleep(false));
    physics.createCollider(
      rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)),
      standIn,
    );
    const settle = () => {
      // Zero-length steps: queries see nothing until the broad phase has run. After a move the first one only drops the old position, so two.
      physics.timestep = 0;
      physics.step();
      physics.step();
      physics.timestep = TICK_DT;
    };
    const place = (pos: Vec3, rot: Quat) => {
      standIn.setTranslation(pos, false);
      standIn.setRotation(rot, false);
      standIn.setLinvel({ x: 0, y: 0, z: 0 }, false);
      standIn.setAngvel({ x: 0, y: 0, z: 0 }, false);
      settle();
    };
    const start = course.checkpoints[0];
    if (start) place(add(start.spawn.pos, rotate(start.spawn.rot, scale(AXIS_Y, vehicle.rideHeight))), start.spawn.rot);
    else settle();

    const controller = createWalkController(rapier, physics);
    const collider = physics.createCollider(
      rapier.ColliderDesc.capsule(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS).setCollisionGroups(
        groups(GROUP_PLAYER, 0),
      ),
    );
    const env = { controller, collider, groups: groups(GROUP_WORLD, GROUP_WORLD) };
    let disposed = false;
    const alive = () => {
      if (disposed) throw new Error('Predictor is disposed');
    };

    return {
      setVehicle(pos, rot) {
        alive();
        place(pos, rot);
      },
      stepPlayer(state, input, previousJump) {
        alive();
        const fields = sanitiseInput(input);
        const next: PredictedState = copyState(state);
        stepWalk(env, next, fields.jump && !previousJump, wishVelocity(fields.yaw, fields.moveX, fields.moveY));
        return next;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        physics.free();
      },
    };
  } catch (error) {
    physics.free();
    throw error;
  }
}
