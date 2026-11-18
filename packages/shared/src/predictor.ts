import { GRAVITY, PLAYER_RADIUS, PROP_KINDS, TAJINE_SPEED, TICK_DT, type PropKind } from './constants';
import type { BuiltCourse } from './course';
import { GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, add, rotate, scale, type Quat, type Vec3 } from './math';
import { isCrouchedStance, sanitiseInput, type InputFields, type PlayerSnapshot } from './protocol';
import type { PropSnapshot } from './props';
import type { Rapier, RigidBody } from './rapier';
import { settleQueries } from './settle';
import { buildStatics } from './statics';
import type { VehicleConfig } from './vehicles';
import { capsuleHalfSegment, createWalkController, stepWalk } from './walk';

export interface PredictedState {
  pos: Vec3;
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
  crouched: boolean;
  slideTicks: number;
  slideCooldown: number;
  slideAir: number;
  slideDir: { x: number; z: number };
  launch: number;
  // Seconds of the tajine left; the predictor counts it down like the server.
  tajine: number;
  // Anything in the hands, and a prop in them; constant while the inputs replay (picking up comes from the server).
  carrying: boolean;
  holdsProp: boolean;
}

export interface Predictor {
  // Moves the vehicle stand-in to this pose (from the latest snapshot).
  setVehicle(pos: Vec3, rot: Quat): void;
  // Makes the prop stand-ins match this list: new ids are created, listed ones moved, absent ones removed.
  setProps(props: readonly PropSnapshot[]): void;
  // One tick: the next state for this input. `previous` holds the jump and crouch buttons of the input before.
  stepPlayer(state: PredictedState, input: InputFields, previous: { jump: boolean; crouch: boolean }): PredictedState;
  dispose(): void;
}

export const copyState = (state: PredictedState): PredictedState => ({
  pos: { ...state.pos },
  walk: { ...state.walk },
  carry: { ...state.carry },
  vy: state.vy,
  grounded: state.grounded,
  crouched: state.crouched,
  slideTicks: state.slideTicks,
  slideCooldown: state.slideCooldown,
  slideAir: state.slideAir,
  slideDir: { ...state.slideDir },
  launch: state.launch,
  tajine: state.tajine,
  carrying: state.carrying,
  holdsProp: state.holdsProp,
});

export const predictedFrom = (player: PlayerSnapshot): PredictedState =>
  copyState({
    pos: player.pos,
    walk: player.walk,
    carry: player.carry,
    vy: player.vy,
    grounded: player.grounded,
    crouched: isCrouchedStance(player.stance),
    slideTicks: player.slide?.ticks ?? 0,
    slideCooldown: player.slide?.cooldown ?? 0,
    slideAir: player.slide?.air ?? 0,
    slideDir: { x: player.slide?.dirX ?? 0, z: player.slide?.dirZ ?? 0 },
    launch: player.slide?.launch ?? 0,
    tajine: player.tajine ?? 0,
    carrying: player.hands !== null,
    holdsProp: player.hands !== null && player.hands !== 'hook',
  });

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
      rapier.ColliderDesc.capsule(capsuleHalfSegment(false), PLAYER_RADIUS).setCollisionGroups(
        groups(GROUP_PLAYER, 0),
      ),
    );
    const env = {
      controller,
      collider,
      groups: groups(GROUP_WORLD, GROUP_WORLD),
      physics,
      standing: new rapier.Capsule(capsuleHalfSegment(false), PLAYER_RADIUS),
    };
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
      stepPlayer(state, input, previous) {
        alive();
        const fields = sanitiseInput(input);
        const next: PredictedState = copyState(state);
        stepWalk(env, next, {
          jumpPressed: fields.jump && !previous.jump,
          crouchPressed: fields.crouch === true && !previous.crouch,
          crouch: fields.crouch === true,
          sprint: fields.sprint === true,
          carrying: state.carrying,
          holdsProp: state.holdsProp,
          moveX: fields.moveX,
          moveY: fields.moveY,
          yaw: fields.yaw,
          speedScale: state.tajine > 0 ? TAJINE_SPEED : 1,
        });
        next.tajine = Math.max(0, state.tajine - TICK_DT);
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
