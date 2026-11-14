import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, PROP_KINDS, TICK_DT, type PropKind } from './constants';
import type { BuiltCourse } from './course';
import { GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, add, rotate, scale, type Quat, type Vec3 } from './math';
import { wishVelocity } from './player';
import { sanitiseInput, type InputFields, type PlayerSnapshot } from './protocol';
import type { PropSnapshot } from './props';
import type { Rapier, RigidBody } from './rapier';
import { settleQueries } from './settle';
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
  // Makes the prop stand-ins match this list: new ids are created, listed ones moved, absent ones removed.
  setProps(props: readonly PropSnapshot[]): void;
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
    const settle = () => settleQueries(rapier, physics, () => standIn.translation(), TICK_DT);
    const placeBody = (body: RigidBody, pos: Vec3, rot: Quat) => {
      body.setTranslation(pos, false);
      body.setRotation(rot, false);
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    };
    const place = (pos: Vec3, rot: Quat) => {
      placeBody(standIn, pos, rot);
      settle();
    };
    const start = course.checkpoints[0];
    if (start) place(add(start.spawn.pos, rotate(start.spawn.rot, scale(AXIS_Y, vehicle.rideHeight))), start.spawn.rot);
    else settle();

    const propBodies = new Map<string, { body: RigidBody; kind: string }>();
    const removeProp = (id: string) => {
      const entry = propBodies.get(id);
      if (!entry) return;
      physics.removeRigidBody(entry.body);
      propBodies.delete(id);
    };

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
      setProps(props) {
        alive();
        const listed = new Set<string>();
        for (const prop of props) {
          if (!Object.hasOwn(PROP_KINDS, prop.kind)) continue;
          listed.add(prop.id);
          let entry = propBodies.get(prop.id);
          if (entry && entry.kind !== prop.kind) {
            removeProp(prop.id);
            entry = undefined;
          }
          if (!entry) {
            const half = PROP_KINDS[prop.kind as PropKind].halfExtents;
            const body = physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setGravityScale(0).setCanSleep(false));
            physics.createCollider(
              rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)),
              body,
            );
            entry = { body, kind: prop.kind };
            propBodies.set(prop.id, entry);
          }
          placeBody(entry.body, prop.pos, prop.rot);
        }
        for (const id of [...propBodies.keys()]) if (!listed.has(id)) removeProp(id);
        settle();
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
