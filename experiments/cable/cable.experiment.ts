import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, test } from 'vitest';
import { GRAVITY, TICK_DT, TICK_RATE } from '../../packages/shared/src/constants';
import { slopePose } from '../../packages/shared/src/courses/testGround';
import { add, dot, length, rotate, scale, sub, vec3, type Vec3 } from '../../packages/shared/src/math';
import { createRig } from '../../packages/shared/src/testRig';
import type { VehicleId } from '../../packages/shared/src/vehicles';

// Throwaway experiment for build step 1. It finds stable starting values for the force-based
// winch cable at both vehicle masses. Nothing in packages/ imports this file.

interface CableParams {
  // Spring stiffness per kilogram of vehicle, in N/m per kg.
  stiffnessPerKg: number;
  dampingRatio: number;
}

const FORCE_PER_WEIGHT = 0.6;
const REEL_SPEED = 1;
const MIN_LENGTH = 1.5;
const START_ALONG = 8;
const ANCHOR_ALONG = 38;
const GOAL_ALONG = 30;

interface Result {
  vehicle: VehicleId;
  stiffnessPerKg: number;
  dampingRatio: number;
  secondsToTop: number | null;
  maxSpeed: number;
  maxSpin: number;
  maxStretch: number;
  maxSpeedAfterRelease: number;
}

function simulate(vehicle: VehicleId, params: CableParams, brakedSeconds: number): Omit<Result, 'maxSpeedAfterRelease'> & { speedAfterRelease: number } {
  const rig = createRig(RAPIER, vehicle, slopePose('steep', START_ALONG));
  const { body, config } = rig.vehicle;
  rig.run(1, { brake: true });

  const anchor = add(slopePose('steep', ANCHOR_ALONG).pos, vec3(0, 0.5, 0));
  const mount = (): Vec3 => add(body.translation(), rotate(body.rotation(), config.winchMount));
  const stiffness = params.stiffnessPerKg * config.mass;
  const damping = 2 * params.dampingRatio * config.mass * Math.sqrt(params.stiffnessPerKg);
  const cap = FORCE_PER_WEIGHT * config.mass * GRAVITY;
  const startY = body.translation().y;
  const goalGain = slopePose('steep', GOAL_ALONG).pos.y - slopePose('steep', START_ALONG).pos.y;

  let cableLength = length(sub(anchor, mount()));
  let secondsToTop: number | null = null;
  let maxSpeed = 0;
  let maxSpin = 0;
  let maxStretch = 0;
  let speedAfterRelease = 0;

  const totalTicks = (brakedSeconds + 40) * TICK_RATE;
  for (let tick = 0; tick < totalTicks; tick++) {
    const braked = tick < brakedSeconds * TICK_RATE;
    const from = mount();
    const toAnchor = sub(anchor, from);
    const distance = length(toAnchor);
    const direction = scale(toAnchor, 1 / distance);
    const stretch = distance - cableLength;
    // Positive when the two ends are moving apart.
    const stretchRate = -dot(body.velocityAtPoint(from), direction);
    const tension = stretch > 0 ? Math.min(cap, Math.max(0, stiffness * stretch + damping * stretchRate)) : 0;
    if (tension > 0) body.applyImpulseAtPoint(scale(direction, tension * TICK_DT), from, true);
    // The cable does not shorten while its tension is at the cap.
    if (tension < cap) cableLength = Math.max(MIN_LENGTH, cableLength - REEL_SPEED * TICK_DT);

    rig.vehicle.step({ throttle: 0, steer: 0, brake: braked });
    rig.world.step();

    const speed = length(body.linvel());
    maxSpeed = Math.max(maxSpeed, speed);
    maxSpin = Math.max(maxSpin, length(body.angvel()));
    maxStretch = Math.max(maxStretch, stretch);
    if (!braked && tick < (brakedSeconds + 3) * TICK_RATE) speedAfterRelease = Math.max(speedAfterRelease, speed);
    if (secondsToTop === null && body.translation().y - startY >= goalGain) {
      secondsToTop = (tick + 1) / TICK_RATE - brakedSeconds;
    }
  }
  return { vehicle, ...params, secondsToTop, maxSpeed, maxSpin, maxStretch, speedAfterRelease };
}

beforeAll(async () => {
  await RAPIER.init();
});

test('sweep cable stiffness and damping for both vehicles', () => {
  const rows: Result[] = [];
  for (const vehicle of ['lodgy', 'rv'] as const) {
    for (const stiffnessPerKg of [20, 60, 150, 400]) {
      for (const dampingRatio of [0.5, 1, 2]) {
        const free = simulate(vehicle, { stiffnessPerKg, dampingRatio }, 0);
        const stalled = simulate(vehicle, { stiffnessPerKg, dampingRatio }, 5);
        rows.push({
          vehicle,
          stiffnessPerKg,
          dampingRatio,
          secondsToTop: free.secondsToTop,
          maxSpeed: free.maxSpeed,
          maxSpin: free.maxSpin,
          maxStretch: free.maxStretch,
          maxSpeedAfterRelease: stalled.speedAfterRelease,
        });
      }
    }
  }
  const fmt = (n: number | null) => (n === null ? 'never' : n.toFixed(2));
  console.log('vehicle  k/kg  zeta  toTop(s)  maxSpeed  maxSpin  maxStretch  speedAfterRelease');
  for (const r of rows) {
    console.log(
      [r.vehicle.padEnd(7), String(r.stiffnessPerKg).padStart(5), fmt(r.dampingRatio).padStart(5), fmt(r.secondsToTop).padStart(9),
        fmt(r.maxSpeed).padStart(9), fmt(r.maxSpin).padStart(8), fmt(r.maxStretch).padStart(11), fmt(r.maxSpeedAfterRelease).padStart(18)].join(' '),
    );
  }
});
