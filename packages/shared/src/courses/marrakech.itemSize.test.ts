import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import type { AmbientEvent } from '../ambient';
import { AMBIENT_MAX_GOATS, AMBIENT_MAX_SCOOTERS } from '../constants';
import type { ItemDropEvent } from '../itemDrops';
import { createWorld } from '../world';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };

beforeAll(async () => {
  await RAPIER.init();
});

const dense: AmbientEvent[] = Array.from({ length: AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS }, (_, i) => ({
  id: i,
  along: 40 + i * 8,
  side: i % 2 === 0 ? 1 : -1,
  kind: i < AMBIENT_MAX_GOATS ? 'goat' : 'scooter',
}));
const SIX = 6;
const KINDS = ['jerrycan', 'toolbox', 'healthKit', 'tajine'] as const;
const drops: ItemDropEvent[] = Array.from({ length: SIX }, (_, i) => ({ id: i, along: 30 + i * 20, side: i % 2 === 0 ? 1 : -1, lateral: (i % 2 === 0 ? 1 : -1) * 6.5, kind: KINDS[i % 4]! }));

// Measured: 30055 bytes in all, six drops add 1264 bytes (26053 before the step 28d parkour props; limit raised per P2).
test('T7: six live drops add at most 1.5 KB to the marrakech full snapshot with 6 players and 9 animals, which stays under 32 KB', () => {
  const size = (s: object) => JSON.stringify({ type: 'snapshot', ackSeq: 0, full: true, ...s }).length;
  const build = (itemDrops: boolean) => {
    const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId: 'lodgy', ambient: true, ambientPlan: dense, itemDrops, itemPlan: drops });
    for (let i = 1; i <= 6; i++) world.addPlayer(`player${i}`);
    for (let i = 0; i < 60; i++) world.step(new Map());
    const snapshot = world.snapshot();
    world.dispose();
    return snapshot;
  };
  const without = size(build(false));
  const snapshot = build(true);
  expect(snapshot.props.filter((prop) => /^item-\d+$/.test(prop.id))).toHaveLength(SIX);
  expect(snapshot.animals).toHaveLength(AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS);
  const total = size(snapshot);
  console.info(`T7 full snapshot with drops: ${total} bytes, six drops add ${total - without} bytes`);
  expect(total).toBeLessThan(32_000);
  expect(total - without).toBeLessThanOrEqual(1500);
});
