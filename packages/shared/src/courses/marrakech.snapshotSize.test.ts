import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import type { AmbientEvent } from '../ambient';
import { AMBIENT_MAX_GOATS, AMBIENT_MAX_SCOOTERS } from '../constants';
import { createWorld } from '../world';
import { getCourse } from './index';

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

// Measured: 24789 bytes in all, 898 bytes of them animals.
test('T7: the marrakech full snapshot with 6 players and the most animals is under 25 KB, animals add at most 1 KB', () => {
  const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId: 'lodgy', ambient: true, ambientPlan: dense });
  for (let i = 1; i <= 6; i++) world.addPlayer(`player${i}`);
  for (let i = 0; i < 60; i++) world.step(new Map());
  const snapshot = world.snapshot();
  expect(snapshot.animals).toHaveLength(AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS);
  const size = (s: object) => JSON.stringify({ type: 'snapshot', ackSeq: 0, full: true, ...s }).length;
  const { animals: _animals, ...without } = snapshot;
  const total = size(snapshot);
  const added = total - size(without);
  console.info(`T7 full snapshot: ${total} bytes with 9 animals, animals add ${added} bytes`);
  expect(total).toBeLessThan(25_000);
  expect(added).toBeLessThanOrEqual(1000);
  world.dispose();
});
