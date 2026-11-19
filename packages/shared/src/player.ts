import {
  DOWNED_TIMEOUT,
  FALL_DAMAGE,
  FALL_DAMAGE_SPEED,
  HIT_COOLDOWN,
  PROP_HIT_DAMAGE,
  PROP_HIT_SPEED,
  VEHICLE_HIT_DAMAGE,
  VEHICLE_HIT_SPEED,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_SLOPE_DEG,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PLAYER_REVIVE_HEALTH,
  PLAYER_STEP_HEIGHT,
  PLAYER_WALK_SPEED,
  TREEDENT_SPEED,
  HOLD_OFFSET,
  SPAWN_WALL_RAY_HEIGHT,
  PUSH_HEIGHT,
  PUSH_TIPPED_DEG,
  SHOVE_MAX_DISTANCE,
  SHOVE_STEP,
  THROW_HEAD_CLEARANCE,
  THROW_SPEED,
  TICK_DT,
  GUN_AMMO_START,
  type ItemKind,
} from './constants';
import type { BuiltCourse } from './course';
import type { PlayerHold } from './holds';
import { damageAbove, relativeSpeed } from './health';
import { GROUP_GROUND, GROUP_PLAYER, GROUP_STATIC, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, sub, vec3, yawOf, type Pose, type Quat, type Vec3 } from './math';
import { exitPoints } from './seats';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import type { Props } from './props';
import { contactPoint, pushForce, type PushIntent } from './push';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import type { Vehicle } from './vehicle';
import { capsuleHalfSegment, capsuleHeight, createWalkController, placeCapsule, stepWalk, wishDirection } from './walk';
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
  // Crouching or sliding: the capsule is short and the eye low.
  crouched: boolean;
  // The slide's whole ticks left, its cooldown, its ticks in the air and its direction; see WalkState.
  slideTicks: number;
  slideCooldown: number;
  slideAir: number;
  slideDir: { x: number; z: number };
  launch: number;
  // The admin's fly toggle; cleared while seated.
  flying: boolean;
  // Set when flight ends so the fall that follows costs nothing; cleared on landing.
  noFall: boolean;
  ground: GroundRef | null;
  seat: string | null;
  // The id of the prop being held, or 'hook' for the winch hook.
  hands: 'hook' | string | null;
  // Seconds left below the kill plane.
  respawnIn: number | null;
  inventory: [ItemKind | null, ItemKind | null, ItemKind | null];
  slot: 0 | 1 | 2;
  hold: PlayerHold | null;
  // Seconds of the treedent left, 0 when not chewed; the three power-up timers run down while seated too.
  treedent: number;
  // The handgun every player starts with, its rounds and the seconds before the next shot.
  gun: boolean;
  ammo: number;
  gunCooldown: number;
  // Fromage blanc: damage it still absorbs, and the seconds it still lasts.
  shield: number;
  shieldTime: number;
  // Seconds of Koke Zero left.
  koke: number;
  // 0..100.
  health: number;
  // Seconds left before respawn while downed, else null.
  downed: number | null;
  // Seconds left per body id before it may hurt this player again.
  hitCooldown: Map<string, number>;
}

// Ends every power-up: down, respawn, a restart.
export function clearPowerUps(state: PlayerState): void {
  state.treedent = 0;
  state.shield = 0;
  state.shieldTime = 0;
  state.koke = 0;
}

function tickPowerUps(state: PlayerState): void {
  state.treedent = Math.max(0, state.treedent - TICK_DT);
  state.koke = Math.max(0, state.koke - TICK_DT);
  state.shieldTime = Math.max(0, state.shieldTime - TICK_DT);
  if (state.shieldTime <= 0) state.shield = 0;
}

export interface PendingDamage {
  playerId: string;
  source: 'fall' | 'vehicle' | 'prop' | 'debug';
  amount: number;
}

export interface StepInputs {
  fields: InputFields;
  pressed: { jump: boolean; interact: boolean; drop: boolean; crouch: boolean };
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
  // Clears velocity, seat, ground, hold and respawnIn; grounded false.
  teleport(id: string, pos: Vec3): void;
  // The pushes found by the last stepOnFoot, cleared by the call (rule F4).
  takePushIntents(): PushIntent[];
  // The falls found by the last stepOnFoot (rule H3), cleared by the call.
  takeDamage(): PendingDamage[];
  // Rule H5: the held prop is released in place, the hold is cleared and the timer starts. The world drops the hook first.
  setDowned(id: string): void;
  // Rule H10: health set, downed cleared.
  revive(id: string, health: number): void;
  // Rules H6 and H8: at findSpawn, health PLAYER_REVIVE_HEALTH, no downed, no hit cooldowns. Returns the spot.
  respawn(id: string): Vec3;
  // Rule K2: false when the player is seated, has full hands, or the prop is held or unknown.
  pickUp(id: string, propId: string): boolean;
  // Rule K3, along the given aim; does nothing with empty hands.
  throwHeld(id: string, yaw: number, pitch: number): void;
  // Rule K6: the held prop returns to its spawn. Nothing for the hook.
  resetHeld(id: string): void;
  // The winch hook in or out of the hands; the world owns the cable's side of it.
  setHands(id: string, hands: 'hook' | null): void;
  // Where the player's held prop is placed: the hold pose, or null with empty hands.
  holdPose(id: string): Pose | null;
  // The inventory, copied in; the selected slot is the client's.
  restoreInventory(id: string, inventory: readonly (ItemKind | null)[]): void;
  // Rule S1.
  findSpawn(forId: string | null): Vec3;
  // The feet for the ground under (x, z) found by a ray from `fromY`, or null if there is none or the capsule would overlap something.
  standAt(x: number, z: number, fromY: number): Vec3 | null;
  // Where findSpawn falls back to when no slot is valid; the last checkpoint's spawn.
  setFallbackSpawn(pos: Vec3): void;
  findExit(seat: SeatConfig): Vec3 | null;
  dispose(): void;
}

const NEUTRAL_STEP: StepInputs = {
  fields: NEUTRAL_INPUT,
  pressed: { jump: false, interact: false, drop: false, crouch: false },
};

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

export function holdPoseAt(feet: Vec3, yaw: number): Pose {
  const rot = quatFromAxisAngle(AXIS_Y, yaw);
  return { pos: add(feet, rotate(rot, HOLD_OFFSET)), rot };
}

// The walking-speed wish: what pushing a body is based on, whatever the stance.
export function wishVelocity(yaw: number, moveX: number, moveY: number): { x: number; z: number } {
  const dir = wishDirection(yaw, moveX, moveY);
  return { x: dir.x * PLAYER_WALK_SPEED, z: dir.z * PLAYER_WALK_SPEED };
}

export function aimRay(pos: Vec3, yaw: number, pitch: number, crouched = false): { origin: Vec3; dir: Vec3 } {
  const cosPitch = Math.cos(pitch);
  return {
    origin: vec3(pos.x, pos.y + (crouched ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT), pos.z),
    dir: vec3(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch),
  };
}

const SPAWN_RAY_HEIGHT = 3;
const SPAWN_RAY_LENGTH = 6;
const MIN_UP_NORMAL = Math.cos(degToRad(PLAYER_MAX_SLOPE_DEG));
const TIPPED_UP = Math.cos(degToRad(PUSH_TIPPED_DEG));
const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function createPlayers(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, props: Props, course: BuiltCourse): Players {
  const worldGroups = groups(GROUP_WORLD, GROUP_WORLD);
  const capsule = new rapier.Capsule(capsuleHalfSegment(false), PLAYER_RADIUS);
  const crouchedCapsule = new rapier.Capsule(capsuleHalfSegment(true), PLAYER_RADIUS);
  const controller = createWalkController(rapier, physics);

  const entries = new Map<string, { state: PlayerState; collider: ReturnType<RapierWorld['createCollider']> }>();

  const placeCollider = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    placeCapsule(entry.collider, entry.state.pos, entry.state.crouched);
  };

  // `body` is the first dynamic body the capsule overlaps: the vehicle, else the first unheld prop in course order.
  const touching = (feet: Vec3, crouched = false): { body: string | null; statics: boolean } => {
    const centre = { x: feet.x, y: feet.y + PLAYER_OVERLAP_LIFT + capsuleHeight(crouched) / 2, z: feet.z };
    let hitVehicle = false;
    let statics = false;
    const hitProps = new Set<string>();
    physics.intersectionsWithShape(
      centre,
      IDENTITY,
      crouched ? crouchedCapsule : capsule,
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

  // Static colliders that are not ground: walls and fences.
  const wallBetween = (from: Vec3, x: number, y: number, z: number): boolean => {
    const dx = x - from.x;
    const dz = z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6) return false;
    const ray = new rapier.Ray({ x: from.x, y, z: from.z }, { x: dx / distance, y: 0, z: dz / distance });
    const hit = physics.castRay(
      ray,
      distance,
      true,
      undefined,
      groups(GROUP_WORLD, GROUP_STATIC),
      undefined,
      undefined,
      (collider) => ((collider.collisionGroups() >>> 16) & GROUP_GROUND) === 0,
    );
    return hit !== null;
  };

  // The feet for a spot on the ground under (x, z): found as in rule S1, or null if there is none, the capsule would overlap, or a wall lies between `from` and the spot.
  const standingSpot = (x: number, z: number, from: Vec3): Vec3 | null => {
    const groundY = groundBelow(x, z, vehicle.body.translation().y + SPAWN_RAY_HEIGHT);
    if (groundY === null) return null;
    const feet = vec3(x, groundY + PLAYER_CONTROLLER_OFFSET, z);
    if (overlapsAnything(feet)) return null;
    return wallBetween(from, x, feet.y + SPAWN_WALL_RAY_HEIGHT, z) ? null : feet;
  };

  let fallbackSpawn = course.checkpoints[0]?.spawn.pos ?? vec3(0, 0, 0);

  const findSpawn = (forId: string | null): Vec3 => {
    const body = vehicle.body.translation();
    const turn = quatFromAxisAngle(AXIS_Y, yawOf(vehicle.body.rotation()));
    const others = [...entries.values()].filter(({ state }) => state.id !== forId && state.seat === null);
    for (const slot of vehicle.config.spawnSlots) {
      const at = add(body, rotate(turn, vec3(slot.x, 0, slot.z)));
      const feet = standingSpot(at.x, at.z, body);
      if (feet === null) continue;
      if (others.some(({ state }) => Math.hypot(state.pos.x - feet.x, state.pos.z - feet.z) < 2 * PLAYER_RADIUS)) continue;
      return feet;
    }
    return vec3(fallbackSpawn.x, fallbackSpawn.y, fallbackSpawn.z);
  };

  const findExit = (seat: SeatConfig): Vec3 | null => {
    const body = vehicle.body.translation();
    const turn = quatFromAxisAngle(AXIS_Y, yawOf(vehicle.body.rotation()));
    const from = add(body, rotate(turn, vec3(seat.pos.x, 0, seat.pos.z)));
    for (const point of exitPoints(vehicle.config, seat, body, vehicle.body.rotation())) {
      const feet = standingSpot(point.x, point.z, from);
      if (feet !== null) return feet;
    }
    return null;
  };

  const clearSlide = (state: PlayerState) => {
    state.slideTicks = 0;
    state.slideCooldown = 0;
    state.slideAir = 0;
    state.slideDir = { x: 0, z: 0 };
    state.launch = 0;
  };

  const resetStance = (state: PlayerState) => {
    state.crouched = false;
    clearSlide(state);
  };

  const restAt = (state: PlayerState, pos: Vec3) => {
    resetStance(state);
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

  const velocity3At = (body: RigidBody, point: Vec3): Vec3 => {
    const v = body.linvel();
    const w = body.angvel();
    const r = sub(point, body.worldCom());
    return vec3(v.x + w.y * r.z - w.z * r.y, v.y + w.z * r.x - w.x * r.z, v.z + w.x * r.y - w.y * r.x);
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

  // Rule H4 (a): the body that was shoved out of, with the unit horizontal normal from it to the player.
  const shoveOut = (state: PlayerState): { bodyId: string; n: Vec3 } | null => {
    const overlapped = touching(state.pos, state.crouched).body;
    if (overlapped === null) return null;
    if (liftOntoTop(state, overlapped)) return null;
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
    const hit = { bodyId: overlapped, n: vec3(dx / distance, 0, dz / distance) };
    for (let along = SHOVE_STEP; along <= SHOVE_MAX_DISTANCE + 1e-9; along += SHOVE_STEP) {
      const candidate = vec3(state.pos.x + (dx / distance) * along, state.pos.y, state.pos.z + (dz / distance) * along);
      const found = touching(candidate, state.crouched);
      if (found.statics) break;
      if (found.body === null) {
        state.pos = candidate;
        return hit;
      }
    }
    state.pos = findSpawn(state.id);
    state.vy = 0;
    state.walk = { x: 0, z: 0 };
    state.carry = { x: 0, z: 0 };
    state.hold = null;
    // The move to a spawn slot is a teleport and costs nothing (rule J2).
    return null;
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

  const yawQuat = (yaw: number): Quat => quatFromAxisAngle(AXIS_Y, yaw);

  const cuboids = new Map<string, InstanceType<Rapier['Cuboid']>>();
  const boxBlocked = (pose: Pose, kind: string, half: Vec3): boolean => {
    let shape = cuboids.get(kind);
    if (!shape) {
      shape = new rapier.Cuboid(half.x, half.y, half.z);
      cuboids.set(kind, shape);
    }
    let blocked = false;
    physics.intersectionsWithShape(
      pose.pos,
      pose.rot,
      shape,
      () => {
        blocked = true;
        return false;
      },
      undefined,
      worldGroups,
    );
    return blocked;
  };

  // Rules K3 and K5: released at the hold pose, or above the head when that spot is blocked.
  const releaseHeld = (state: PlayerState, yaw: number, velocity: Vec3) => {
    if (state.hands === 'hook') return;
    const prop = state.hands === null ? undefined : props.get(state.hands);
    state.hands = null;
    if (!prop) return;
    const half = prop.config.halfExtents;
    const pose = holdPoseAt(state.pos, yaw);
    const at = boxBlocked(pose, prop.kind, half)
      ? { pos: add(state.pos, vec3(0, PLAYER_HEIGHT + half.y + THROW_HEAD_CLEARANCE, 0)), rot: pose.rot }
      : pose;
    props.release(prop.id, at.pos, at.rot, velocity);
  };

  let intents: PushIntent[] = [];
  let damage: PendingDamage[] = [];

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

  // Rules H4, J3, J4: a touching body resets its cooldown every tick; a hit counts only when none was live.
  const registerHit = (state: PlayerState, bodyId: string, n: Vec3, playerVel: Vec3) => {
    const live = state.hitCooldown.has(bodyId);
    state.hitCooldown.set(bodyId, HIT_COOLDOWN);
    if (live) return;
    const { body } = bodyOf(bodyId);
    const centre = vec3(state.pos.x, state.pos.y + capsuleHeight(state.crouched) / 2, state.pos.z);
    const speed = relativeSpeed(body.linvel(), body.angvel(), body.worldCom(), centre, playerVel, n);
    const vehicleHit = bodyId === 'vehicle';
    const amount = vehicleHit ? damageAbove(speed, VEHICLE_HIT_SPEED, VEHICLE_HIT_DAMAGE) : damageAbove(speed, PROP_HIT_SPEED, PROP_HIT_DAMAGE);
    if (amount > 0) damage.push({ playerId: state.id, source: vehicleHit ? 'vehicle' : 'prop', amount });
  };

  const move = (state: PlayerState, step: StepInputs, startGround: string | null, shoved: { bodyId: string; n: Vec3 } | null) => {
    const { fields, pressed } = step;
    const moveX = finite(fields.moveX);
    const moveY = finite(fields.moveY);
    const wish = wishVelocity(state.yaw, moveX, moveY);
    const wasOn = state.ground?.bodyId ?? null;
    const wasAirborne = !state.grounded;
    const entry = entries.get(state.id)!;
    const { collisions, moveVy } = stepWalk(
      { controller, collider: entry.collider, groups: worldGroups, physics, standing: capsule },
      state,
      {
        jumpPressed: pressed.jump,
        crouchPressed: pressed.crouch,
        crouch: fields.crouch === true,
        jumpHeld: fields.jump,
        sprint: fields.sprint === true,
        carrying: state.hands !== null,
        holdsProp: state.hands !== null && state.hands !== 'hook',
        moveX,
        moveY,
        yaw: state.yaw,
        speedScale: state.treedent > 0 ? TREEDENT_SPEED : 1,
      },
    );
    tickPowerUps(state);
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
    if (wasAirborne && state.grounded) {
      const amount = state.noFall ? 0 : damageAbove(Math.max(0, -moveVy), FALL_DAMAGE_SPEED, FALL_DAMAGE);
      if (amount > 0) damage.push({ playerId: state.id, source: 'fall', amount });
    }
    if (state.grounded) state.noFall = false;
    if (state.downed === null) {
      // Rule J2: the ground, and contacts with an upward normal, are not hits.
      const contacts = new Map<string, Vec3>();
      const skip = (bodyId: string) => bodyId === startGround || bodyId === wasOn || bodyId === standingOn;
      if (shoved && !skip(shoved.bodyId)) contacts.set(shoved.bodyId, shoved.n);
      for (const hit of collisions) {
        if (hit.normalY >= MIN_UP_NORMAL) continue;
        const prop = props.byCollider(hit.handle);
        const bodyId = hit.handle === vehicle.chassisHandle ? 'vehicle' : prop && prop.heldBy === null ? prop.id : null;
        if (bodyId === null || skip(bodyId) || contacts.has(bodyId)) continue;
        contacts.set(bodyId, hit.normal);
      }
      if (contacts.size > 0) {
        const ground = startGround === null ? vec3(0, 0, 0) : velocity3At(bodyOf(startGround).body, state.pos);
        // Sprinting or sliding into something at rest costs nothing: the own velocity counts as at most a walk.
        const own = Math.hypot(state.walk.x, state.walk.z);
        const k = own > PLAYER_WALK_SPEED ? PLAYER_WALK_SPEED / own : 1;
        const playerVel = vec3(state.walk.x * k + state.carry.x + ground.x, state.vy + ground.y, state.walk.z * k + state.carry.z + ground.z);
        for (const [bodyId, n] of contacts) registerHit(state, bodyId, n, playerVel);
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
        crouched: false,
        slideTicks: 0,
        slideCooldown: 0,
        slideAir: 0,
        slideDir: { x: 0, z: 0 },
        launch: 0,
        flying: false,
        noFall: false,
        ground: null,
        seat: null,
        hands: null,
        respawnIn: null,
        inventory: [null, null, null],
        slot: 0,
        hold: null,
        gun: true,
        ammo: GUN_AMMO_START,
        gunCooldown: 0,
        treedent: 0,
        shield: 0,
        shieldTime: 0,
        koke: 0,
        health: PLAYER_MAX_HEALTH,
        downed: null,
        hitCooldown: new Map(),
      };
      const collider = physics.createCollider(
        rapier.ColliderDesc.capsule(capsuleHalfSegment(false), PLAYER_RADIUS)
          .setTranslation(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z)
          .setCollisionGroups(groups(GROUP_PLAYER, 0)),
      );
      entries.set(id, { state, collider });
      return state;
    },
    remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      releaseHeld(entry.state, entry.state.yaw, vec3(0, 0, 0));
      physics.removeCollider(entry.collider, false);
      entries.delete(id);
    },
    get: (id) => entries.get(id)?.state,
    all: () => [...entries.values()].map(({ state }) => state),
    stepOnFoot(inputs) {
      intents = [];
      damage = [];
      for (const { state } of entries.values()) {
        for (const [bodyId, left] of state.hitCooldown) {
          if (left - TICK_DT <= 0) state.hitCooldown.delete(bodyId);
          else state.hitCooldown.set(bodyId, left - TICK_DT);
        }
      }
      for (const { state } of entries.values()) {
        const step = inputs.get(state.id) ?? NEUTRAL_STEP;
        state.yaw = finite(step.fields.yaw);
        state.pitch = finite(step.fields.pitch);
        if (state.seat !== null) {
          tickPowerUps(state);
          placeSeated(state);
          continue;
        }
        if (state.ground && groundLost(state.ground)) state.ground = null;
        const startGround = state.ground?.bodyId ?? null;
        let shoved: { bodyId: string; n: Vec3 } | null = null;
        if (state.ground) {
          state.pos = fromBodyFrame(bodyOf(state.ground.bodyId).body, state.ground.localPos);
          placeCollider(state.id);
        } else {
          shoved = shoveOut(state);
          placeCollider(state.id);
        }
        move(state, step, startGround, shoved);
      }
      // Rule K4.
      for (const { state } of entries.values()) {
        const prop = state.hands === null ? undefined : props.get(state.hands);
        if (!prop) continue;
        const pose = holdPoseAt(state.pos, state.yaw);
        prop.body.setTranslation(pose.pos, true);
        prop.body.setRotation(pose.rot, true);
        prop.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        prop.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    setSeat(id, seatId, pos) {
      const state = entries.get(id)?.state;
      if (!state) return;
      state.hold = null;
      if (seatId === null) {
        state.seat = null;
        restAt(state, pos ?? state.pos);
        state.grounded = true;
        placeCollider(id);
        return;
      }
      if (!seatConfig(seatId)) return;
      resetStance(state);
      state.flying = false;
      releaseHeld(state, state.yaw, vec3(0, 0, 0));
      state.seat = seatId;
      state.respawnIn = null;
      placeSeated(state);
    },
    teleport(id, pos) {
      const state = entries.get(id)?.state;
      if (!state) return;
      state.hold = null;
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
    takeDamage() {
      const taken = damage;
      damage = [];
      return taken;
    },
    setDowned(id) {
      const state = entries.get(id)?.state;
      if (!state) return;
      releaseHeld(state, state.yaw, vec3(0, 0, 0));
      // Crouched stays: under a low ceiling the stepper stands the player up once it fits.
      clearSlide(state);
      state.flying = false;
      placeCollider(id);
      state.hold = null;
      clearPowerUps(state);
      state.downed = DOWNED_TIMEOUT;
    },
    revive(id, health) {
      const state = entries.get(id)?.state;
      if (!state) return;
      state.health = health;
      state.downed = null;
    },
    respawn(id) {
      const pos = findSpawn(id);
      const state = entries.get(id)?.state;
      if (!state) return pos;
      state.hold = null;
      clearPowerUps(state);
      restAt(state, pos);
      state.seat = null;
      state.grounded = false;
      state.health = PLAYER_REVIVE_HEALTH;
      state.downed = null;
      state.hitCooldown.clear();
      placeCollider(id);
      return pos;
    },
    pickUp(id, propId) {
      const state = entries.get(id)?.state;
      const prop = props.get(propId);
      if (!state || !prop || state.seat !== null || state.hands !== null) return false;
      if (prop.heldBy !== null || prop.config.class !== 'light') return false;
      props.hold(propId, id);
      state.hands = propId;
      return true;
    },
    throwHeld(id, yaw, pitch) {
      const state = entries.get(id)?.state;
      if (!state || state.hands === null) return;
      const { dir } = aimRay(state.pos, yaw, pitch, state.crouched);
      // Rule R13: a thrower on a body adds that body's velocity at their feet.
      const base = state.ground
        ? (() => {
            const under = velocityAt(bodyOf(state.ground.bodyId).body, state.pos);
            return { x: under.x + state.walk.x, z: under.z + state.walk.z };
          })()
        : { x: state.walk.x + state.carry.x, z: state.walk.z + state.carry.z };
      releaseHeld(state, yaw, vec3(dir.x * THROW_SPEED + base.x, dir.y * THROW_SPEED, dir.z * THROW_SPEED + base.z));
    },
    resetHeld(id) {
      const state = entries.get(id)?.state;
      if (!state || state.hands === null || state.hands === 'hook') return;
      props.resetToSpawn(state.hands);
      state.hands = null;
    },
    setHands(id, hands) {
      const state = entries.get(id)?.state;
      if (state) state.hands = hands;
    },
    holdPose(id) {
      const state = entries.get(id)?.state;
      return state && state.hands !== null ? holdPoseAt(state.pos, state.yaw) : null;
    },
    restoreInventory(id, inventory) {
      const state = entries.get(id)?.state;
      if (!state) return;
      for (let i = 0; i < state.inventory.length; i++) state.inventory[i] = inventory[i] ?? null;
    },
    findSpawn,
    standAt(x, z, fromY) {
      const groundY = groundBelow(x, z, fromY);
      if (groundY === null) return null;
      const feet = vec3(x, groundY + PLAYER_CONTROLLER_OFFSET, z);
      return overlapsAnything(feet) ? null : feet;
    },
    setFallbackSpawn(pos) {
      fallbackSpawn = vec3(pos.x, pos.y, pos.z);
    },
    findExit,
    dispose() {
      for (const { collider } of entries.values()) physics.removeCollider(collider, false);
      entries.clear();
      physics.removeCharacterController(controller);
    },
  };
}
