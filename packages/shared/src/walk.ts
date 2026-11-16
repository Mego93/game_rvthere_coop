import type RAPIER from '@dimforge/rapier3d-compat';
import {
  GRAVITY,
  PLAYER_AIR_ACCEL,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_CROUCH_SPEED,
  PLAYER_GROUND_ACCEL,
  PLAYER_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_KNEESLIDE_AIR_TICKS,
  PLAYER_KNEESLIDE_COOLDOWN,
  PLAYER_KNEESLIDE_HOLD,
  PLAYER_KNEESLIDE_MIN_SPEED,
  PLAYER_KNEESLIDE_SPEED,
  PLAYER_KNEESLIDE_STEER,
  PLAYER_KNEESLIDE_STOP_SPEED,
  PLAYER_KNEESLIDE_TIME,
  PLAYER_MAX_SLOPE_DEG,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PLAYER_SLIDE_SLOPE_DEG,
  PLAYER_SNAP_DISTANCE,
  PLAYER_SPRINT_SPEED,
  PLAYER_STEP_HEIGHT,
  PLAYER_WALK_SPEED,
  TICK_DT,
  TICK_RATE,
} from './constants';
import { IDENTITY, degToRad, vec3, type Vec3 } from './math';
import type { Rapier, RapierWorld } from './rapier';

export interface WalkState {
  // The feet.
  pos: Vec3;
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
  // True while crouching or sliding: the capsule is PLAYER_CROUCH_HEIGHT tall.
  crouched: boolean;
  // Whole ticks left in the slide, then of the cooldown that follows; air is the ticks spent off the ground during the slide.
  slideTicks: number;
  slideCooldown: number;
  slideAir: number;
  slideDir: { x: number; z: number };
  // Horizontal speed at the take-off of a slide jump, kept as the air speed floor until landing; 0 otherwise.
  launch: number;
}

export interface WalkEnv {
  controller: RAPIER.KinematicCharacterController;
  // The player's capsule.
  collider: RAPIER.Collider;
  // Query groups.
  groups: number;
}

export interface StepEnv extends WalkEnv {
  physics: RapierWorld;
  // The standing capsule, for the headroom test.
  standing: RAPIER.Capsule;
}

export interface WalkInput {
  jumpPressed: boolean;
  crouchPressed: boolean;
  crouch: boolean;
  sprint: boolean;
  // Anything in the hands: blocks sprint and slide.
  carrying: boolean;
  // A prop in the hands: blocks crouch too.
  holdsProp: boolean;
  moveX: number;
  moveY: number;
  yaw: number;
}

export interface WalkResult {
  // The vy the move used, after the jump and gravity.
  moveVy: number;
  collisions: ReadonlyArray<{ handle: number; normalY: number; normal: Vec3 }>;
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

export const capsuleHeight = (crouched: boolean): number => (crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT);
export const capsuleHalfSegment = (crouched: boolean): number => capsuleHeight(crouched) / 2 - PLAYER_RADIUS;

export const KNEESLIDE_TICKS = Math.round(PLAYER_KNEESLIDE_TIME * TICK_RATE);
const KNEESLIDE_COOLDOWN_TICKS = Math.round(PLAYER_KNEESLIDE_COOLDOWN * TICK_RATE);

// Rule P3 for the move input: the unit-or-shorter horizontal direction the player wants, in world axes.
export function wishDirection(yaw: number, moveX: number, moveY: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let x = -sin * moveY + cos * moveX;
  let z = -cos * moveY - sin * moveX;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return { x, z };
}

// Horizontal speed of a slide that has run `elapsed` ticks: held, then falling to the crouch speed.
export function kneeslideSpeed(elapsed: number): number {
  const t = elapsed * TICK_DT;
  if (t < PLAYER_KNEESLIDE_HOLD) return PLAYER_KNEESLIDE_SPEED;
  const along = Math.min(1, (t - PLAYER_KNEESLIDE_HOLD) / (PLAYER_KNEESLIDE_TIME - PLAYER_KNEESLIDE_HOLD));
  return PLAYER_KNEESLIDE_SPEED + (PLAYER_CROUCH_SPEED - PLAYER_KNEESLIDE_SPEED) * along;
}

export const placeCapsule = (collider: RAPIER.Collider, pos: Vec3, crouched: boolean) => {
  const half = capsuleHalfSegment(crouched);
  if (collider.halfHeight() !== half) collider.setHalfHeight(half);
  collider.setTranslation({ x: pos.x, y: pos.y + capsuleHeight(crouched) / 2, z: pos.z });
};

// Whether the standing capsule fits at these feet: lifted like `touching()`, so the ground is not an overlap.
export function standingFits(env: StepEnv, feet: Vec3): boolean {
  let blocked = false;
  env.physics.intersectionsWithShape(
    { x: feet.x, y: feet.y + PLAYER_OVERLAP_LIFT + PLAYER_HEIGHT / 2, z: feet.z },
    IDENTITY,
    env.standing,
    () => {
      blocked = true;
      return false;
    },
    undefined,
    env.groups,
  );
  return !blocked;
}

const endSlide = (state: WalkState) => {
  state.slideTicks = 0;
  state.slideAir = 0;
  state.slideCooldown = KNEESLIDE_COOLDOWN_TICKS;
};

// Turns `dir` toward `target` by at most `maxAngle` radians, keeping it a unit vector.
function steer(dir: { x: number; z: number }, target: { x: number; z: number }, maxAngle: number): { x: number; z: number } {
  const diff = Math.atan2(dir.x * target.z - dir.z * target.x, dir.x * target.x + dir.z * target.z);
  const angle = Math.atan2(dir.z, dir.x) + Math.max(-maxAngle, Math.min(maxAngle, diff));
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

// One tick of rule P3: stance, jump, gravity, wish acceleration, move.
export function stepWalk(env: StepEnv, state: WalkState, input: WalkInput): WalkResult {
  const { controller, collider } = env;
  const wish = wishDirection(input.yaw, input.moveX, input.moveY);
  const wantCrouch = input.crouch && !input.holdsProp;
  const wantSprint = input.sprint && input.moveY > 0 && !input.carrying;

  if (state.slideTicks === 0 && state.slideCooldown > 0) {
    state.slideCooldown -= 1;
    // Keeps the state what a snapshot without a slide reads back as.
    if (state.slideCooldown === 0) state.slideDir = { x: 0, z: 0 };
  }
  if (state.slideTicks > 0 && input.holdsProp) endSlide(state);
  if (state.slideTicks === 0) {
    const speed = Math.hypot(state.walk.x, state.walk.z);
    const starts =
      input.crouchPressed && !input.holdsProp && wantSprint && !state.crouched && state.grounded && state.slideCooldown === 0 && speed >= PLAYER_KNEESLIDE_MIN_SPEED;
    if (starts) {
      state.slideTicks = KNEESLIDE_TICKS;
      state.slideAir = 0;
      state.slideDir = { x: state.walk.x / speed, z: state.walk.z / speed };
      state.crouched = true;
    } else if (wantCrouch) {
      if (state.grounded || state.crouched) state.crouched = true;
    } else if (state.crouched && standingFits(env, state.pos)) {
      state.crouched = false;
    }
  }
  const sliding = state.slideTicks > 0;
  if (sliding) {
    if (wish.x !== 0 || wish.z !== 0) {
      const length = Math.hypot(wish.x, wish.z);
      state.slideDir = steer(state.slideDir, { x: wish.x / length, z: wish.z / length }, PLAYER_KNEESLIDE_STEER * TICK_DT);
    }
    const speed = kneeslideSpeed(KNEESLIDE_TICKS - state.slideTicks);
    state.walk = { x: state.slideDir.x * speed, z: state.slideDir.z * speed };
  }

  placeCapsule(collider, state.pos, state.crouched);
  let slideJump = false;
  if (input.jumpPressed && state.grounded && (!state.crouched || standingFits(env, state.pos))) {
    state.vy = PLAYER_JUMP_SPEED;
    if (sliding) {
      slideJump = true;
      state.launch = Math.hypot(state.walk.x, state.walk.z);
      endSlide(state);
    }
    if (!wantCrouch) {
      state.crouched = false;
      placeCapsule(collider, state.pos, false);
    }
  }
  state.vy -= GRAVITY * TICK_DT;
  const moveVy = state.vy;

  // A slide, and a slide jump on its take-off tick, keep the slide velocity; from the next tick the air acceleration applies.
  if (!sliding) {
    const stanceSpeed = state.crouched ? PLAYER_CROUCH_SPEED : wantSprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
    const speed = state.grounded ? stanceSpeed : Math.max(stanceSpeed, state.launch);
    const maxChange = (state.grounded ? PLAYER_GROUND_ACCEL : PLAYER_AIR_ACCEL) * TICK_DT;
    const dx = wish.x * speed - state.walk.x;
    const dz = wish.z * speed - state.walk.z;
    const gap = Math.hypot(dx, dz);
    if (gap <= maxChange) {
      state.walk = { x: wish.x * speed, z: wish.z * speed };
    } else {
      state.walk = { x: state.walk.x + (dx / gap) * maxChange, z: state.walk.z + (dz / gap) * maxChange };
    }
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
    state.launch = 0;
    state.vy = 0;
    state.carry = { x: 0, z: 0 };
  }
  if (sliding && !slideJump) {
    state.slideAir = state.grounded ? 0 : state.slideAir + 1;
    state.slideTicks -= 1;
    const speed = Math.hypot(moved.x, moved.z) / TICK_DT;
    if (state.slideTicks === 0 || speed < PLAYER_KNEESLIDE_STOP_SPEED || state.slideAir > PLAYER_KNEESLIDE_AIR_TICKS) endSlide(state);
  }
  placeCapsule(collider, state.pos, state.crouched);

  const collisions: { handle: number; normalY: number; normal: Vec3 }[] = [];
  for (let i = 0; i < controller.numComputedCollisions(); i++) {
    const hit = controller.computedCollision(i);
    if (hit?.collider) collisions.push({ handle: hit.collider.handle, normalY: hit.normal1.y, normal: vec3(hit.normal1.x, hit.normal1.y, hit.normal1.z) });
  }
  return { moveVy, collisions };
}
