import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import type { AmbientEvent } from '../ambient';
import { AMBIENT_MAX_GOATS, AMBIENT_MAX_SCOOTERS, STAGE_IDS } from '../constants';
import { createWorld } from '../world';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };

beforeAll(async () => {
  await RAPIER.init();
});

const dense: AmbientEvent[] = Array.from({ length: AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS }, (_, i) => ({
  id: i,
  along: 40 + i * 3,
  side: i % 2 === 0 ? 1 : -1,
  kind: i < AMBIENT_MAX_GOATS ? 'goat' : 'scooter',
}));
const size = (s: object) => JSON.stringify({ type: 'snapshot', ackSeq: 0, full: true, ...s }).length;

// The marrakech limits of T7 (marrakech.snapshotSize.test.ts): 32 KB in all, animals add at most 2.2 KB.
for (const courseId of STAGE_IDS) {
  test(`step 40 T11: the ${courseId} full snapshot with 6 players and the most animals is under 32 KB, animals add at most 2.2 KB`, () => {
    const world = createWorld(RAPIER, { courseId, vehicleId: 'lodgy', ambient: true, ambientPlan: dense });
    for (let i = 1; i <= 6; i++) world.addPlayer(`player${i}`);
    for (let i = 0; i < 60; i++) world.step(new Map());
    const snapshot = world.snapshot();
    expect(snapshot.animals).toHaveLength(AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS);
    const { animals: _animals, ...without } = snapshot;
    const total = size(snapshot);
    const added = total - size(without);
    console.info(`T11 ${courseId} full snapshot: ${total} bytes, animals add ${added} bytes`);
    expect(total).toBeLessThan(32_000);
    expect(added).toBeLessThanOrEqual(2200);
    world.dispose();
  });
}
