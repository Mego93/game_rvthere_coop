import { ITEM_KINDS, type ItemKind } from './constants';
import type { BuiltCourse, Placed } from './course';
import { GROUP_ITEM, GROUP_STATIC, groups } from './groups';
import { IDENTITY, add, rotate, vec3, type Quat, type Vec3 } from './math';
import type { PropSnapshot } from './props';
import type { Rapier, RapierWorld, RigidBody } from './rapier';

export interface ItemEntity {
  id: string;
  kind: ItemKind;
  body: RigidBody;
}

export interface Items {
  // Course pickups in course order, then dropped ones by counter.
  all(): ItemEntity[];
  get(id: string): ItemEntity | undefined;
  // Removes the body; null if absent.
  take(id: string): ItemKind | null;
  // A new body at rest with its box's bottom face at `at`; returns `item-N`.
  drop(kind: ItemKind, at: Vec3): string;
  // Items below the plane: a dropped one is removed, a course pickup returns to its spawn. Returns their ids.
  killPlane(killPlaneY: number): string[];
  // { id, kind, pos (box centre), rot }.
  snapshot(): PropSnapshot[];
  dispose(): void;
}

const ZERO = vec3(0, 0, 0);

export function createItems(rapier: Rapier, physics: RapierWorld, course: BuiltCourse): Items {
  const entities = new Map<string, ItemEntity>();
  const spawns = new Map<string, Placed>();
  const itemGroups = groups(GROUP_ITEM, GROUP_STATIC);
  let counter = 0;

  const centreOf = (kind: ItemKind, pos: Vec3, rot: Quat): Vec3 => add(pos, rotate(rot, vec3(0, ITEM_KINDS[kind].halfExtents.y, 0)));

  const spawn = (id: string, kind: ItemKind, pos: Vec3, rot: Quat): ItemEntity => {
    const config = ITEM_KINDS[kind];
    const h = config.halfExtents;
    const centre = centreOf(kind, pos, rot);
    const inertia = {
      x: (config.mass / 3) * (h.y * h.y + h.z * h.z),
      y: (config.mass / 3) * (h.x * h.x + h.z * h.z),
      z: (config.mass / 3) * (h.x * h.x + h.y * h.y),
    };
    const body = physics.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(centre.x, centre.y, centre.z)
        .setRotation(rot)
        .setCanSleep(true)
        .setAdditionalMassProperties(config.mass, ZERO, inertia, IDENTITY),
    );
    physics.createCollider(rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(0).setFriction(config.friction).setCollisionGroups(itemGroups), body);
    const entity: ItemEntity = { id, kind, body };
    entities.set(id, entity);
    return entity;
  };

  for (const placed of course.pickups) {
    if (placed.id === 'vehicle' || placed.id === 'hook') throw new Error(`Pickup id ${placed.id} is reserved`);
    if (course.props.some((prop) => prop.id === placed.id) || course.anchors.some((anchor) => anchor.id === placed.id)) {
      throw new Error(`Pickup id ${placed.id} is also a prop or anchor id`);
    }
    if (entities.has(placed.id)) throw new Error(`Duplicate pickup id: ${placed.id}`);
    if (!Object.hasOwn(ITEM_KINDS, placed.kind)) throw new Error(`Unknown item kind: ${placed.kind}`);
    spawns.set(placed.id, placed);
    spawn(placed.id, placed.kind as ItemKind, placed.pose.pos, placed.pose.rot);
  }

  const remove = (entity: ItemEntity) => {
    physics.removeRigidBody(entity.body);
    entities.delete(entity.id);
  };

  return {
    all: () => [...entities.values()],
    get: (id) => entities.get(id),
    take(id) {
      const entity = entities.get(id);
      if (!entity) return null;
      remove(entity);
      return entity.kind;
    },
    drop(kind, at) {
      counter += 1;
      const id = `item-${counter}`;
      spawn(id, kind, at, IDENTITY);
      return id;
    },
    killPlane(killPlaneY) {
      const gone: string[] = [];
      for (const entity of [...entities.values()]) {
        if (entity.body.translation().y >= killPlaneY) continue;
        gone.push(entity.id);
        const placed = spawns.get(entity.id);
        if (!placed) {
          remove(entity);
          continue;
        }
        entity.body.setTranslation(centreOf(entity.kind, placed.pose.pos, placed.pose.rot), true);
        entity.body.setRotation(placed.pose.rot, true);
        entity.body.setLinvel(ZERO, true);
        entity.body.setAngvel(ZERO, true);
      }
      return gone;
    },
    snapshot: () =>
      [...entities.values()].map(({ id, kind, body }) => {
        const pos = body.translation();
        const rot = body.rotation();
        return { id, kind, pos: { x: pos.x, y: pos.y, z: pos.z }, rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w } };
      }),
    dispose() {
      for (const entity of entities.values()) physics.removeRigidBody(entity.body);
      entities.clear();
    },
  };
}
