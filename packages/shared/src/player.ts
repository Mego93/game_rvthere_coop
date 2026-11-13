import {
  GRAVITY,
  PLAYER_AIR_ACCEL,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_EYE_HEIGHT,
  PLAYER_GROUND_ACCEL,
  PLAYER_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_MAX_SLOPE_DEG,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PLAYER_SLIDE_SLOPE_DEG,
  PLAYER_SNAP_DISTANCE,
  PLAYER_STEP_HEIGHT,
  PLAYER_WALK_SPEED,
  SHOVE_MAX_DISTANCE,
  SHOVE_STEP,
  TICK_DT,
} from './constants';
import type { BuiltCourse } from './course';
import { GROUP_GROUND, GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, sub, vec3, yawOf, type Quat, type Vec3 } from './math';
import { exitPoints } from './seats';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import type { Rapier, RapierWorld } from './rapier';
import type { Vehicle } from './vehicle';
import type { SeatConfig } from './vehicles';

export interface GroundRef {
  bodyId: 'vehicle';
  // The feet, in the vehicle's local frame.
  localPos: Vec3;
}

export interface PlayerState {
  id: string;
  // The feet.
  pos: Vec3;
  yaw: number;
  pitch: number;
  // Own horizontal velocity, relative to the ground the player stands on.
  walk: { x: number; z: number };
  // Inherited horizontal velocity while airborne.
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
  ground: GroundRef | null;
  seat: string | null;
  // Seconds left below the kill plane.
  respawnIn: number | null;
}

export interface StepInputs {
  fields: InputFields;
  pressed: { jump: boolean; interact: boolean; drop: boolean };
}

export interface Players {
  // Placed by findSpawn(id).
  add(id: string): PlayerState;
  remove(id: string): void;
  get(id: string): PlayerState | undefined;
  // In the order the players were added.
  all(): PlayerState[];
  // One tick for every player, in join order, after the physics step. Players with no entry get neutral input.
  stepOnFoot(inputs: ReadonlyMap<string, StepInputs>): void;
  // Seating puts the player at the seat (`pos` is ignored); leaving puts them at `pos`, grounded, at rest.
  setSeat(id: string, seatId: string | null, pos?: Vec3): void;
  // Clears velocity, seat, ground and respawnIn; grounded false.
  teleport(id: string, pos: Vec3): void;
  // Rule S1.
  findSpawn(forId: string | null): Vec3;
  findExit(seat: SeatConfig): Vec3 | null;
  dispose(): void;
}

const NEUTRAL_STEP: StepInputs = {
  fields: NEUTRAL_INPUT,
  pressed: { jump: false, interact: false, drop: false },
};

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

export function wishVelocity(yaw: number, moveX: number, moveY: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  let x = -sin * moveY + cos * moveX;
  let z = -cos * moveY - sin * moveX;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return { x: x * PLAYER_WALK_SPEED, z: z * PLAYER_WALK_SPEED };
}

export function aimRay(pos: Vec3, yaw: number, pitch: number): { origin: Vec3; dir: Vec3 } {
  const cosPitch = Math.cos(pitch);
  return {
    origin: vec3(pos.x, pos.y + PLAYER_EYE_HEIGHT, pos.z),
    dir: vec3(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch),
  };
}

const CAPSULE_HALF_SEGMENT = PLAYER_HEIGHT / 2 - PLAYER_RADIUS;
const SPAWN_RAY_HEIGHT = 3;
const SPAWN_RAY_LENGTH = 6;
const MIN_UP_NORMAL = Math.cos(degToRad(PLAYER_MAX_SLOPE_DEG));
const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function createPlayers(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, course: BuiltCourse): Players {
  const worldGroups = groups(GROUP_WORLD, GROUP_WORLD);
  const capsule = new rapier.Capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS);
  const controller = physics.createCharacterController(PLAYER_CONTROLLER_OFFSET);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.enableAutostep(PLAYER_STEP_HEIGHT, PLAYER_RADIUS, false);
  controller.enableSnapToGround(PLAYER_SNAP_DISTANCE);
  controller.setMaxSlopeClimbAngle(degToRad(PLAYER_MAX_SLOPE_DEG));
  controller.setMinSlopeSlideAngle(degToRad(PLAYER_SLIDE_SLOPE_DEG));
  controller.setApplyImpulsesToDynamicBodies(false);

  const entries = new Map<string, { state: PlayerState; collider: ReturnType<RapierWorld['createCollider']> }>();

  const placeCollider = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    const { pos } = entry.state;
    entry.collider.setTranslation({ x: pos.x, y: pos.y + PLAYER_HEIGHT / 2, z: pos.z });
  };

  const touching = (feet: Vec3): { vehicle: boolean; statics: boolean } => {
    const centre = { x: feet.x, y: feet.y + PLAYER_OVERLAP_LIFT + PLAYER_HEIGHT / 2, z: feet.z };
    const found = { vehicle: false, statics: false };
    physics.intersectionsWithShape(
      centre,
      IDENTITY,
      capsule,
      (collider) => {
        if (collider.handle === vehicle.chassisHandle) found.vehicle = true;
        else found.statics = true;
        return true;
      },
      undefined,
      worldGroups,
    );
    return found;
  };

  const overlapsAnything = (feet: Vec3): boolean => {
    const found = touching(feet);
    return found.vehicle || found.statics;
  };

  const groundBelow = (x: number, z: number, fromY: number): number | null => {
    const ray = new rapier.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = physics.castRay(
      ray,
      SPAWN_RAY_LENGTH,
      true,
      undefined,
      groups(GROUP_WORLD, GROUP_GROUND),
    );
    return hit ? fromY - hit.timeOfImpact : null;
  };

  // The feet for a spot on the ground under (x, z): found as in rule S1, or null if there is none or the capsule would overlap.
  const standingSpot = (x: number, z: number): Vec3 | null => {
    const groundY = groundBelow(x, z, vehicle.body.translation().y + SPAWN_RAY_HEIGHT);
    if (groundY === null) return null;
    const feet = vec3(x, groundY + PLAYER_CONTROLLER_OFFSET, z);
    return overlapsAnything(feet) ? null : feet;
  };

  const findSpawn = (forId: string | null): Vec3 => {
    const body = vehicle.body.translation();
    const turn = quatFromAxisAngle(AXIS_Y, yawOf(vehicle.body.rotation()));
    const others = [...entries.values()].filter(({ state }) => state.id !== forId && state.seat === null);
    for (const slot of vehicle.config.spawnSlots) {
      const at = add(body, rotate(turn, vec3(slot.x, 0, slot.z)));
      const feet = standingSpot(at.x, at.z);
      if (feet === null) continue;
      if (others.some(({ state }) => Math.hypot(state.pos.x - feet.x, state.pos.z - feet.z) < 2 * PLAYER_RADIUS)) continue;
      return feet;
    }
    const fallback = course.checkpoints[0]?.spawn.pos ?? vec3(0, 0, 0);
    return vec3(fallback.x, fallback.y, fallback.z);
  };

  const findExit = (seat: SeatConfig): Vec3 | null => {
    for (const point of exitPoints(vehicle.config, seat, vehicle.body.translation(), vehicle.body.rotation())) {
      const feet = standingSpot(point.x, point.z);
      if (feet !== null) return feet;
    }
    return null;
  };

  const restAt = (state: PlayerState, pos: Vec3) => {
    state.pos = vec3(pos.x, pos.y, pos.z);
    state.walk = { x: 0, z: 0 };
    state.carry = { x: 0, z: 0 };
    state.vy = 0;
    state.ground = null;
    state.respawnIn = null;
  };

  // Horizontal velocity of the vehicle at a point: linear plus angular, about the body's world centre of mass.
  const vehicleVelocityAt = (point: Vec3): { x: number; z: number } => {
    const v = vehicle.body.linvel();
    const w = vehicle.body.angvel();
    const r = sub(point, vehicle.body.worldCom());
    return { x: v.x + w.y * r.z - w.z * r.y, z: v.z + w.x * r.y - w.y * r.x };
  };

  const standsOnVehicle = (): boolean => {
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const hit = controller.computedCollision(i);
      if (hit?.collider?.handle === vehicle.chassisHandle && hit.normal1.y >= MIN_UP_NORMAL) return true;
    }
    return false;
  };

  const fromVehicleFrame = (local: Vec3): Vec3 =>
    add(vehicle.body.translation(), rotate(vehicle.body.rotation(), local));

  const toVehicleFrame = (world: Vec3): Vec3 =>
    rotate(conjugate(vehicle.body.rotation()), sub(world, vehicle.body.translation()));

  // A player whose feet sank a little into the roof (the chassis rose into them) is lifted onto it, not shoved off it.
  const liftOntoRoof = (state: PlayerState): boolean => {
    if (rotate(vehicle.body.rotation(), vec3(0, 1, 0)).y < MIN_UP_NORMAL) return false;
    const half = vehicle.config.halfExtents;
    const local = toVehicleFrame(state.pos);
    if (Math.abs(local.x) > half.x || Math.abs(local.z) > half.z || local.y < half.y - PLAYER_STEP_HEIGHT) return false;
    state.ground = { bodyId: 'vehicle', localPos: vec3(local.x, half.y + PLAYER_CONTROLLER_OFFSET, local.z) };
    state.pos = fromVehicleFrame(state.ground.localPos);
    state.grounded = true;
    return true;
  };

  const shoveOut = (state: PlayerState) => {
    if (!touching(state.pos).vehicle) return;
    if (liftOntoRoof(state)) return;
    const centre = vehicle.body.translation();
    let dx = state.pos.x - centre.x;
    let dz = state.pos.z - centre.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 1e-6) {
      const yaw = yawOf(vehicle.body.rotation());
      dx = Math.cos(yaw);
      dz = -Math.sin(yaw);
      distance = 1;
    }
    for (let along = SHOVE_STEP; along <= SHOVE_MAX_DISTANCE + 1e-9; along += SHOVE_STEP) {
      const candidate = vec3(state.pos.x + (dx / distance) * along, state.pos.y, state.pos.z + (dz / distance) * along);
      const found = touching(candidate);
      if (found.statics) break;
      if (!found.vehicle) {
        state.pos = candidate;
        return;
      }
    }
    state.pos = findSpawn(state.id);
    state.vy = 0;
    state.walk = { x: 0, z: 0 };
    state.carry = { x: 0, z: 0 };
  };

  const seatConfig = (seatId: string): SeatConfig | undefined => vehicle.config.seats.find((seat) => seat.id === seatId);

  // Rule B5: the seat's world position, less half the player's height.
  const placeSeated = (state: PlayerState) => {
    const seat = state.seat === null ? undefined : seatConfig(state.seat);
    if (!seat) return;
    const at = fromVehicleFrame(seat.pos);
    state.pos = vec3(at.x, at.y - PLAYER_HEIGHT / 2, at.z);
    state.walk = { x: 0, z: 0 };
    state.carry = { x: 0, z: 0 };
    state.vy = 0;
    state.ground = null;
    state.grounded = false;
    placeCollider(state.id);
  };

  const move = (state: PlayerState, step: StepInputs) => {
    const { fields, pressed } = step;
    const wish = wishVelocity(state.yaw, finite(fields.moveX), finite(fields.moveY));
    const wasOnVehicle = state.ground !== null;
    if (pressed.jump && state.grounded) {
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

    const entry = entries.get(state.id)!;
    const desired = {
      x: (state.walk.x + state.carry.x) * TICK_DT,
      y: state.vy * TICK_DT,
      z: (state.walk.z + state.carry.z) * TICK_DT,
    };
    controller.computeColliderMovement(entry.collider, desired, undefined, worldGroups);
    const moved = controller.computedMovement();
    state.pos = vec3(state.pos.x + moved.x, state.pos.y + moved.y, state.pos.z + moved.z);
    state.grounded = controller.computedGrounded();
    state.ground = state.grounded && standsOnVehicle() ? { bodyId: 'vehicle', localPos: toVehicleFrame(state.pos) } : null;
    if (state.grounded) {
      state.vy = 0;
      state.carry = { x: 0, z: 0 };
    } else if (wasOnVehicle) {
      state.carry = vehicleVelocityAt(state.pos);
    }
    placeCollider(state.id);
  };

  return {
    add(id) {
      const existing = entries.get(id);
      if (existing) return existing.state;
      const pos = findSpawn(id);
      const state: PlayerState = {
        id,
        pos,
        yaw: 0,
        pitch: 0,
        walk: { x: 0, z: 0 },
        carry: { x: 0, z: 0 },
        vy: 0,
        grounded: true,
        ground: null,
        seat: null,
        respawnIn: null,
      };
      const collider = physics.createCollider(
        rapier.ColliderDesc.capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS)
          .setTranslation(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z)
          .setCollisionGroups(groups(GROUP_PLAYER, 0)),
      );
      entries.set(id, { state, collider });
      return state;
    },
    remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      physics.removeCollider(entry.collider, false);
      entries.delete(id);
    },
    get: (id) => entries.get(id)?.state,
    all: () => [...entries.values()].map(({ state }) => state),
    stepOnFoot(inputs) {
      for (const { state } of entries.values()) {
        const step = inputs.get(state.id) ?? NEUTRAL_STEP;
        state.yaw = finite(step.fields.yaw);
        state.pitch = finite(step.fields.pitch);
        if (state.seat !== null) {
          placeSeated(state);
          continue;
        }
        if (state.ground) {
          state.pos = fromVehicleFrame(state.ground.localPos);
          placeCollider(state.id);
        } else {
          shoveOut(state);
          placeCollider(state.id);
        }
        move(state, step);
      }
    },
    setSeat(id, seatId, pos) {
      const state = entries.get(id)?.state;
      if (!state) return;
      if (seatId === null) {
        state.seat = null;
        restAt(state, pos ?? state.pos);
        state.grounded = true;
        placeCollider(id);
        return;
      }
      if (!seatConfig(seatId)) return;
      state.seat = seatId;
      state.respawnIn = null;
      placeSeated(state);
    },
    teleport(id, pos) {
      const state = entries.get(id)?.state;
      if (!state) return;
      restAt(state, pos);
      state.seat = null;
      state.grounded = false;
      placeCollider(id);
    },
    findSpawn,
    findExit,
    dispose() {
      for (const { collider } of entries.values()) physics.removeCollider(collider, false);
      entries.clear();
      physics.removeCharacterController(controller);
    },
  };
}
