import { mulberry32 } from './ambient';
import {
  AMBIENT_REARM_CLEAR,
  ANIMAL_HIT_MARGIN,
  ANIMAL_PROBE_LENGTH,
  ANIMAL_PROBE_UP,
  ENEMY_DESPAWN_BEHIND,
  ENEMY_EDGE_OFFSET,
  ENEMY_HALF,
  ENEMY_HEALTH,
  ENEMY_JITTER,
  ENEMY_KNIFE_COOLDOWN,
  ENEMY_KNIFE_RANGE,
  ENEMY_KNIFE_REACH_Y,
  ENEMY_KNOCK_SPEED,
  ENEMY_MAX_ALIVE,
  ENEMY_REMOVE_AFTER,
  ENEMY_RUN_SPEED,
  ENEMY_SIGHT,
  ENEMY_SLIP_CHANCE,
  ENEMY_SLIP_SECONDS,
  ENEMY_SPACING,
  ENEMY_SPAWN_AHEAD,
  ROAD_WIDTH,
  TICK_DT,
  type Surface,
} from './constants';
import { GROUP_ENEMY, GROUP_GROUND, GROUP_WORLD, groups } from './groups';
import type { Quat, Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import { createRouteIndex, type RouteIndex } from './routeAlong';

export type EnemyState = 'idle' | 'run' | 'attack' | 'slip' | 'down' | 'dead';

export interface EnemyEvent {
  id: number;
  along: number;
  side: -1 | 1;
  // Where it spawns, instead of beside the route.
  at?: { x: number; z: number };
}

export interface EnemySnapshot {
  id: number;
  // The centre of the hit box, as an animal's.
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: EnemyState;
}

// A player an enemy may run at: on foot, standing or crouched, not downed or flying.
export interface EnemyTarget {
  id: string;
  feet: Vec3;
}

export interface Stab {
  playerId: string;
  pos: Vec3;
}

// Events every ENEMY_SPACING / density m of route, half as far apart from `denseFrom` on; sorted by `along`.
export function planEnemies(seed: number, routeLength: number, denseFrom: number | null, density = 1): EnemyEvent[] {
  const rand = mulberry32(seed);
  const events: EnemyEvent[] = [];
  const spacing = ENEMY_SPACING / density;
  let at = spacing / 2;
  while (at < routeLength) {
    const along = Math.min(routeLength, Math.max(0, at + (rand() * 2 - 1) * ENEMY_JITTER));
    const side: -1 | 1 = rand() < 0.5 ? -1 : 1;
    events.push({ id: events.length, along, side });
    at += denseFrom !== null && at >= denseFrom ? spacing / 2 : spacing;
  }
  return events.sort((a, b) => a.along - b.along).map((e, id) => ({ ...e, id }));
}

interface Entry {
  id: number;
  eventId: number;
  body: RigidBody;
  collider: ReturnType<RapierWorld['createCollider']> | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  health: number;
  state: EnemyState;
  knife: number;
  slip: number;
  // Seconds left before a downed or dead enemy is removed.
  linger: number;
  slickDone: boolean;
  hint: number | undefined;
}

export interface Enemies {
  // Spawns, moves and removes; returns the stabs of this tick. Call before the physics step.
  step(vehiclePos: Vec3, targets: readonly EnemyTarget[]): Stab[];
  // Live enemies the vehicle's chassis box meets while it moves faster than ENEMY_KNOCK_SPEED; each is knocked down, once. Returns the count.
  knocks(chassis: { pos: Vec3; rot: Quat; half: Vec3 }, vehicleSpeed: number): number;
  // Takes health from the live enemy that owns this collider; false when none does.
  damage(colliderHandle: number, amount: number): boolean;
  // Removes every enemy; events ahead of the spawn window fire again.
  rearm(vehiclePos: Vec3): void;
  // Absent (undefined) when none are alive.
  snapshot(): EnemySnapshot[] | undefined;
}

const round = (v: number): number => Math.round(v * 100) / 100;

export function createEnemies(
  rapier: Rapier,
  physics: RapierWorld,
  route: readonly (readonly [number, number])[],
  plan: readonly EnemyEvent[],
  seed: number,
  surfaceOf: (colliderHandle: number) => Surface | null,
): Enemies {
  const index: RouteIndex = createRouteIndex(route);
  const rand = mulberry32(seed);
  const fired = plan.map(() => false);
  const entries = new Map<number, Entry>();
  const byHandle = new Map<number, number>();
  const queryGroups = groups(GROUP_WORLD, GROUP_ENEMY);
  let nextId = 1;
  let vehicleHint: number | undefined;
  let probe: { half: Vec3; shape: InstanceType<Rapier['Cuboid']> } | null = null;

  const remove = (entry: Entry) => {
    if (entry.collider) byHandle.delete(entry.collider.handle);
    physics.removeRigidBody(entry.body);
    entries.delete(entry.id);
  };

  // The ground below (x, z) and its surface, by one ray; `fallback` where the ray finds none.
  const groundAt = (x: number, z: number, aroundY: number, fallback: number): { y: number; surface: Surface | null } => {
    const fromY = aroundY + ANIMAL_PROBE_UP;
    const hit = physics.castRay(new rapier.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), ANIMAL_PROBE_LENGTH, true, undefined, groups(GROUP_WORLD, GROUP_GROUND));
    return hit ? { y: fromY - hit.timeOfImpact, surface: surfaceOf(hit.collider.handle) } : { y: fallback, surface: null };
  };

  // A downed or dead enemy is out of every query but stays in view until it is removed.
  const lieDown = (entry: Entry, state: 'down' | 'dead') => {
    entry.state = state;
    entry.vx = 0;
    entry.vz = 0;
    entry.linger = ENEMY_REMOVE_AFTER;
    if (entry.collider) {
      byHandle.delete(entry.collider.handle);
      physics.removeCollider(entry.collider, false);
      entry.collider = null;
    }
  };

  const spawn = (event: EnemyEvent, vehicleY: number) => {
    const at = index.pointAt(event.along);
    // The right of the travel direction is (-tz, tx).
    const lateral = event.side * (ROAD_WIDTH / 2 + ENEMY_EDGE_OFFSET);
    const x = event.at?.x ?? at.x - at.tz * lateral;
    const z = event.at?.z ?? at.z + at.tx * lateral;
    const y = groundAt(x, z, vehicleY, vehicleY - 1).y + ENEMY_HALF.y;
    const body = physics.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const collider = physics.createCollider(rapier.ColliderDesc.cuboid(ENEMY_HALF.x, ENEMY_HALF.y, ENEMY_HALF.z).setCollisionGroups(groups(GROUP_ENEMY, GROUP_WORLD)), body);
    const entry: Entry = {
      id: nextId++,
      eventId: event.id,
      body,
      collider,
      x,
      y,
      z,
      yaw: 0,
      vx: 0,
      vz: 0,
      health: ENEMY_HEALTH,
      state: 'idle',
      knife: 0,
      slip: 0,
      linger: 0,
      slickDone: false,
      hint: undefined,
    };
    entries.set(entry.id, entry);
    byHandle.set(collider.handle, entry.id);
  };

  const think = (entry: Entry, targets: readonly EnemyTarget[], stabs: Stab[]) => {
    entry.knife = Math.max(0, entry.knife - TICK_DT);
    let best: EnemyTarget | null = null;
    let bestDistance = ENEMY_SIGHT;
    for (const t of targets) {
      const d = Math.hypot(t.feet.x - entry.x, t.feet.z - entry.z);
      if (d <= bestDistance) {
        best = t;
        bestDistance = d;
      }
    }
    entry.vx = 0;
    entry.vz = 0;
    if (!best) {
      entry.state = 'idle';
      return;
    }
    const dx = best.feet.x - entry.x;
    const dz = best.feet.z - entry.z;
    entry.yaw = Math.atan2(-dx, -dz);
    const feetY = entry.y - ENEMY_HALF.y;
    if (bestDistance <= ENEMY_KNIFE_RANGE && Math.abs(best.feet.y - feetY) <= ENEMY_KNIFE_REACH_Y) {
      entry.state = 'attack';
      if (entry.knife <= 1e-9) {
        entry.knife = ENEMY_KNIFE_COOLDOWN;
        stabs.push({ playerId: best.id, pos: { x: entry.x, y: entry.y, z: entry.z } });
      }
      return;
    }
    // Slipping: certain the first time on mud or dirt, else a chance per second.
    const here = groundAt(entry.x, entry.z, entry.y, feetY);
    const slick = here.surface === 'mud' || here.surface === 'dirt';
    if (entry.state === 'run' && ((slick && !entry.slickDone) || rand() < ENEMY_SLIP_CHANCE * TICK_DT)) {
      if (slick) entry.slickDone = true;
      entry.state = 'slip';
      entry.slip = ENEMY_SLIP_SECONDS;
      return;
    }
    entry.state = 'run';
    // A target straight above or below gives no direction to run in.
    if (bestDistance < 1e-6) return;
    const step = Math.min(ENEMY_RUN_SPEED * TICK_DT, Math.max(0, bestDistance - ENEMY_KNIFE_RANGE * 0.5));
    const nx = entry.x + (dx / bestDistance) * step;
    const nz = entry.z + (dz / bestDistance) * step;
    entry.vx = ((nx - entry.x) / TICK_DT) || 0;
    entry.vz = ((nz - entry.z) / TICK_DT) || 0;
    entry.y = groundAt(nx, nz, entry.y, feetY).y + ENEMY_HALF.y;
    entry.x = nx;
    entry.z = nz;
    entry.body.setNextKinematicTranslation({ x: entry.x, y: entry.y, z: entry.z });
  };

  return {
    step(vehiclePos, targets) {
      const projected = index.project(vehiclePos.x, vehiclePos.z, vehicleHint);
      vehicleHint = projected.segment;
      const stabs: Stab[] = [];
      for (const entry of [...entries.values()]) {
        const where = index.project(entry.x, entry.z, entry.hint);
        entry.hint = where.segment;
        if (projected.along - where.along > ENEMY_DESPAWN_BEHIND) {
          remove(entry);
          continue;
        }
        if (entry.state === 'down' || entry.state === 'dead') {
          entry.linger -= TICK_DT;
          if (entry.linger <= 1e-9) remove(entry);
          continue;
        }
        if (entry.state === 'slip') {
          entry.slip -= TICK_DT;
          if (entry.slip > 1e-9) continue;
          entry.state = 'idle';
        }
        think(entry, targets, stabs);
      }
      for (const event of plan) {
        if (fired[event.id] || event.along < projected.along) continue;
        if (event.along - projected.along > ENEMY_SPAWN_AHEAD) break;
        if (entries.size >= ENEMY_MAX_ALIVE) break;
        fired[event.id] = true;
        spawn(event, vehiclePos.y);
      }
      return stabs;
    },
    knocks(chassis, vehicleSpeed) {
      if (entries.size === 0 || vehicleSpeed <= ENEMY_KNOCK_SPEED) return 0;
      if (!probe || probe.half.x !== chassis.half.x || probe.half.y !== chassis.half.y || probe.half.z !== chassis.half.z) {
        probe = { half: chassis.half, shape: new rapier.Cuboid(chassis.half.x + ANIMAL_HIT_MARGIN, chassis.half.y + ANIMAL_HIT_MARGIN, chassis.half.z + ANIMAL_HIT_MARGIN) };
      }
      const touched: number[] = [];
      physics.intersectionsWithShape(
        chassis.pos,
        chassis.rot,
        probe.shape,
        (collider) => {
          const id = byHandle.get(collider.handle);
          if (id !== undefined) touched.push(id);
          return true;
        },
        undefined,
        queryGroups,
      );
      let count = 0;
      for (const id of touched.sort((a, b) => a - b)) {
        const entry = entries.get(id);
        if (!entry || entry.state === 'down' || entry.state === 'dead') continue;
        lieDown(entry, 'down');
        count += 1;
      }
      return count;
    },
    damage(colliderHandle, amount) {
      const entry = entries.get(byHandle.get(colliderHandle) ?? -1);
      if (!entry) return false;
      entry.health -= amount;
      if (entry.health <= 0) lieDown(entry, 'dead');
      return true;
    },
    rearm(vehiclePos) {
      vehicleHint = undefined;
      for (const entry of [...entries.values()]) remove(entry);
      const along = index.project(vehiclePos.x, vehiclePos.z).along;
      for (const event of plan) fired[event.id] = event.along <= along + AMBIENT_REARM_CLEAR;
    },
    snapshot() {
      if (entries.size === 0) return undefined;
      return [...entries.values()].map((e) => ({ id: e.id, x: round(e.x), y: round(e.y), z: round(e.z), yaw: round(e.yaw), state: e.state }));
    },
  };
}
