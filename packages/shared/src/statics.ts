import { COURSE_FRICTION, type Surface } from './constants';
import { corridorOf } from './corridor';
import { validateTerrain } from './terrain';
import { GROUP_GROUND, GROUP_ITEM, GROUP_STATIC, GROUP_WORLD, groups } from './groups';
import type { Box, BuiltCourse } from './course';
import type { Rapier, RapierWorld } from './rapier';

export interface Statics {
  // The surface of a ground collider, or null if the handle is not ground.
  surfaceOf(colliderHandle: number): Surface | null;
}

export function buildStatics(rapier: Rapier, world: RapierWorld, course: BuiltCourse): Statics {
  const surfaces = new Map<number, Surface>();
  const addBox = (box: Box, membership: number) =>
    world.createCollider(
      rapier.ColliderDesc.cuboid(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z)
        .setTranslation(box.center.x, box.center.y, box.center.z)
        .setRotation(box.rot)
        .setFriction(COURSE_FRICTION)
        .setCollisionGroups(groups(membership, GROUP_WORLD | GROUP_ITEM)),
    );
  for (const ground of course.ground) surfaces.set(addBox(ground, GROUP_WORLD | GROUP_GROUND | GROUP_STATIC).handle, ground.surface);
  for (const wall of course.walls) addBox(wall, GROUP_WORLD | GROUP_STATIC);
  // The land beside the road: one heightfield per tile, centred on its square (Rapier's layout, see CorridorTile).
  for (const tile of corridorOf(course)?.tiles ?? []) {
    const width = tile.cols * tile.cell;
    const depth = tile.rows * tile.cell;
    const collider = world.createCollider(
      rapier.ColliderDesc.heightfield(tile.rows, tile.cols, tile.heights, { x: width, y: 1, z: depth }, rapier.HeightFieldFlags.FIX_INTERNAL_EDGES)
        .setTranslation(tile.x0 + width / 2, 0, tile.z0 + depth / 2)
        .setFriction(COURSE_FRICTION)
        .setCollisionGroups(groups(GROUP_WORLD | GROUP_GROUND | GROUP_STATIC, GROUP_WORLD | GROUP_ITEM)),
    );
    surfaces.set(collider.handle, 'sand');
  }
  validateTerrain(course.terrain ?? []);
  // Walkable patches: the same layout, with the row-major heights turned into Rapier's column-major order.
  for (const patch of course.terrain ?? []) {
    const width = patch.cols * patch.cell;
    const depth = patch.rows * patch.cell;
    const stride = patch.cols + 1;
    const heights = new Float32Array((patch.cols + 1) * (patch.rows + 1));
    for (let xi = 0; xi <= patch.cols; xi++) for (let zi = 0; zi <= patch.rows; zi++) heights[zi + xi * (patch.rows + 1)] = patch.heights[zi * stride + xi]!;
    const collider = world.createCollider(
      rapier.ColliderDesc.heightfield(patch.rows, patch.cols, heights, { x: width, y: 1, z: depth }, rapier.HeightFieldFlags.FIX_INTERNAL_EDGES)
        .setTranslation(patch.x0 + width / 2, 0, patch.z0 + depth / 2)
        .setFriction(COURSE_FRICTION)
        .setCollisionGroups(groups(GROUP_WORLD | GROUP_GROUND | GROUP_STATIC, GROUP_WORLD | GROUP_ITEM)),
    );
    surfaces.set(collider.handle, patch.surface);
  }
  return { surfaceOf: (handle) => surfaces.get(handle) ?? null };
}
