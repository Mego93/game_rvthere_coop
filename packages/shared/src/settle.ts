import type { Vec3 } from './math';
import type { Rapier, RapierWorld } from './rapier';

const PROBE_HEIGHT = 5;
const RETRIES = 2;

// Rapier 0.21 queries see nothing until the broad phase has run: after a teleport two zero-length steps, and one more whenever the step count hits the blind phase (every 8th).
// `above` is a point over a collider; if the probe is still blind after the retries, the caller gets a stale scene.
export function settleQueries(rapier: Rapier, physics: RapierWorld, above: () => Vec3, tickDt: number) {
  const visible = () => {
    const at = above();
    return physics.castRay(new rapier.Ray({ x: at.x, y: at.y + PROBE_HEIGHT, z: at.z }, { x: 0, y: -1, z: 0 }), PROBE_HEIGHT + 1, true) !== null;
  };
  physics.timestep = 0;
  physics.step();
  physics.step();
  for (let extra = 0; extra < RETRIES && !visible(); extra++) physics.step();
  physics.timestep = tickDt;
}
