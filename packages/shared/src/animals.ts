import { createDirector, markHit, rearm, stepDirector, type AmbientEvent, type AnimalKind, type AnimalSnapshot, type DirectorAnimal, type DirectorState } from './ambient';
import { ANIMAL_HALF_GOAT, ANIMAL_HALF_SCOOTER, ANIMAL_HIT_MARGIN, ANIMAL_HIT_SPEED, ANIMAL_PROBE_LENGTH, ANIMAL_PROBE_UP, TICK_DT } from './constants';
import { GROUP_ANIMAL, GROUP_GROUND, GROUP_WORLD, groups } from './groups';
import { AXIS_Y, quatFromAxisAngle, type Quat, type Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import { createRouteIndex, type RouteIndex } from './routeAlong';

export interface AnimalHit {
  id: number;
  kind: AnimalKind;
  pos: Vec3;
}

export interface Animals {
  // Director step for this tick, then the bodies follow: call before the vehicle and physics steps.
  step(vehiclePos: Vec3): void;
  // Animals whose box meets the inflated chassis box above ANIMAL_HIT_SPEED relative to `vehicleVelocity`; each is flagged hit, so it comes back once.
  hits(chassis: { pos: Vec3; rot: Quat; half: Vec3 }, vehicleVelocity: Vec3): AnimalHit[];
  // Removes every animal; events ahead of the spawn window fire again.
  rearm(vehiclePos: Vec3): void;
  // Absent (undefined) when none are alive.
  snapshot(): AnimalSnapshot[] | undefined;
}

interface Entry {
  body: RigidBody;
  colliderHandle: number;
  half: Vec3;
  x: number;
  y: number;
  z: number;
  yaw: number;
  // m/s in the world; zero while standing.
  vx: number;
  vz: number;
  placed: boolean;
}

const halfOf = (kind: AnimalKind): Vec3 => (kind === 'goat' ? ANIMAL_HALF_GOAT : ANIMAL_HALF_SCOOTER);

export function createAnimals(rapier: Rapier, physics: RapierWorld, route: readonly (readonly [number, number])[], plan: readonly AmbientEvent[]): Animals {
  const index: RouteIndex = createRouteIndex(route);
  const director: DirectorState = createDirector(plan);
  const entries = new Map<number, Entry>();
  const byHandle = new Map<number, number>();
  const queryGroups = groups(GROUP_WORLD, GROUP_ANIMAL);
  const groundGroups = groups(GROUP_WORLD, GROUP_GROUND);
  let hint: number | undefined;
  let probe: { half: Vec3; shape: InstanceType<Rapier['Cuboid']> } | null = null;

  const remove = (id: number) => {
    const entry = entries.get(id);
    if (!entry) return;
    byHandle.delete(entry.colliderHandle);
    physics.removeRigidBody(entry.body);
    entries.delete(id);
  };

  // The ground below an animal is read by one ray; `fallback` is used where the ray finds none.
  const groundAt = (x: number, z: number, aroundY: number, fallback: number): number => {
    const hit = physics.castRay(new rapier.Ray({ x, y: aroundY + ANIMAL_PROBE_UP, z }, { x: 0, y: -1, z: 0 }), ANIMAL_PROBE_LENGTH, true, undefined, groundGroups);
    return hit ? aroundY + ANIMAL_PROBE_UP - hit.timeOfImpact : fallback;
  };

  const place = (a: DirectorAnimal, entry: Entry | undefined, vehicleY: number): Entry => {
    const at = index.pointAt(a.along);
    // The right of the travel direction is (-tz, tx).
    const rx = -at.tz;
    const rz = at.tx;
    const x = at.x + rx * a.lateral;
    const z = at.z + rz * a.lateral;
    const half = halfOf(a.kind);
    let e = entry;
    if (!e) {
      const fx = a.dir * rx;
      const fz = a.dir * rz;
      const yaw = Math.atan2(-fx, -fz);
      const y = groundAt(x, z, vehicleY, vehicleY - 1) + half.y;
      const body = physics.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z).setRotation(quatFromAxisAngle(AXIS_Y, yaw)));
      const collider = physics.createCollider(rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(groups(GROUP_ANIMAL, GROUP_WORLD)), body);
      e = { body, colliderHandle: collider.handle, half, x, y, z, yaw, vx: 0, vz: 0, placed: true };
      entries.set(a.id, e);
      byHandle.set(collider.handle, a.id);
    } else if (x !== e.x || z !== e.z) {
      e.y = groundAt(x, z, e.y, e.y - half.y) + half.y;
      e.body.setNextKinematicTranslation({ x, y: e.y, z });
      e.x = x;
      e.z = z;
    }
    e.vx = rx * a.velocity;
    e.vz = rz * a.velocity;
    return e;
  };

  return {
    step(vehiclePos) {
      const projected = index.project(vehiclePos.x, vehiclePos.z, hint);
      hint = projected.segment;
      const { despawn } = stepDirector(director, { vehicleAlong: projected.along, vehicleLateral: projected.lateral, dt: TICK_DT });
      for (const id of despawn) remove(id);
      for (const a of director.animals) place(a, entries.get(a.id), vehiclePos.y);
    },
    hits(chassis, vehicleVelocity) {
      if (entries.size === 0) return [];
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
      const hits: AnimalHit[] = [];
      for (const id of touched.sort((a, b) => a - b)) {
        const a = director.animals.find((candidate) => candidate.id === id);
        const e = entries.get(id);
        if (!a || !e || a.phase === 'hit') continue;
        const relative = Math.hypot(vehicleVelocity.x - e.vx, vehicleVelocity.y, vehicleVelocity.z - e.vz);
        if (relative <= ANIMAL_HIT_SPEED) continue;
        markHit(director, id);
        e.vx = 0;
        e.vz = 0;
        hits.push({ id, kind: a.kind, pos: { x: e.x, y: e.y, z: e.z } });
      }
      return hits;
    },
    rearm(vehiclePos) {
      hint = undefined;
      for (const id of rearm(director, index.project(vehiclePos.x, vehiclePos.z).along)) remove(id);
    },
    snapshot() {
      if (director.animals.length === 0) return undefined;
      return director.animals.map((a) => {
        const e = entries.get(a.id)!;
        return { id: a.id, kind: a.kind, x: e.x, y: e.y, z: e.z, yaw: e.yaw, ...(a.phase === 'hit' ? { hit: true as const } : {}) };
      });
    },
  };
}
