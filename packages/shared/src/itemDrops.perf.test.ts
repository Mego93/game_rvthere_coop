import { describe, expect, it } from 'vitest';
import { hashSeed } from './ambient';
import { getCourse } from './courses/index';
import { createItemDirector, markDropped, mixSeed, planItemDrops, stepItemDirector } from './itemDrops';
import { createRouteIndex } from './routeAlong';

// The shared package has no DOM or Node typings.
declare const performance: { now(): number };
declare const console: { info(...args: unknown[]): void };

const marrakech = getCourse('marrakech');
const index = createRouteIndex(marrakech.route);
const pickupAlongs = marrakech.pickups.map((p) => index.project(p.pose.pos.x, p.pose.pos.z).along);
const build = () => planItemDrops(mixSeed(hashSeed('marrakech'), 1), index.length, marrakech.ambient!.blocked, pickupAlongs);

describe('T8 performance on marrakech', () => {
  it('builds the plan in under 50 ms', () => {
    build();
    const start = performance.now();
    const plan = build();
    const ms = performance.now() - start;
    console.info(`T8 plan: ${plan.length} drops in ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(50);
  });

  it('the director costs under 0.1 ms per tick, with six drops owned', () => {
    const plan = build();
    const state = createItemDirector(plan);
    const existing = new Set<string>();
    for (let i = 0; i < 6; i++) {
      markDropped(state, i, `item-${i}`);
      existing.add(`item-${i}`);
    }
    const ticks = 20_000;
    for (let i = 0; i < 1000; i++) stepItemDirector(createItemDirector(plan), { vehicleAlong: i, existing });
    const start = performance.now();
    for (let i = 0; i < ticks; i++) {
      state.owned.length = 0;
      for (let k = 0; k < 6; k++) state.owned.push({ eventId: k, itemId: `item-${k}` });
      stepItemDirector(state, { vehicleAlong: (i / ticks) * index.length, existing });
    }
    const perTick = (performance.now() - start) / ticks;
    console.info(`T8 director: ${(perTick * 1000).toFixed(2)} us per tick`);
    expect(perTick).toBeLessThan(0.1);
  });

  it('drops cause at most one full snapshot per 15 s of driving at 15 m/s, counting two per drop', () => {
    const plan = build();
    const seconds = index.length / 15;
    const interval = seconds / (2 * plan.length);
    console.info(`T8 full snapshots: one per ${interval.toFixed(1)} s (${plan.length} drops over ${seconds.toFixed(0)} s)`);
    expect(interval).toBeGreaterThanOrEqual(15);
  });
});
