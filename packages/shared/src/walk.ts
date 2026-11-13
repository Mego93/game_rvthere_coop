import type RAPIER from '@dimforge/rapier3d-compat';
import {
  GRAVITY,
  PLAYER_AIR_ACCEL,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_GROUND_ACCEL,
  PLAYER_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_MAX_SLOPE_DEG,
  PLAYER_RADIUS,
  PLAYER_SLIDE_SLOPE_DEG,
  PLAYER_SNAP_DISTANCE,
  PLAYER_STEP_HEIGHT,
  TICK_DT,
} from './constants';
import { degToRad, vec3, type Vec3 } from './math';
import type { Rapier, RapierWorld } from './rapier';

export interface WalkState {
  // The feet.
  pos: Vec3;
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
}

export interface WalkEnv {
  controller: RAPIER.KinematicCharacterController;
  // The player's capsule.
  collider: RAPIER.Collider;
  // Query groups.
  groups: number;
}

export interface WalkResult {
  collisions: ReadonlyArray<{ handle: number; normalY: number }>;
}

export function createWalkController(_rapier: Rapier, physics: RapierWorld): RAPIER.KinematicCharacterController {
  const controller = physics.createCharacterController(PLAYER_CONTROLLER_OFFSET);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.enableAutostep(PLAYER_STEP_HEIGHT, PLAYER_RADIUS, false);
  controller.enableSnapToGround(PLAYER_SNAP_DISTANCE);
  controller.setMaxSlopeClimbAngle(degToRad(PLAYER_MAX_SLOPE_DEG));
  controller.setMinSlopeSlideAngle(degToRad(PLAYER_SLIDE_SLOPE_DEG));
  controller.setApplyImpulsesToDynamicBodies(false);
  return controller;
}

const placeCollider = (collider: RAPIER.Collider, pos: Vec3) =>
  collider.setTranslation({ x: pos.x, y: pos.y + PLAYER_HEIGHT / 2, z: pos.z });

// One tick of rule P3: jump, gravity, wish acceleration, move.
export function stepWalk(env: WalkEnv, state: WalkState, pressedJump: boolean, wish: { x: number; z: number }): WalkResult {
  const { controller, collider } = env;
  placeCollider(collider, state.pos);
  if (pressedJump && state.grounded) {
    state.vy = PLAYER_JUMP_SPEED;
  }
  state.vy -= GRAVITY * TICK_DT;

  const maxChange = (state.grounded ? PLAYER_GROUND_ACCEL : PLAYER_AIR_ACCEL) * TICK_DT;
  const dx = wish.x - state.walk.x;
  const dz = wish.z - state.walk.z;
  const gap = Math.hypot(dx, dz);
  if (gap <= maxChange) {
    state.walk = { x: wish.x, z: wish.z };
  } else {
    state.walk = { x: state.walk.x + (dx / gap) * maxChange, z: state.walk.z + (dz / gap) * maxChange };
  }

  const desired = {
    x: (state.walk.x + state.carry.x) * TICK_DT,
    y: state.vy * TICK_DT,
    z: (state.walk.z + state.carry.z) * TICK_DT,
  };
  controller.computeColliderMovement(collider, desired, undefined, env.groups);
  const moved = controller.computedMovement();
  state.pos = vec3(state.pos.x + moved.x, state.pos.y + moved.y, state.pos.z + moved.z);
  state.grounded = controller.computedGrounded();
  if (state.grounded) {
    state.vy = 0;
    state.carry = { x: 0, z: 0 };
  }
  placeCollider(collider, state.pos);

  const collisions: { handle: number; normalY: number }[] = [];
  for (let i = 0; i < controller.numComputedCollisions(); i++) {
    const hit = controller.computedCollision(i);
    if (hit?.collider) collisions.push({ handle: hit.collider.handle, normalY: hit.normal1.y });
  }
  return { collisions };
}
