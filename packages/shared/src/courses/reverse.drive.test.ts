import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import type { SegmentDef } from '../segments';
import { driveSegment } from './driveRig';
import { getCourse, getCourseDef } from './index';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };

beforeAll(async () => {
  await RAPIER.init();
});

// Gates, crate walls, roadblocks and roadworks need a driver on foot to open them; the stage drive tests leave those segments out too.
const BLOCKING = new Set(['gates', 'crateWall', 'roadblock']);
const blocking = (s: SegmentDef): boolean => s.type === 'roadworks' || (s.type === 'road' && (s.hazards ?? []).some((h) => BLOCKING.has(h.kind)));

describe('airport-home, driven by the Lodgy segment by segment', () => {
  const course = getCourse('airport-home');
  const def = getCourseDef('airport-home')!;
  const driven = def.segments.map((s, i) => ({ s, i })).filter(({ s }) => !blocking(s));

  test('every segment without a blocking hazard is driven to the next checkpoint within the time bound, with no fall below the kill plane', () => {
    expect(driven.length).toBeGreaterThan(def.segments.length / 2);
    const failed: string[] = [];
    let lowest = Infinity;
    for (const { s, i } of driven) {
      const result = driveSegment(RAPIER, 'lodgy', course, i);
      lowest = Math.min(lowest, result.minY - course.killPlaneY);
      if (!result.reached) failed.push(`${i} (${s.type}) after ${result.seconds.toFixed(0)} s`);
      else if (result.minY < course.killPlaneY) failed.push(`${i} (${s.type}) fell below the kill plane`);
    }
    console.info(`airport-home: ${driven.length} of ${def.segments.length} segments driven, lowest ${lowest.toFixed(1)} m above the kill plane`);
    expect(failed).toEqual([]);
  }, 600_000);
});
