import {
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_MAX_SLOPE_DEG,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PLAYER_STEP_HEIGHT,
  PLAYER_WALK_SPEED,
  PUSH_HEIGHT,
  SHOVE_MAX_DISTANCE,
  SHOVE_STEP,
} from './constants';
import type { BuiltCourse } from './course';
import { GROUP_GROUND, GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, sub, vec3, yawOf, type Quat, type Vec3 } from './math';
import { exitPoints } from './seats';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import type { Props } from './props';
import { contactPoint, pushForce, type PushIntent } from './push';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import type { Vehicle } from './vehicle';
import { createWalkController, stepWalk } from './walk';
import type { SeatConfig } from './vehicles';

export interface GroundRef {
  // 'vehicle' or a prop id.
  bodyId: string;
  // The feet, in that body's local frame.
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
  // The pushes found by the last stepOnFoot, cleared by the call (rule F4).
  takePushIntents(): PushIntent[];
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
const TIPPED_UP = Math.cos(degToRad(45));
const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function createPlayers(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, props: Props, course: BuiltCourse): Players {
  const worldGroups = groups(GROUP_WORLD, GROUP_WORLD);
  const capsule = new rapier.Capsule(CAPSULE_HALF_SEGMENT, PLAYER_RADIUS);
  const controller = createWalkController(rapier, physics);

  const entries = new Map<string, { state: PlayerState; collider: ReturnType<RapierWorld['createCollider']> }>();

  const placeCollider = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    const { pos } = entry.state;
    entry.collider.setTranslation({ x: pos.x, y: pos.y + PLAYER_HEIGHT / 2, z: pos.z });
  };

  // `body` is the first dynamic body the capsule overlaps: the vehicle, else the first unheld prop in course order.
  const touching = (feet: Vec3): { body: string | null; statics: boolean } => {
    const centre = { x: feet.x, y: feet.y + PLAYER_OVERLAP_LIFT + PLAYER_HEIGHT / 2, z: feet.z };
    let hitVehicle = false;
    let statics = false;
    const hitProps = new Set<string>();
    physics.intersectionsWithShape(
      centre,
      IDENTITY,
      capsule,
      (collider) => {
        const prop = props.byCollider(collider.handle);
        if (collider.handle === vehicle.chassisHandle) hitVehicle = true;
        else if (!prop) statics = true;
        else if (prop.heldBy === null) hitProps.add(prop.id);
        return true;
      },
      undefined,
      worldGroups,
    );
    const first = hitVehicle ? 'vehicle' : (props.all().find((prop) => hitProps.has(prop.id))?.id ?? null);
    return { body: first, statics };
  };

  const overlapsAnything = (feet: Vec3): boolean => {
    const found = touching(feet);
    return found.body !== null || found.statics;
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

  const bodyOf = (id: string): { body: RigidBody; half: Vec3 } => {
    if (id === 'vehicle') return { body: vehicle.body, half: vehicle.config.halfExtents };
    const prop = props.get(id)!;
    return { body: prop.body, half: prop.config.halfExtents };
  };

  // Horizontal velocity of a body at a point: linear plus angular, about its world centre of mass.
  const velocityAt = (body: RigidBody, point: Vec3): { x: number; z: number } => {
    const v = body.linvel();
    const w = body.angvel();
    const r = sub(point, body.worldCom());
    return { x: v.x + w.y * r.z - w.z * r.y, z: v.z + w.x * r.y - w.y * r.x };
  };

  const fromBodyFrame = (body: RigidBody, local: Vec3): Vec3 => add(body.translation(), rotate(body.rotation(), local));

  const toBodyFrame = (body: RigidBody, world: Vec3): Vec3 =>
    rotate(conjugate(body.rotation()), sub(world, body.translation()));

  // The ground a player was following is gone: its prop is held, or has fallen below the plane and is about to be reset.
  const groundLost = (ground: GroundRef): boolean => {
    const prop = props.get(ground.bodyId);
    return prop !== undefined && (prop.heldBy !== null || prop.body.translation().y < course.killPlaneY);
  };

  // A player whose feet sank a little into a body's top (it rose into them) is lifted onto it, not shoved off it.
  const liftOntoTop = (state: PlayerState, id: string): boolean => {
    const { body, half } = bodyOf(id);
    if (rotate(body.rotation(), vec3(0, 1, 0)).y < MIN_UP_NORMAL) return false;
    const local = toBodyFrame(body, state.pos);
    if (Math.abs(local.x) > half.x || Math.abs(local.z) > half.z || local.y < half.y - PLAYER_STEP_HEIGHT) return false;
    state.ground = { bodyId: id, localPos: vec3(local.x, half.y + PLAYER_CONTROLLER_OFFSET, local.z) };
    state.pos = fromBodyFrame(body, state.ground.localPos);
    state.grounded = true;
    return true;
  };

  const shoveOut = (state: PlayerState) => {
    const overlapped = touching(state.pos).body;
    if (overlapped === null) return;
    if (liftOntoTop(state, overlapped)) return;
    const { body } = bodyOf(overlapped);
    const centre = body.translation();
    let dx = state.pos.x - centre.x;
    let dz = state.pos.z - centre.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 1e-6) {
      const yaw = yawOf(body.rotation());
      dx = Math.cos(yaw);
      dz = -Math.sin(yaw);
      distance = 1;
    }
    for (let along = SHOVE_STEP; along <= SHOVE_MAX_DISTANCE + 1e-9; along += SHOVE_STEP) {
      const candidate = vec3(state.pos.x + (dx / distance) * along, state.pos.y, state.pos.z + (dz / distance) * along);
      const found = touching(candidate);
      if (found.statics) break;
      if (found.body === null) {
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
    const at = fromBodyFrame(vehicle.body, seat.pos);
    state.pos = vec3(at.x, at.y - PLAYER_HEIGHT / 2, at.z);
    state.walk = { x: 0, z: 0 };
    state.carry = { x: 0, z: 0 };
    state.vy = 0;
    state.ground = null;
    state.grounded = false;
    placeCollider(state.id);
  };

  let intents: PushIntent[] = [];

  // Rules H1 to H3: one intent per body this player walked into the side of.
  const gatherPushes = (state: PlayerState, wish: { x: number; z: number }, collisions: ReadonlyArray<{ handle: number; normalY: number }>) => {
    if (wish.x === 0 && wish.z === 0) return;
    const pushPoint = vec3(state.pos.x, state.pos.y + PUSH_HEIGHT, state.pos.z);
    const seen = new Set<string>();
    for (const hit of collisions) {
      if (hit.normalY >= MIN_UP_NORMAL) continue;
      const prop = props.byCollider(hit.handle);
      const bodyId = hit.handle === vehicle.chassisHandle ? 'vehicle' : prop && prop.heldBy === null ? prop.id : null;
      if (bodyId === null || bodyId === state.ground?.bodyId || seen.has(bodyId)) continue;
      seen.add(bodyId);
      const { body, half } = bodyOf(bodyId);
      const centre = body.translation();
      const rot = body.rotation();
      const contact = contactPoint(pushPoint, centre, rot, half);
      const tipped = bodyId === 'vehicle' && rotate(rot, vec3(0, 1, 0)).y < TIPPED_UP;
      const mass = bodyId === 'vehicle' ? vehicle.config.mass : props.get(bodyId)!.config.mass;
      const force = pushForce(wish, pushPoint, contact, mass, tipped);
      if (force) intents.push({ playerId: state.id, bodyId, point: contact, force });
    }
  };

  const move = (state: PlayerState, step: StepInputs) => {
    const { fields, pressed } = step;
    const wish = wishVelocity(state.yaw, finite(fields.moveX), finite(fields.moveY));
    const wasOn = state.ground?.bodyId ?? null;
    const entry = entries.get(state.id)!;
    const { collisions } = stepWalk(
      { controller, collider: entry.collider, groups: worldGroups },
      state,
      pressed.jump,
      wish,
    );
    let standingOn: string | null = null;
    if (state.grounded) {
      if (collisions.some((hit) => hit.handle === vehicle.chassisHandle && hit.normalY >= MIN_UP_NORMAL)) {
        standingOn = 'vehicle';
      } else {
        for (const hit of collisions) {
          const prop = props.byCollider(hit.handle);
          if (prop && prop.heldBy === null && hit.normalY >= MIN_UP_NORMAL) {
            standingOn = prop.id;
            break;
          }
        }
      }
    }
    state.ground = standingOn === null ? null : { bodyId: standingOn, localPos: toBodyFrame(bodyOf(standingOn).body, state.pos) };
    // Leaving a body takes its velocity, even on a tick the controller still reports grounded (the body's edge, or its snap).
    if (wasOn !== null && standingOn === null) state.carry = velocityAt(bodyOf(wasOn).body, state.pos);
    gatherPushes(state, wish, collisions);
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
      intents = [];
      for (const { state } of entries.values()) {
        const step = inputs.get(state.id) ?? NEUTRAL_STEP;
        state.yaw = finite(step.fields.yaw);
        state.pitch = finite(step.fields.pitch);
        if (state.seat !== null) {
          placeSeated(state);
          continue;
        }
        if (state.ground && groundLost(state.ground)) state.ground = null;
        if (state.ground) {
          state.pos = fromBodyFrame(bodyOf(state.ground.bodyId).body, state.ground.localPos);
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
    takePushIntents() {
      const taken = intents;
      intents = [];
      return taken;
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
