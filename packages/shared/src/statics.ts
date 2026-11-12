import type { Surface } from './constants';
import type { Box, BuiltCourse } from './course';
import type { Rapier, RapierWorld } from './rapier';

export interface Statics {
  // The surface of a ground collider, or null if the handle is not ground.
  surfaceOf(colliderHandle: number): Surface | null;
}

export function buildStatics(rapier: Rapier, world: RapierWorld, course: BuiltCourse): Statics {
  const surfaces = new Map<number, Surface>();
  const addBox = (box: Box) =>
    world.createCollider(
      rapier.ColliderDesc.cuboid(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z)
        .setTranslation(box.center.x, box.center.y, box.center.z)
        .setRotation(box.rot)
        .setFriction(1),
    );
  for (const ground of course.ground) surfaces.set(addBox(ground).handle, ground.surface);
  for (const wall of course.walls) addBox(wall);
  return { surfaceOf: (handle) => surfaces.get(handle) ?? null };
}
