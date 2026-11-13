import {
  ANCHOR_HEIGHT,
  HOOK_DROP_RAY,
  GRAVITY,
  PROP_KINDS,
  TICK_DT,
  WINCH_DAMPING_RATIO,
  WINCH_FORCE_PER_WEIGHT,
  WINCH_MAX_LENGTH,
  WINCH_MIN_LENGTH,
  WINCH_REEL_SPEED,
  WINCH_STIFFNESS_PER_KG,
} from './constants';
import type { BuiltCourse } from './course';
import { GROUP_GROUND, GROUP_WORLD, groups } from './groups';
import { add, clamp, dot, length, rotate, scale, sub, vec3, type Pose, type Vec3 } from './math';
import type { Props } from './props';
import type { Rapier, RapierWorld } from './rapier';
import type { Vehicle } from './vehicle';

export type CableState = 'stowed' | 'held' | 'ground' | 'attached';

export interface CableSnapshot {
  state: CableState;
  holderId: string | null;
  anchorId: string | null;
  hookPos: Vec3;
  length: number;
  reel: -1 | 0 | 1;
}

export interface CableEnd {
  point: Vec3;
  velocity: Vec3;
}

export function cableTension(
  from: CableEnd,
  to: CableEnd,
  cableLength: number,
  vehicleMass: number,
): { tension: number; dir: Vec3; stretch: number } {
  const span = sub(to.point, from.point);
  const distance = length(span);
  const dir = distance > 1e-9 ? scale(span, 1 / distance) : vec3(0, 0, 0);
  const stretch = distance - cableLength;
  const rate = -dot(sub(from.velocity, to.velocity), dir);
  const stiffness = WINCH_STIFFNESS_PER_KG * vehicleMass;
  const damping = 2 * WINCH_DAMPING_RATIO * vehicleMass * Math.sqrt(WINCH_STIFFNESS_PER_KG);
  const cap = WINCH_FORCE_PER_WEIGHT * vehicleMass * GRAVITY;
  const tension = stretch > 0 ? clamp(stiffness * stretch + damping * rate, 0, cap) : 0;
  return { tension, dir, stretch };
}

export function reelLength(cableLength: number, reel: -1 | 0 | 1, atCap: boolean): number {
  const step = WINCH_REEL_SPEED * TICK_DT;
  if (reel === 1) return atCap ? cableLength : Math.min(cableLength, Math.max(WINCH_MIN_LENGTH, cableLength - step));
  if (reel === -1) return Math.max(cableLength, Math.min(WINCH_MAX_LENGTH, cableLength + step));
  return cableLength;
}

export interface Winch {
  state(): CableSnapshot;
  // From the bumper or the ground; the hook is held by that player.
  take(playerId: string): void;
  // Held to attached; the length becomes the distance to the attach point. False, and nothing changes, if not held, unknown or beyond the maximum length.
  attach(anchorId: string): boolean;
  detach(playerId: string): void;
  release(): void;
  // Held to the ground below the point, or stowed when there is none within reach.
  drop(at: Vec3): void;
  stow(): void;
  // The heavy obstacle the cable is pulling on this tick (stretch above zero), computed before any impulse.
  tautObstacle(): string | null;
  // Tick step 2: the cable impulses and the reel; the input applies only while attached, or stows a ground hook.
  applyForces(reel: -1 | 0 | 1): { tension: number; stretch: number };
  // Tick step 4: the hook follows its holder and the length checks. Returns the holder whose hook was pulled from the hands.
  afterCharacters(holdPose: (playerId: string) => Pose | null): string | null;
  onPropReset(propId: string): void;
}

export function anchorPoint(id: string, course: BuiltCourse, props: Props): Vec3 | null {
  const fixed = course.anchors.find((anchor) => anchor.id === id);
  if (fixed) return add(fixed.pose.pos, vec3(0, ANCHOR_HEIGHT, 0));
  const prop = props.get(id);
  if (!prop) return null;
  const local = PROP_KINDS[prop.kind].anchor;
  if (!local) return null;
  return add(prop.body.translation(), rotate(prop.body.rotation(), local));
}

export function createWinch(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, props: Props, course: BuiltCourse): Winch {
  let state: CableState = 'stowed';
  let holderId: string | null = null;
  let anchorId: string | null = null;
  // Where a held or ground hook is; unused while stowed or attached.
  let hookPos: Vec3 = vec3(0, 0, 0);
  let cableLength = 0;
  let reelApplied: -1 | 0 | 1 = 0;

  const mount = (): Vec3 => add(vehicle.body.translation(), rotate(vehicle.body.rotation(), vehicle.config.winchMount));
  const attachPoint = (): Vec3 | null => (anchorId === null ? null : anchorPoint(anchorId, course, props));
  const distanceFromMount = (point: Vec3) => length(sub(point, mount()));

  const toStowed = () => {
    state = 'stowed';
    holderId = null;
    anchorId = null;
    cableLength = 0;
    reelApplied = 0;
  };

  const toHeld = (playerId: string, at: Vec3) => {
    state = 'held';
    holderId = playerId;
    anchorId = null;
    hookPos = at;
    reelApplied = 0;
  };

  const dropAt = (at: Vec3) => {
    const hit = physics.castRay(new rapier.Ray(at, { x: 0, y: -1, z: 0 }), HOOK_DROP_RAY, true, undefined, groups(GROUP_WORLD, GROUP_GROUND));
    if (!hit) {
      toStowed();
      return;
    }
    const point = vec3(at.x, at.y - hit.timeOfImpact, at.z);
    if (distanceFromMount(point) > WINCH_MAX_LENGTH) {
      toStowed();
      return;
    }
    state = 'ground';
    holderId = null;
    anchorId = null;
    hookPos = point;
    reelApplied = 0;
  };

  // The far end of the cable while attached: its point and velocity.
  const farEnd = (): CableEnd | null => {
    const point = attachPoint();
    if (point === null) return null;
    const prop = anchorId === null ? undefined : props.get(anchorId);
    return { point, velocity: prop ? prop.body.velocityAtPoint(point) : vec3(0, 0, 0) };
  };

  const measure = () => {
    const to = farEnd();
    if (state !== 'attached' || to === null) return null;
    const from = mount();
    const result = cableTension({ point: from, velocity: vehicle.body.velocityAtPoint(from) }, to, cableLength, vehicle.config.mass);
    return { from, to, ...result };
  };

  return {
    state() {
      switch (state) {
        case 'stowed':
          return { state, holderId: null, anchorId: null, hookPos: mount(), length: 0, reel: 0 };
        case 'held':
        case 'ground':
          return { state, holderId, anchorId: null, hookPos, length: distanceFromMount(hookPos), reel: 0 };
        case 'attached':
          return { state, holderId: null, anchorId, hookPos: attachPoint() ?? hookPos, length: cableLength, reel: reelApplied };
      }
    },
    take(playerId) {
      if (state === 'stowed') toHeld(playerId, mount());
      else if (state === 'ground') toHeld(playerId, hookPos);
    },
    attach(id) {
      if (state !== 'held') return false;
      const point = anchorPoint(id, course, props);
      if (point === null) return false;
      const distance = distanceFromMount(point);
      if (distance > WINCH_MAX_LENGTH) return false;
      state = 'attached';
      holderId = null;
      anchorId = id;
      cableLength = distance;
      reelApplied = 0;
      return true;
    },
    detach(playerId) {
      if (state !== 'attached') return;
      toHeld(playerId, attachPoint() ?? hookPos);
    },
    release() {
      if (state === 'attached') toStowed();
    },
    drop(at) {
      if (state === 'held') dropAt(at);
    },
    stow: toStowed,
    tautObstacle() {
      const m = measure();
      if (m === null || anchorId === null || !props.get(anchorId) || m.stretch <= 0) return null;
      return anchorId;
    },
    applyForces(reel) {
      if (state === 'ground' && reel === 1) {
        toStowed();
        return { tension: 0, stretch: 0 };
      }
      const m = measure();
      if (m === null) {
        reelApplied = 0;
        return { tension: 0, stretch: 0 };
      }
      if (m.tension > 0) {
        const impulse = scale(m.dir, m.tension * TICK_DT);
        vehicle.body.applyImpulseAtPoint(impulse, m.from, true);
        const prop = anchorId === null ? undefined : props.get(anchorId);
        if (prop) prop.body.applyImpulseAtPoint(scale(impulse, -1), m.to.point, true);
      }
      const cap = WINCH_FORCE_PER_WEIGHT * vehicle.config.mass * GRAVITY;
      const next = reelLength(cableLength, reel, m.tension >= cap);
      reelApplied = next === cableLength ? 0 : reel;
      cableLength = next;
      return { tension: m.tension, stretch: m.stretch };
    },
    afterCharacters(holdPose) {
      let pulled: string | null = null;
      if (state === 'held' && holderId !== null) {
        const id = holderId;
        const pose = holdPose(id);
        if (pose) hookPos = pose.pos;
        if (!pose || distanceFromMount(hookPos) > WINCH_MAX_LENGTH) {
          pulled = id;
          dropAt(hookPos);
        }
      }
      if (state === 'ground' && distanceFromMount(hookPos) > WINCH_MAX_LENGTH) toStowed();
      return pulled;
    },
    onPropReset(propId) {
      if (state === 'attached' && anchorId === propId) toStowed();
    },
  };
}
