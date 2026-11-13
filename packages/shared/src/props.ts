import { PROP_KINDS, type PropKind, type PropKindConfig } from './constants';
import type { BuiltCourse, Placed } from './course';
import { GROUP_WORLD, groups } from './groups';
import { IDENTITY, add, rotate, vec3, type Quat, type Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';

export interface PropSnapshot {
  id: string;
  kind: string;
  // The box centre.
  pos: Vec3;
  rot: Quat;
}

export interface Prop {
  readonly id: string;
  readonly kind: PropKind;
  readonly config: PropKindConfig;
  readonly body: RigidBody;
  readonly colliderHandle: number;
  heldBy: string | null;
  // Heavy props only; always false for light ones.
  locked: boolean;
}

export interface Props {
  // Course order.
  all(): Prop[];
  get(id: string): Prop | undefined;
  byCollider(handle: number): Prop | undefined;
  // The prop collides with nothing and follows whoever sets its pose.
  hold(id: string, playerId: string): void;
  // Dynamic again with its collision groups restored, angular velocity zero.
  release(id: string, pos: Vec3, rot: Quat, linvel: Vec3): void;
  // No-op on light props.
  setLocked(id: string, locked: boolean): void;
  // Spawn pose, at rest, released; a heavy prop locks.
  resetToSpawn(id: string): void;
  // Resets unheld props whose centre is below the plane; returns their ids.
  killPlane(killPlaneY: number): string[];
  // Every prop, course order.
  snapshot(): PropSnapshot[];
  // Removes the bodies; the physics world itself is freed by the caller.
  dispose(): void;
}

const ZERO = vec3(0, 0, 0);

export function propCentre(placed: Placed, config: PropKindConfig): Vec3 {
  return add(placed.pose.pos, rotate(placed.pose.rot, vec3(0, config.halfExtents.y, 0)));
}

export function createProps(rapier: Rapier, physics: RapierWorld, course: BuiltCourse): Props {
  const list: Prop[] = [];
  const byId = new Map<string, Prop>();
  const byHandle = new Map<number, Prop>();
  const spawns = new Map<string, Placed>();
  const worldGroups = groups(GROUP_WORLD, GROUP_WORLD);

  for (const placed of course.props) {
    if (placed.id === 'vehicle') throw new Error("Prop id 'vehicle' is reserved for the vehicle");
    if (!Object.hasOwn(PROP_KINDS, placed.kind)) throw new Error(`Unknown prop kind: ${placed.kind}`);
    const kind = placed.kind as PropKind;
    const config: PropKindConfig = PROP_KINDS[kind];
    const h = config.halfExtents;
    const centre = propCentre(placed, config);
    const inertia = {
      x: (config.mass / 3) * (h.y * h.y + h.z * h.z),
      y: (config.mass / 3) * (h.x * h.x + h.z * h.z),
      z: (config.mass / 3) * (h.x * h.x + h.y * h.y),
    };
    const body = physics.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(centre.x, centre.y, centre.z)
        .setRotation(placed.pose.rot)
        .setCanSleep(true)
        .setAdditionalMassProperties(config.mass, ZERO, inertia, IDENTITY),
    );
    const collider = physics.createCollider(
      rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(0).setFriction(config.friction).setCollisionGroups(worldGroups),
      body,
    );
    const prop: Prop = { id: placed.id, kind, config, body, colliderHandle: collider.handle, heldBy: null, locked: false };
    list.push(prop);
    byId.set(prop.id, prop);
    byHandle.set(prop.colliderHandle, prop);
    spawns.set(prop.id, placed);
    if (config.class === 'heavy') {
      body.lockRotations(true, true);
      applyLock(prop, true);
    }
  }

  function applyLock(prop: Prop, locked: boolean) {
    prop.locked = locked;
    prop.body.setEnabledTranslations(!locked, true, !locked, true);
    if (locked) {
      const v = prop.body.linvel();
      prop.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    }
  }

  const need = (id: string): Prop => {
    const prop = byId.get(id);
    if (!prop) throw new Error(`Unknown prop: ${id}`);
    return prop;
  };

  const makeDynamic = (prop: Prop) => {
    prop.heldBy = null;
    prop.body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    physics.getCollider(prop.colliderHandle).setCollisionGroups(worldGroups);
  };

  const resetToSpawn = (id: string) => {
    const prop = need(id);
    const placed = spawns.get(id)!;
    const centre = propCentre(placed, prop.config);
    makeDynamic(prop);
    prop.body.setTranslation(centre, true);
    prop.body.setRotation(placed.pose.rot, true);
    prop.body.setLinvel(ZERO, true);
    prop.body.setAngvel(ZERO, true);
    if (prop.config.class === 'heavy') applyLock(prop, true);
  };

  return {
    all: () => [...list],
    get: (id) => byId.get(id),
    byCollider: (handle) => byHandle.get(handle),
    hold(id, playerId) {
      const prop = need(id);
      prop.heldBy = playerId;
      prop.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      physics.getCollider(prop.colliderHandle).setCollisionGroups(0);
    },
    release(id, pos, rot, linvel) {
      const prop = need(id);
      makeDynamic(prop);
      prop.body.setTranslation(pos, true);
      prop.body.setRotation(rot, true);
      prop.body.setLinvel(linvel, true);
      prop.body.setAngvel(ZERO, true);
    },
    setLocked(id, locked) {
      const prop = need(id);
      if (prop.config.class === 'heavy') applyLock(prop, locked);
    },
    resetToSpawn,
    killPlane(killPlaneY) {
      const reset: string[] = [];
      for (const prop of list) {
        if (prop.heldBy !== null || prop.body.translation().y >= killPlaneY) continue;
        resetToSpawn(prop.id);
        reset.push(prop.id);
      }
      return reset;
    },
    snapshot: () =>
      list.map((prop) => {
        const pos = prop.body.translation();
        const rot = prop.body.rotation();
        return { id: prop.id, kind: prop.kind, pos: { x: pos.x, y: pos.y, z: pos.z }, rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w } };
      }),
    dispose() {
      for (const prop of list) physics.removeRigidBody(prop.body);
    },
  };
}
