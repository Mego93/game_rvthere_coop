import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../constants';
import { hashSeed, planAmbient } from '../ambient';
import { mixSeed, planItemDrops } from '../itemDrops';
import { createRouteIndex } from '../routeAlong';
import { buildSegment, type SegmentDef } from '../segments';
import { courseIds, getCourse, getCourseDef, segmentRanges } from './index';
import { TERRAIN_DEEP_CLEAR, TERRAIN_HAZARD_CLEAR } from './marrakech.extras';
import { MARRAKECH_INSERTED } from './marrakech.generated';
import { MARRAKECH_TERRAIN, MAX_TERRAIN_DISTANCE, planMarrakech } from './marrakech.plan';
import { CREST_AND_PULL, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const def = getCourseDef('marrakech')!;
const ranges = segmentRanges(def);
const total = ranges[ranges.length - 1]!.to;
const roads = def.segments.map((s, i) => ({ s: s as RoadDef, i })).filter(({ s }) => s.type === 'road');
const mid = (i: number): number => (ranges[i]!.from + ranges[i]!.to) / 2;
const fuel = roads.filter(({ s }) => s.stop?.kind === 'fuel').map(({ i }) => i);
const garages = roads.filter(({ s }) => s.stop?.kind === 'garage').map(({ i }) => i);
const finish = total + 20;

describe('registration (T11)', () => {
  it('makes marrakech the campaign and registers every course', () => {
    expect(CAMPAIGN).toEqual(['marrakech']);
    expect(courseIds().sort()).toEqual(['airport', 'marrakech', 'segment-demo', 'test']);
    expect(getCourse('marrakech')).toBe(getCourse('marrakech'));
    expect(getCourse('marrakech').id).toBe('marrakech');
    expect(getCourse('marrakech').targetTime).toBe(1800);
    expect(def.id).toBe('marrakech');
    expect(Object.isFrozen(def.segments[0])).toBe(true);
  });
});

describe('stops (T7)', () => {
  it('has fuel stops every 1.5 km at most, from the start to the finish', () => {
    expect(fuel.length).toBeGreaterThanOrEqual(17);
    expect(fuel.length).toBeLessThanOrEqual(22);
    const gaps = [mid(fuel[0]!), ...fuel.slice(1).map((f, n) => mid(f) - mid(fuel[n]!)), finish - mid(fuel[fuel.length - 1]!)];
    for (const gap of gaps) expect(gap).toBeLessThanOrEqual(1500);
  });

  it('alternates the sides of the fuel stops', () => {
    const sides = fuel.map((i) => (def.segments[i] as RoadDef).stop!.side);
    sides.forEach((side, n) => n > 0 && expect(side).toBe(-sides[n - 1]!));
  });

  it('puts garages about 4 km apart and 200 m from every fuel stop', () => {
    expect(garages.length).toBeGreaterThanOrEqual(4);
    const at = garages.map(mid);
    [0, ...at].forEach((a, n) => n > 0 && expect(a - [0, ...at][n - 1]!).toBeLessThanOrEqual(6000));
    for (const g of garages) for (const f of fuel) expect(Math.abs(mid(g) - mid(f))).toBeGreaterThanOrEqual(200);
  });

  it('keeps every stop on a flat straight of 60 m or more at its middle, never on the ends or inserted terrain', () => {
    for (const i of [...fuel, ...garages]) {
      const s = def.segments[i] as RoadDef;
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(def.segments.length - 1);
      expect(MARRAKECH_INSERTED).not.toContain(i);
      expect(s.curve).toBeUndefined();
      expect(s.slope).toBeUndefined();
      expect(s.length).toBeGreaterThanOrEqual(60);
      expect(Math.abs(s.stop!.along - s.length / 2)).toBeLessThanOrEqual(0.06);
      expect(s.hazards).toBeUndefined();
    }
    expect(getCourse('marrakech').stops).toHaveLength(fuel.length + garages.length);
  });
});

describe('hazards (T6)', () => {
  // The parkour sections carry their own hazards; the plan's five sit on ordinary segments.
  const hazards = roads.filter(({ i }) => !MARRAKECH_INSERTED.includes(i)).flatMap(({ s, i }) => (s.hazards ?? []).map((h) => ({ kind: h.kind, i, at: mid(i) })));

  it('has the five of the plan near their fractions (A5: up to 1.3 km)', () => {
    expect(hazards.map((h) => h.kind)).toEqual(['crateWall', 'gates', 'roadblock', 'crateWall', 'roadblock']);
    const fractions = [0.12, 0.3, 0.45, 0.72, 0.93];
    hazards.forEach((h, n) => expect(Math.abs(h.at - fractions[n]! * total)).toBeLessThanOrEqual(1300));
  });

  it('never sits on a stop, inserted terrain or either end, and gates get 65 m', () => {
    for (const h of hazards) {
      const s = def.segments[h.i] as RoadDef;
      expect(s.stop).toBeUndefined();
      expect(MARRAKECH_INSERTED).not.toContain(h.i);
      expect(h.i).toBeGreaterThan(0);
      expect(h.i).toBeLessThan(def.segments.length - 1);
      expect(s.length).toBeGreaterThanOrEqual(h.kind === 'gates' ? 65 : 22);
      expect(() => buildSegment(s)).not.toThrow();
    }
  });
});

describe('pickups and coins (T8)', () => {
  const course = getCourse('marrakech');
  const pickupAt = (kind: string): number[] =>
    roads.flatMap(({ s, i }) => (s.pickups ?? []).filter((p) => p.kind === kind).map((p) => ranges[i]!.from + p.along));

  it.each(['jerrycan', 'toolbox', 'healthKit'])('has a %s at least every 1.5 km plus 400 m of slack', (kind) => {
    const at = pickupAt(kind);
    at.forEach((a, n) => n > 0 && expect(a - at[n - 1]!).toBeLessThanOrEqual(1900));
    expect(finish - at[at.length - 1]!).toBeLessThanOrEqual(2400);
  });

  it('keeps the villa lane pickups as at the airport', () => {
    expect((def.segments[0] as RoadDef).pickups).toEqual([
      { kind: 'jerrycan', along: 30, lateral: -3 },
      { kind: 'toolbox', along: 30, lateral: 3 },
      { kind: 'healthKit', along: 40, lateral: 0 },
    ]);
  });

  it('puts about one coin per 250 m on straights of 30 m or more', () => {
    const want = total / 250;
    expect(Math.abs(course.coins.length - want)).toBeLessThanOrEqual(0.1 * want);
    for (const { s, i } of roads) {
      if (!s.coins) continue;
      expect(s.curve).toBeUndefined();
      expect(s.length).toBeGreaterThanOrEqual(30);
      expect(MARRAKECH_INSERTED).not.toContain(i);
    }
  });

  it('has unique ids', () => {
    const ids = [...course.coins, ...course.pickups, ...course.props, ...course.anchors, ...course.stops].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parkour sections (28d)', () => {
  const sections = [
    { name: 'parkour', defs: RUBBLE_RUN, clear: TERRAIN_HAZARD_CLEAR },
    { name: 'parkour', defs: CREST_AND_PULL, clear: TERRAIN_HAZARD_CLEAR },
    { name: 'parkourPit', defs: PIT_GAUNTLET, clear: TERRAIN_DEEP_CLEAR },
  ].map((s) => {
    const first = def.segments.findIndex((_, i) => s.defs.every((d, k) => JSON.stringify(def.segments[i + k]) === JSON.stringify(d)));
    return { ...s, first, last: first + s.defs.length - 1 };
  });
  // The inserted terrain as runs of consecutive segment indexes, in course order.
  const groups: { first: number; last: number }[] = [];
  for (const i of MARRAKECH_INSERTED) {
    const last = groups[groups.length - 1];
    if (last && last.last === i - 1) last.last = i;
    else groups.push({ first: i, last: i });
  }
  const between = (a: { first: number; last: number }, b: { first: number; last: number }): number => Math.max(ranges[b.first]!.from - ranges[a.last]!.to, ranges[a.first]!.from - ranges[b.last]!.to);

  it('holds the three sections once each, in order, as whole inserted groups', () => {
    expect(sections.every((s) => s.first > 0)).toBe(true);
    expect(sections[0]!.last).toBeLessThan(sections[1]!.first);
    expect(sections[1]!.last).toBeLessThan(sections[2]!.first);
    for (const s of sections) expect(groups).toContainEqual({ first: s.first, last: s.last });
    expect(sections.reduce((sum, s) => sum + s.defs.length, 0)).toBe(19);
  });

  it('puts each section within MAX_TERRAIN_DISTANCE of its target and fills the placement list', () => {
    const terrain = planMarrakech().placements.slice(-MARRAKECH_TERRAIN.length);
    const entries = MARRAKECH_TERRAIN.map((e, i) => ({ e, p: terrain[i]! })).filter(({ e }) => e.name.startsWith('parkour'));
    expect(entries.map(({ e }) => [e.name, e.fraction])).toEqual([['parkour', 0.1], ['parkour', 0.43], ['parkourPit', 0.72]]);
    for (const { e, p } of entries) expect(p.distance, `${e.name} ${e.fraction}`).toBeLessThanOrEqual(MAX_TERRAIN_DISTANCE);
  });

  it('keeps each section 120 m (150 m for the pit section) from every insert and terrain group placed before it', () => {
    for (const [n, s] of sections.entries()) {
      for (const g of groups) {
        // The sections are placed last and in order, so only the later ones are exempt.
        if (g.first === s.first || sections.slice(n + 1).some((o) => o.first === g.first)) continue;
        expect(between(s, g), `section at ${s.first} and group at ${g.first}`).toBeGreaterThanOrEqual(s.clear - 1e-6);
      }
    }
  });

  it('keeps every stop and hazard outside the sections by the terrain clearance, and no random pickup, coin, stop or garage on a section segment (each is exactly its def)', () => {
    for (const s of sections) {
      for (let i = s.first; i <= s.last; i++) {
        const d = def.segments[i] as SegmentDef;
        expect(JSON.stringify(d), `segment ${i}`).toBe(JSON.stringify(s.defs[i - s.first]));
        if (d.type === 'road') {
          expect(d.stop).toBeUndefined();
          expect(d.coins).toBeUndefined();
        }
      }
      for (const [i, d] of def.segments.entries()) {
        if (d.type !== 'road' || !(d.stop || d.hazards) || (i >= s.first && i <= s.last)) continue;
        const gap = Math.max(ranges[s.first]!.from - ranges[i]!.to, ranges[i]!.from - ranges[s.last]!.to);
        expect(gap, `segment ${i} to the section at ${s.first}`).toBeGreaterThanOrEqual(s.clear - 1e-6);
      }
    }
  });

  it('keeps ambient events and item drops out of the sections, except on the end flat of RUBBLE_RUN', () => {
    const course = getCourse('marrakech');
    const routeIndex = createRouteIndex(course.route);
    const blocked = course.ambient!.blocked;
    const pickups = course.pickups.map((p) => routeIndex.project(p.pose.pos.x, p.pose.pos.z).along);
    const alongs = [
      ...planAmbient(hashSeed('marrakech'), routeIndex.length, blocked).map((e) => e.along),
      ...[1, 2, 3, 4, 5].flatMap((n) => planItemDrops(mixSeed(hashSeed('marrakech'), n), routeIndex.length, blocked, pickups).map((e) => e.along)),
    ];
    expect(alongs.length).toBeGreaterThan(50);
    for (const s of sections) {
      // RUBBLE_RUN's last flat 15 m is not blocked.
      const to = ranges[s.first === sections[0]!.first ? s.last - 1 : s.last]!.to;
      const from = ranges[s.first]!.from;
      for (const a of alongs) expect(a >= from && a <= to, `along ${a.toFixed(0)} in the section at ${s.first}`).toBe(false);
    }
  });
});
