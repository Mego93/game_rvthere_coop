import { GROUP_ENEMY, GROUP_WORLD, groups } from './groups';
import type { Vec3 } from './math';
import type { Rapier, RapierWorld } from './rapier';

// The first collider a ray meets among the world (ground, walls, the vehicle, props) and the enemies; players are not in the filter, so a shot passes through them.
// `skip` is a collider to ignore, the vehicle's when the eye is inside its box.
export function castShot(rapier: Rapier, physics: RapierWorld, origin: Vec3, dir: Vec3, range: number, skip: number | null): { distance: number; handle: number | null } {
  const hit = physics.castRay(
    new rapier.Ray(origin, dir),
    range,
    true,
    undefined,
    groups(GROUP_WORLD, GROUP_WORLD | GROUP_ENEMY),
    undefined,
    undefined,
    skip === null ? undefined : (collider) => collider.handle !== skip,
  );
  return hit ? { distance: hit.timeOfImpact, handle: hit.collider.handle } : { distance: range, handle: null };
}
