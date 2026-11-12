import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import type { ReferenceSlope } from './constants';
import { slopePose } from './courses/testGround';
import { createRig } from './testRig';
import type { VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

// Handling targets. The numbers are the owner's to change, not the implementer's.
const CLIMB_SECONDS = 5;
const CLIMBS_IF_GAIN_ABOVE = 0.5;
const FAILS_IF_GAIN_BELOW = 0;

// Height gained in CLIMB_SECONDS at full throttle, starting at rest 8 m up the slope.
function heightGained(id: VehicleId, slope: ReferenceSlope): number {
  const rig = createRig(RAPIER, id, slopePose(slope, 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos.y;
  rig.run(CLIMB_SECONDS, { throttle: 1 });
  return rig.vehicle.state().pos.y - before;
}

test('the Lodgy climbs the gentle slope unaided', () => {
  expect(heightGained('lodgy', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the Lodgy fails the steep slope unaided', () => {
  expect(heightGained('lodgy', 'steep')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

test('the RV climbs the gentle slope unaided', () => {
  expect(heightGained('rv', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the RV fails the medium slope unaided', () => {
  expect(heightGained('rv', 'medium')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

// The wheel model lets a braked vehicle creep slowly on a steep slope. This bounds the creep.
test.each(['lodgy', 'rv'] as const)('the %s creeps less than 0.1 m/s on the steep slope with the brake on', (id) => {
  const rig = createRig(RAPIER, id, slopePose('steep', 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos;
  rig.run(5, { brake: true });
  const after = rig.vehicle.state().pos;
  expect(Math.hypot(after.y - before.y, after.z - before.z) / 5).toBeLessThan(0.1);
});
