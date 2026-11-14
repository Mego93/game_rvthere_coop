import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { FORD_ROCK, PROP_KINDS } from '../constants';
import { rotate, vec3, type Vec3 } from '../math';
import { VEHICLES } from '../vehicles';
import { airport } from './airport';
import { driveSegment, segmentRouteLength, timeLimit } from './driveRig';
import { getCourse } from './index';

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('airport');
const ROADWORKS = airport.segments.findIndex((s) => s.type === 'roadworks');
const SEGMENTS = airport.segments.map((s, i) => ({ i, type: s.type })).filter((s) => s.i !== ROADWORKS);

// Spec: the RV fails a medium slope unaided; the bank has anchors for the winch.
const RV_NEEDS_WINCH = new Set([8]);

describe.each(Object.keys(VEHICLES))('T3 drive the %s through course 1', (vehicleId) => {
  test.each(SEGMENTS.filter((s) => vehicleId !== 'rv' || !RV_NEEDS_WINCH.has(s.i)))('segment $i ($type) is driven within the time limit', ({ i, type }) => {
    const config = VEHICLES[vehicleId as keyof typeof VEHICLES];
    const limit = timeLimit(segmentRouteLength(course, i), config.maxSpeed);
    const result = driveSegment(RAPIER, vehicleId, course, i);
    expect(result.reached, `${vehicleId} segment ${i}: ${result.seconds.toFixed(1)} s of ${limit.toFixed(1)} s`).toBe(true);
  }, 120_000);
});

describe('T4 course 1 structure for the drive', () => {
  const rv = VEHICLES.rv;
  // A point in a segment's frame: lateral to the right, along the way of travel.
  const localIn = (segment: number, p: Vec3) => {
    const t = course.checkpoints[segment]!.trigger;
    const q = rotate({ x: -t.rot.x, y: -t.rot.y, z: -t.rot.z, w: t.rot.w }, vec3(p.x - t.center.x, p.y - t.center.y, p.z - t.center.z));
    return { lateral: q.x, along: -q.z };
  };
  const inSegment = (segment: number, p: Vec3, length: number) => {
    const { along } = localIn(segment, p);
    return along >= 0 && along <= length;
  };

  test('the roadworks barriers are heavy and the pickup is placed', () => {
    const barriers = course.props.filter((p) => p.id.startsWith(`s${ROADWORKS}-`));
    expect(barriers).toHaveLength(6);
    for (const b of barriers) expect(PROP_KINDS[b.kind as keyof typeof PROP_KINDS].class).toBe('heavy');
    expect(course.pickups.some((p) => p.id.startsWith(`s${ROADWORKS}-`) && p.kind === 'toolbox')).toBe(true);
  });

  test('in every barrier row the gaps between barriers and fences are narrower than the RV', () => {
    const barriers = course.props.filter((p) => p.id.startsWith(`s${ROADWORKS}-`));
    const fences = course.walls.filter((w) => inSegment(ROADWORKS, w.center, 120));
    expect(fences).toHaveLength(2);
    const fenceFaces = fences.map((w) => localIn(ROADWORKS, w.center).lateral).map((c) => Math.sign(c) * (Math.abs(c) - fences[0]!.halfExtents.x));
    const rows = new Map<number, number[][]>();
    for (const b of barriers) {
      const { along, lateral } = localIn(ROADWORKS, b.pose.pos);
      const half = PROP_KINDS.barrier.halfExtents.x;
      const key = Math.round(along);
      rows.set(key, [...(rows.get(key) ?? []), [lateral - half, lateral + half]]);
    }
    expect(rows.size).toBe(2);
    for (const spans of rows.values()) {
      const sorted = spans.sort((a, b) => a[0]! - b[0]!);
      const edges = [Math.min(...fenceFaces), ...sorted.flat(), Math.max(...fenceFaces)];
      for (let k = 0; k < edges.length; k += 2) {
        expect(edges[k + 1]! - edges[k]!, 'a gap').toBeLessThan(2 * rv.halfExtents.x);
      }
    }
  });

  test('the ford lane at lateral +-3 m has no rock centre within the RV half width plus 0.5 m', () => {
    const ford = airport.segments.findIndex((s) => s.type === 'ford');
    const rocks = course.walls.filter((w) => w.halfExtents.x === FORD_ROCK.x && w.halfExtents.z === FORD_ROCK.z && inSegment(ford, w.center, 24));
    expect(rocks).toHaveLength(8);
    for (const lane of [-3, 3]) {
      for (const rock of rocks) {
        expect(Math.abs(localIn(ford, rock.center).lateral - lane)).toBeGreaterThan(rv.halfExtents.x + 0.5);
      }
    }
  });
});
