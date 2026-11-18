import { describe, expect, it } from 'vitest';
import { AMBIENT_ENDS, AMBIENT_MARGIN, FINISH_PAD, GATES_SPACING } from '../constants';
import { createRouteIndex } from '../routeAlong';
import { hazardSpan, type SegmentDef } from '../segments';
import { buildCourse, type CourseDef } from './build';
import { getCourse, getCourseDef, segmentRanges } from './index';

const road = (length: number, extra: Partial<Extract<SegmentDef, { type: 'road' }>> = {}): SegmentDef => ({ type: 'road', length, ...extra });
const def = (ambient: boolean | undefined, ...segments: SegmentDef[]): CourseDef => ({ id: 'spans', segments, targetTime: 100, ambient });

const segments: SegmentDef[] = [
  road(400),
  road(300, { stop: { kind: 'fuel', side: 1, along: 150 } }),
  road(400),
  road(60, { slope: 8 }),
  road(400),
  { type: 'pit', depth: 3, gradient: 0.3, floor: 10, anchors: 0 },
  road(400),
  road(400, { hazards: [{ kind: 'roadblock', along: 200 }] }),
  road(400),
  road(500, { hazards: [{ kind: 'gates', along: 100, count: 5 }] }),
  road(500, { debris: 3 }),
];

function covers(blocked: { from: number; to: number }[], a: number, b: number): boolean {
  return blocked.some((s) => s.from <= a + 1e-6 && s.to >= b - 1e-6);
}

describe('ambient spans (R2)', () => {
  it('is absent unless the def asks for it', () => {
    expect(buildCourse(def(undefined, ...segments)).ambient).toBeUndefined();
    expect(buildCourse(def(false, ...segments)).ambient).toBeUndefined();
    for (const id of ['test', 'segment-demo', 'airport']) expect(getCourse(id).ambient).toBeUndefined();
  });

  it('blocks the ends, stops, hazards and terrain with their margins, as sorted disjoint spans', () => {
    const d = def(true, ...segments);
    const built = buildCourse(d);
    const blocked = built.ambient!.blocked;
    const r = segmentRanges(d);
    const total = r[r.length - 1]!.to + FINISH_PAD;
    expect(blocked[0]!.from).toBe(0);
    expect(blocked[0]!.to).toBeGreaterThanOrEqual(AMBIENT_ENDS);
    expect(blocked[blocked.length - 1]!.to).toBeCloseTo(total, 6);
    expect(blocked[blocked.length - 1]!.from).toBeLessThanOrEqual(total - AMBIENT_ENDS);
    blocked.forEach((s, i) => {
      expect(s.to).toBeGreaterThan(s.from);
      if (i > 0) expect(s.from).toBeGreaterThan(blocked[i - 1]!.to);
    });
    const stopAt = r[1]!.from + 150;
    expect(covers(blocked, stopAt - AMBIENT_MARGIN, stopAt + AMBIENT_MARGIN)).toBe(true);
    expect(covers(blocked, r[3]!.from - AMBIENT_MARGIN, r[3]!.to + AMBIENT_MARGIN)).toBe(true);
    expect(covers(blocked, r[5]!.from - AMBIENT_MARGIN, r[5]!.to + AMBIENT_MARGIN)).toBe(true);
    const hazardAt = r[7]!.from + 200;
    expect(covers(blocked, hazardAt - AMBIENT_MARGIN, hazardAt + AMBIENT_MARGIN)).toBe(true);
    const gatesAt = r[9]!.from + 100;
    expect(covers(blocked, gatesAt - AMBIENT_MARGIN, gatesAt + 4 * GATES_SPACING + AMBIENT_MARGIN)).toBe(true);
    for (const p of built.props) {
      const along = createRouteIndex(built.route).project(p.pose.pos.x, p.pose.pos.z).along;
      expect(covers(blocked, along, along)).toBe(true);
    }
    // Open road stays open.
    expect(covers(blocked, r[2]!.from + 150, r[2]!.from + 150)).toBe(false);
    expect(covers(blocked, r[8]!.from + 100, r[8]!.from + 100)).toBe(false);
  });

  it('blocks around rocks but not around mud', () => {
    const d = def(true, road(400), road(400, { hazards: [{ kind: 'rocks', along: 200, side: 1 }] }), road(400, { hazards: [{ kind: 'mud', along: 200, length: 16 }] }), road(400));
    const blocked = buildCourse(d).ambient!.blocked;
    const r = segmentRanges(d);
    const [a, b] = hazardSpan({ kind: 'rocks', along: 200, side: 1 });
    expect(covers(blocked, r[1]!.from + a - AMBIENT_MARGIN, r[1]!.from + b + AMBIENT_MARGIN)).toBe(true);
    for (const along of [200, 208, 216]) expect(covers(blocked, r[2]!.from + along, r[2]!.from + along)).toBe(false);
  });

  it('exports the hazard extent including prop depth', () => {
    const [a, b] = hazardSpan({ kind: 'gates', along: 100, count: 3 });
    expect(a).toBeLessThan(100);
    expect(b).toBeGreaterThan(100 + 2 * GATES_SPACING);
  });

  it('blocks every prop of marrakech and the whole extent of every hazard', () => {
    const marrakech = getCourse('marrakech');
    const d = getCourseDef('marrakech')!;
    const blocked = marrakech.ambient!.blocked;
    const r = segmentRanges(d);
    let gates = 0;
    d.segments.forEach((s, i) => {
      if (s.type !== 'road') return;
      for (const h of s.hazards ?? []) {
        if (h.kind === 'mud') continue;
        if (h.kind === 'gates') gates++;
        const [a, b] = hazardSpan(h);
        expect(covers(blocked, r[i]!.from + a - AMBIENT_MARGIN, r[i]!.from + b + AMBIENT_MARGIN)).toBe(true);
      }
    });
    expect(gates).toBeGreaterThan(0);
    const index = createRouteIndex(marrakech.route);
    for (const p of marrakech.props) {
      const along = index.project(p.pose.pos.x, p.pose.pos.z).along;
      expect(covers(blocked, along, along)).toBe(true);
    }
  });

  it('is set on marrakech, covers every inserted segment and every stop, and leaves most of the route open', () => {
    const marrakech = getCourse('marrakech');
    const d = getCourseDef('marrakech')!;
    expect(d.ambient).toBe(true);
    const blocked = marrakech.ambient!.blocked;
    const r = segmentRanges(d);
    d.segments.forEach((s, i) => {
      if (s.type !== 'road' || s.slope) expect(covers(blocked, r[i]!.from, r[i]!.to)).toBe(true);
      if (s.stop) expect(covers(blocked, r[i]!.from + s.stop.along - AMBIENT_MARGIN, r[i]!.from + s.stop.along + AMBIENT_MARGIN)).toBe(true);
    });
    const open = r[r.length - 1]!.to + FINISH_PAD - blocked.reduce((sum, s) => sum + s.to - s.from, 0);
    expect(open).toBeGreaterThan(10000);
  });
});
