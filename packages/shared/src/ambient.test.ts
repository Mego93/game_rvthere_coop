import { describe, expect, it } from 'vitest';
import { createDirector, eligibleSpans, hashSeed, markHit, mulberry32, planAmbient, rearm, stepDirector, type AmbientEvent } from './ambient';
import {
  AMBIENT_DESPAWN_BEHIND,
  AMBIENT_EDGE_OFFSET,
  AMBIENT_GOAT_SPEED,
  AMBIENT_MAX_GOATS,
  AMBIENT_MAX_SCOOTERS,
  AMBIENT_JITTER,
  AMBIENT_MIN_GAP,
  AMBIENT_REARM_CLEAR,
  AMBIENT_SCOOTER_SPEED,
  AMBIENT_SPACING,
  AMBIENT_SPAWN_AHEAD,
  AMBIENT_TRIGGER,
  ANIMAL_HIT_LINGER,
  FINISH_PAD,
  ROAD_WIDTH,
} from './constants';
import { getCourse, getCourseDef, segmentRanges } from './courses/index';

const marrakech = getCourse('marrakech');
const routeLength = (() => {
  let total = 0;
  for (let i = 1; i < marrakech.route.length; i++) total += Math.hypot(marrakech.route[i]![0] - marrakech.route[i - 1]![0], marrakech.route[i]![1] - marrakech.route[i - 1]![1]);
  return total;
})();
const blocked = marrakech.ambient!.blocked;
const seed = hashSeed('marrakech');
const plan = planAmbient(seed, routeLength, blocked);
// Measured on the real course: route length minus the blocked spans.
const ELIGIBLE_LENGTH = 14904.7;

describe('hashSeed and the PRNG', () => {
  it('is stable and differs by id', () => {
    expect(hashSeed('marrakech')).toBe(hashSeed('marrakech'));
    expect(hashSeed('marrakech')).not.toBe(hashSeed('airport'));
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
  });

  it('gives the same unit-range sequence for a seed', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(5)()).not.toBe(mulberry32(6)());
  });
});

describe('planAmbient (T2)', () => {
  it('derives the least event gap from the spacing and jitter', () => {
    expect(AMBIENT_SPACING - 2 * AMBIENT_JITTER).toBeGreaterThanOrEqual(AMBIENT_MIN_GAP);
  });

  const eligible = routeLength - blocked.reduce((sum, s) => sum + s.to - s.from, 0);

  it('measures the eligible length of marrakech', () => {
    expect(eligible).toBeCloseTo(ELIGIBLE_LENGTH, 0);
    expect(routeLength).toBeCloseTo(segmentRanges(getCourseDef('marrakech')!).at(-1)!.to + FINISH_PAD, 0);
  });

  it('is deterministic for a seed and differs for another', () => {
    expect(planAmbient(seed, routeLength, blocked)).toEqual(plan);
    expect(planAmbient(seed + 1, routeLength, blocked)).not.toEqual(plan);
  });

  it('keeps events out of blocked spans, apart, ordered and numbered', () => {
    expect(plan.length).toBeGreaterThan(0);
    plan.forEach((e, i) => {
      expect(e.id).toBe(i);
      expect(blocked.some((s) => e.along >= s.from && e.along <= s.to)).toBe(false);
      if (i > 0) expect(e.along - plan[i - 1]!.along).toBeGreaterThanOrEqual(AMBIENT_MIN_GAP);
    });
  });

  it('keeps events 60 m from every stop and inserted segment of marrakech', () => {
    const def = getCourseDef('marrakech')!;
    const r = segmentRanges(def);
    def.segments.forEach((s, i) => {
      const spans: [number, number][] = [];
      if (s.type !== 'road' || s.slope) spans.push([r[i]!.from, r[i]!.to]);
      if (s.stop) spans.push([r[i]!.from + s.stop.along, r[i]!.from + s.stop.along]);
      for (const [a, b] of spans) for (const e of plan) expect(e.along < a - 59.9 || e.along > b + 59.9).toBe(true);
    });
  });

  it('has a goat share of 70 % +-15 % and both sides', () => {
    const goats = plan.filter((e) => e.kind === 'goat').length / plan.length;
    expect(goats).toBeGreaterThan(0.55);
    expect(goats).toBeLessThan(0.85);
    expect(plan.some((e) => e.side === -1)).toBe(true);
    expect(plan.some((e) => e.side === 1)).toBe(true);
  });

  it('has a count within 10 % of eligible length / spacing', () => {
    const expected = ELIGIBLE_LENGTH / AMBIENT_SPACING;
    expect(Math.abs(plan.length - expected)).toBeLessThanOrEqual(expected * 0.1);
  });

  it('places nothing on a fully blocked route and joins gaps across a blocked span', () => {
    expect(planAmbient(1, 500, [{ from: 0, to: 500 }])).toEqual([]);
    const events = planAmbient(1, 2000, [{ from: 500, to: 1500 }]);
    expect(events.length).toBeGreaterThan(4);
    for (const e of events) expect(e.along < 500 || e.along > 1500).toBe(true);
    expect(eligibleSpans(2000, [{ from: 500, to: 1500 }])).toEqual([{ from: 0, to: 500 }, { from: 1500, to: 2000 }]);
  });
});

const ev = (id: number, along: number, side: -1 | 1, kind: 'goat' | 'scooter'): AmbientEvent => ({ id, along, side, kind });
const at = (vehicleAlong: number, dt = 0.1) => ({ vehicleAlong, vehicleLateral: 0, dt });
const HALF = ROAD_WIDTH / 2;

describe('director (T3)', () => {
  it('spawns at the spawn distance and not before', () => {
    const d = createDirector([ev(0, 500, 1, 'goat')]);
    expect(stepDirector(d, at(500 - AMBIENT_SPAWN_AHEAD - 0.5)).spawn).toEqual([]);
    const { spawn } = stepDirector(d, at(500 - AMBIENT_SPAWN_AHEAD));
    expect(spawn).toEqual([{ id: 1, eventId: 0, kind: 'goat', along: 500, lateral: HALF + AMBIENT_EDGE_OFFSET }]);
    expect(stepDirector(d, at(500 - AMBIENT_SPAWN_AHEAD + 1)).spawn).toEqual([]);
  });

  it('puts a left-side animal at a negative lateral', () => {
    const d = createDirector([ev(0, 500, -1, 'scooter')]);
    expect(stepDirector(d, at(400)).spawn[0]!.lateral).toBe(-(HALF + AMBIENT_EDGE_OFFSET));
  });

  it('does not spawn an event the vehicle has already passed', () => {
    const d = createDirector([ev(0, 500, 1, 'goat')]);
    expect(stepDirector(d, at(510)).spawn).toEqual([]);
  });

  it('holds the maxima and spawns the waiting event once a slot frees', () => {
    const plan2 = [...Array(AMBIENT_MAX_GOATS + 2)].map((_, i) => ev(i, 1000 + i * 10, 1, 'goat'));
    const plan3 = [...Array(AMBIENT_MAX_SCOOTERS + 2)].map((_, i) => ev(plan2.length + i, 1000 + i * 10, -1, 'scooter'));
    const d = createDirector([...plan2, ...plan3].sort((a, b) => a.along - b.along));
    const { spawn } = stepDirector(d, at(950));
    expect(spawn.filter((s) => s.kind === 'goat')).toHaveLength(AMBIENT_MAX_GOATS);
    expect(spawn.filter((s) => s.kind === 'scooter')).toHaveLength(AMBIENT_MAX_SCOOTERS);
    expect(stepDirector(d, at(951)).spawn).toEqual([]);
    const first = spawn.find((s) => s.kind === 'goat')!;
    markHit(d, first.id);
    stepDirector(d, at(951, ANIMAL_HIT_LINGER));
    expect(d.animals.filter((a) => a.kind === 'goat')).toHaveLength(AMBIENT_MAX_GOATS);
  });

  it('crosses a goat straight across and stops it beyond the far edge', () => {
    const d = createDirector([ev(0, 500, 1, 'goat')]);
    stepDirector(d, at(380));
    stepDirector(d, at(500 - AMBIENT_TRIGGER - 1));
    expect(d.animals[0]!.phase).toBe('wait');
    expect(d.animals[0]!.lateral).toBe(HALF + AMBIENT_EDGE_OFFSET);
    stepDirector(d, at(500 - AMBIENT_TRIGGER, 1));
    expect(d.animals[0]!.lateral).toBeCloseTo(HALF + AMBIENT_EDGE_OFFSET - AMBIENT_GOAT_SPEED, 9);
    expect(d.animals[0]!.velocity).toBe(-AMBIENT_GOAT_SPEED);
    for (let i = 0; i < 100; i++) stepDirector(d, at(460, 0.1));
    expect(d.animals[0]!.lateral).toBeCloseTo(-(HALF + 2), 9);
    expect(d.animals[0]!.velocity).toBe(0);
    expect(d.animals[0]!.along).toBe(500);
  });

  it('sends a scooter on until its lateral distance reaches the limit, then removes it', () => {
    const d = createDirector([ev(0, 500, -1, 'scooter')]);
    stepDirector(d, at(400));
    stepDirector(d, at(455, 0.1));
    expect(d.animals[0]!.velocity).toBe(AMBIENT_SCOOTER_SPEED);
    let removed: number[] = [];
    let steps = 0;
    while (removed.length === 0 && steps++ < 1000) {
      const before = d.animals[0]!.lateral;
      removed = stepDirector(d, at(455, 0.1)).despawn;
      if (removed.length === 0) expect(d.animals[0]!.lateral).toBeGreaterThan(before);
    }
    expect(removed).toEqual([1]);
    expect(d.animals).toHaveLength(0);
    // From -6.5 to +20 at 4.5 m/s, 0.1 s steps.
    expect(steps * 0.1).toBeGreaterThan((HALF + 15 + HALF + AMBIENT_EDGE_OFFSET) / AMBIENT_SCOOTER_SPEED - 0.3);
    expect(steps * 0.1).toBeLessThan((HALF + 15 + HALF + AMBIENT_EDGE_OFFSET) / AMBIENT_SCOOTER_SPEED + 0.3);
  });

  it('removes an animal once the vehicle is 80 m past it', () => {
    const d = createDirector([ev(0, 500, 1, 'goat')]);
    stepDirector(d, at(400));
    expect(stepDirector(d, at(500 + AMBIENT_DESPAWN_BEHIND)).despawn).toEqual([]);
    expect(stepDirector(d, at(500 + AMBIENT_DESPAWN_BEHIND + 0.1)).despawn).toEqual([1]);
  });

  it('stops a hit animal and removes it 1.5 s later', () => {
    const d = createDirector([ev(0, 500, 1, 'goat')]);
    stepDirector(d, at(460));
    stepDirector(d, at(460, 0.5));
    const lateral = d.animals[0]!.lateral;
    markHit(d, 1);
    expect(d.animals[0]!.velocity).toBe(0);
    stepDirector(d, at(460, 1));
    expect(d.animals[0]!.lateral).toBe(lateral);
    expect(stepDirector(d, at(460, ANIMAL_HIT_LINGER - 1 - 0.01)).despawn).toEqual([]);
    expect(stepDirector(d, at(460, 0.02)).despawn).toEqual([1]);
  });

  it('rearms: removes everyone, clears only the near stretch ahead, re-arms the rest, never reuses ids', () => {
    const d = createDirector([ev(0, 400, 1, 'goat'), ev(1, 500, 1, 'goat'), ev(2, 450 + AMBIENT_REARM_CLEAR, -1, 'scooter'), ev(3, 450 + AMBIENT_REARM_CLEAR + 1, 1, 'goat')]);
    stepDirector(d, at(380));
    expect(d.animals).toHaveLength(2);
    expect(rearm(d, 450)).toEqual([1, 2]);
    expect(d.animals).toHaveLength(0);
    // Events behind and within the clear stretch stay fired; the one just beyond it comes back at once.
    const { spawn } = stepDirector(d, at(450));
    expect(spawn).toEqual([{ id: 3, eventId: 3, kind: 'goat', along: 450 + AMBIENT_REARM_CLEAR + 1, lateral: HALF + AMBIENT_EDGE_OFFSET }]);
  });

  it('is deterministic for equal inputs', () => {
    const run = () => {
      const d = createDirector(plan);
      const out: unknown[] = [];
      for (let along = 0; along < 3000; along += 0.5) out.push(stepDirector(d, at(along, 1 / 30)));
      return { d, out };
    };
    const a = run();
    const b = run();
    expect(a.d).toEqual(b.d);
    expect(a.out).toEqual(b.out);
  });
});
