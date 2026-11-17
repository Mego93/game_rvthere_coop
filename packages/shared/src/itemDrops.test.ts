import { describe, expect, it } from 'vitest';
import { eligibleSpans, hashSeed } from './ambient';
import {
  AMBIENT_REARM_CLEAR,
  ITEM_DROP_AHEAD,
  ITEM_DROP_BEHIND,
  ITEM_DROP_EDGE_OFFSET,
  ITEM_DROP_JITTER,
  ITEM_DROP_MIX,
  ITEM_DROP_PICKUP_CLEAR,
  ITEM_DROP_SPACING,
  ROAD_WIDTH,
} from './constants';
import { getCourse } from './courses/index';
import { createItemDirector, markDropped, mixSeed, planItemDrops, rearmItems, stepItemDirector, type ItemDropEvent } from './itemDrops';
import { createRouteIndex } from './routeAlong';

const marrakech = getCourse('marrakech');
const index = createRouteIndex(marrakech.route);
const routeLength = index.length;
const blocked = marrakech.ambient!.blocked;
const alongOf = (p: { x: number; z: number }) => index.project(p.x, p.z).along;
const pickupAlongs = marrakech.pickups.map((p) => alongOf({ x: p.pose.pos.x, z: p.pose.pos.z }));
const seed = mixSeed(hashSeed('marrakech'), 1);
const plan = planItemDrops(seed, routeLength, blocked, pickupAlongs);
const eligible = eligibleSpans(routeLength, [...blocked, ...pickupAlongs.map((a) => ({ from: a - 40, to: a + 40 }))]).reduce((s, x) => s + x.to - x.from, 0);

describe('mixSeed', () => {
  it('mixes both inputs into an unsigned integer', () => {
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
    expect(mixSeed(5, 1)).not.toBe(mixSeed(5, 2));
    expect(mixSeed(5, 1)).toBe(mixSeed(5, 1));
    for (const [a, b] of [[0, 0], [1, 1], [hashSeed('marrakech'), 7]] as const) {
      const m = mixSeed(a, b);
      expect(Number.isInteger(m) && m >= 0 && m < 2 ** 32).toBe(true);
    }
  });
  it('is not a plain XOR: neighbouring run numbers differ in many bits', () => {
    const x = mixSeed(100, 1) ^ mixSeed(100, 2);
    let bits = 0;
    for (let v = x >>> 0; v; v >>>= 1) bits += v & 1;
    expect(bits).toBeGreaterThan(8);
  });
});

describe('T1 planItemDrops on marrakech', () => {
  it('is deterministic for a seed and differs for another', () => {
    expect(planItemDrops(seed, routeLength, blocked, pickupAlongs)).toEqual(plan);
    expect(planItemDrops(mixSeed(hashSeed('marrakech'), 2), routeLength, blocked, pickupAlongs)).not.toEqual(plan);
  });
  it('has ids 0..n-1 in increasing along order', () => {
    plan.forEach((e, i) => expect(e.id).toBe(i));
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.along).toBeGreaterThan(plan[i - 1]!.along);
  });
  it('keeps spacing of at least spacing - 2 jitter', () => {
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.along - plan[i - 1]!.along).toBeGreaterThanOrEqual(ITEM_DROP_SPACING - 2 * ITEM_DROP_JITTER - 1e-9);
  });
  it('never lies in a blocked span or within 40 m of a course pickup', () => {
    for (const e of plan) {
      for (const b of blocked) expect(e.along < b.from || e.along > b.to).toBe(true);
      for (const a of pickupAlongs) expect(Math.abs(e.along - a)).toBeGreaterThanOrEqual(ITEM_DROP_PICKUP_CLEAR);
    }
  });
  it('lies on the shoulder side of the road', () => {
    for (const e of plan) {
      expect(e.side === 1 || e.side === -1).toBe(true);
      expect(e.lateral).toBe(e.side * (ROAD_WIDTH / 2 + ITEM_DROP_EDGE_OFFSET));
    }
  });
  it('count follows the eligible length', () => {
    const expected = eligible / ITEM_DROP_SPACING;
    // Measured: route 22458 m, eligible 13295 m (expected 22.2), 22 events for run 1; the tolerance is one drop plus 10 %.
    expect(Math.round(eligible)).toBe(13295);
    expect(plan.length).toBe(22);
    expect(Math.abs(plan.length - expected)).toBeLessThanOrEqual(1 + 0.1 * expected);
    expect(plan.length).toBeGreaterThan(0);
  });
  it('kind mix is within a binomial tolerance of ITEM_DROP_MIX', () => {
    const n = plan.length;
    for (const kind of ['jerrycan', 'toolbox', 'healthKit'] as const) {
      const p = ITEM_DROP_MIX[kind];
      const got = plan.filter((e) => e.kind === kind).length;
      expect(Math.abs(got - p * n)).toBeLessThanOrEqual(3 * Math.sqrt(n * p * (1 - p)) + 1);
    }
  });
  it('mix probabilities sum to 1', () => {
    expect(ITEM_DROP_MIX.jerrycan + ITEM_DROP_MIX.toolbox + ITEM_DROP_MIX.healthKit).toBeCloseTo(1, 12);
  });
});

describe('T1 fuel balance on marrakech', () => {
  const stopAlongs = marrakech.stops.filter((s) => s.kind === 'fuel').map((s) => alongOf({ x: s.zone.center.x, z: s.zone.center.z })).sort((a, b) => a - b);
  const edges = [0, ...stopAlongs, routeLength];
  const jerrysPerGap = (p: readonly ItemDropEvent[]) => edges.slice(1).map((edge, i) => p.filter((e) => e.kind === 'jerrycan' && e.along >= edges[i]! && e.along < edge).length);
  it('finds fuel stops', () => {
    expect(stopAlongs.length).toBeGreaterThan(0);
  });
  it('run 1 holds at most one drop jerrycan between two consecutive fuel stops', () => {
    expect(Math.max(...jerrysPerGap(plan))).toBeLessThanOrEqual(1);
  });
  // Seed sweep over runs 1 to 200; the figures are logged for the ROADMAP.
  it('over runs 1 to 200 the mean is at most 0.25 jerrycans per km and the worst run at most 0.45', () => {
    const perKm: number[] = [];
    let doubles = 0;
    for (let run = 1; run <= 200; run++) {
      const p = planItemDrops(mixSeed(hashSeed('marrakech'), run), routeLength, blocked, pickupAlongs);
      perKm.push(p.filter((e) => e.kind === 'jerrycan').length / (routeLength / 1000));
      if (Math.max(...jerrysPerGap(p)) > 1) doubles++;
    }
    const mean = perKm.reduce((a, b) => a + b, 0) / perKm.length;
    const worst = Math.max(...perKm);
    // eslint-disable-next-line no-console
    (globalThis as { console?: { info(...a: unknown[]): void } }).console?.info(`fuel sweep: mean ${mean.toFixed(3)} per km, worst ${worst.toFixed(3)}, ${((doubles / 200) * 100).toFixed(0)} % of runs with a double-jerrycan gap`);
    expect(mean).toBeLessThanOrEqual(0.25);
    expect(worst).toBeLessThanOrEqual(0.45);
  });
});

const ev = (id: number, along: number, kind: ItemDropEvent['kind'] = 'toolbox'): ItemDropEvent => ({ id, along, side: 1, lateral: 6.5, kind });
const none: ReadonlySet<string> = new Set();

describe('T2 director', () => {
  it('drops at 150 m ahead and not before', () => {
    const s = createItemDirector([ev(0, 1000)]);
    expect(stepItemDirector(s, { vehicleAlong: 1000 - ITEM_DROP_AHEAD - 1, existing: none }).drop).toEqual([]);
    const r = stepItemDirector(s, { vehicleAlong: 1000 - ITEM_DROP_AHEAD, existing: none });
    expect(r.drop.map((e) => e.id)).toEqual([0]);
    expect(stepItemDirector(s, { vehicleAlong: 860, existing: none }).drop).toEqual([]);
  });
  it('does not drop an event the vehicle is already past', () => {
    const s = createItemDirector([ev(0, 500)]);
    expect(stepItemDirector(s, { vehicleAlong: 600, existing: none }).drop).toEqual([]);
  });
  it('forgets a drop that left the world (picked up or killed) and never takes it', () => {
    const s = createItemDirector([ev(0, 1000)]);
    stepItemDirector(s, { vehicleAlong: 900, existing: none });
    markDropped(s, 0, 'item-7');
    expect(stepItemDirector(s, { vehicleAlong: 950, existing: new Set(['item-7']) }).take).toEqual([]);
    expect(stepItemDirector(s, { vehicleAlong: 1200, existing: new Set<string>() })).toEqual({ drop: [], take: [] });
    expect(s.owned).toEqual([]);
  });
  it('takes an unclaimed drop at 100 m behind and not before', () => {
    const s = createItemDirector([ev(0, 1000)]);
    stepItemDirector(s, { vehicleAlong: 900, existing: none });
    markDropped(s, 0, 'item-3');
    const ex = new Set(['item-3']);
    expect(stepItemDirector(s, { vehicleAlong: 1000 + ITEM_DROP_BEHIND, existing: ex }).take).toEqual([]);
    expect(stepItemDirector(s, { vehicleAlong: 1000 + ITEM_DROP_BEHIND + 0.5, existing: ex }).take).toEqual(['item-3']);
    expect(stepItemDirector(s, { vehicleAlong: 1200, existing: ex }).take).toEqual([]);
  });
  it('rearmItems keeps events within 60 m ahead or behind fired and re-arms later ones; returns owned ids', () => {
    const s = createItemDirector([ev(0, 500), ev(1, 1050), ev(2, 1061), ev(3, 3000)]);
    stepItemDirector(s, { vehicleAlong: 3000 - ITEM_DROP_AHEAD, existing: none });
    markDropped(s, 3, 'item-9');
    expect(rearmItems(s, 1000)).toEqual(['item-9']);
    expect(s.owned).toEqual([]);
    expect(s.fired).toEqual([true, true, false, false]);
    expect(1000 + AMBIENT_REARM_CLEAR).toBe(1060);
    const r = stepItemDirector(s, { vehicleAlong: 3000 - ITEM_DROP_AHEAD, existing: none });
    expect(r.drop.map((e) => e.id)).toEqual([3]);
  });
  it('two directors fed the same inputs have equal state', () => {
    const a = createItemDirector(plan);
    const b = createItemDirector(plan);
    let n = 0;
    for (let along = 0; along < routeLength; along += 15) {
      const ex = new Set(a.owned.filter((_, i) => i % 2 === 0).map((o) => o.itemId));
      const ra = stepItemDirector(a, { vehicleAlong: along, existing: ex });
      const rb = stepItemDirector(b, { vehicleAlong: along, existing: ex });
      expect(rb).toEqual(ra);
      for (const e of ra.drop) {
        markDropped(a, e.id, `item-${n}`);
        markDropped(b, e.id, `item-${n++}`);
      }
    }
    expect(b).toEqual(a);
    expect(n).toBe(plan.length);
  });
});
