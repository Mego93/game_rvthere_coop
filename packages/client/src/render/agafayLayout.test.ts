import { ROAD_WIDTH, getCourse } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { ARCH, archPoses, tangentYaw } from './agafayLayout';

const course = getCourse('agafay');

describe('tangentYaw', () => {
  it('is 0 for the -z heading and turns a quarter for the +x heading', () => {
    expect(tangentYaw(0, -1)).toBeCloseTo(0);
    expect(tangentYaw(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(tangentYaw(-1, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('the start and finish arches', () => {
  const { start, finish } = archPoses(course);

  it('are wide enough for the road and its shoulders', () => {
    expect(ARCH.span).toBeGreaterThan(ROAD_WIDTH + 2);
    expect(ARCH.height).toBeGreaterThan(5);
  });

  it('puts the start arch on the road a little ahead of the start, across it', () => {
    expect(Math.hypot(start.x - course.route[0]![0], start.z - course.route[0]![1])).toBeGreaterThan(15);
    expect(Math.hypot(start.x - course.route[0]![0], start.z - course.route[0]![1])).toBeLessThan(40);
    // The road runs toward -z at the start; the arch's own x axis is across the road, so its yaw is 0.
    expect(start.yaw).toBeCloseTo(0);
    expect(start.x).toBeCloseTo(0);
  });

  it('puts the finish arch on the finish box, turned the way the box is', () => {
    expect(finish.x).toBeCloseTo(course.finish.center.x);
    expect(finish.z).toBeCloseTo(course.finish.center.z);
    const rot = course.finish.rot;
    expect(finish.yaw).toBeCloseTo(2 * Math.atan2(rot.y, rot.w));
  });

  it('stands both on the ground', () => {
    for (const pose of [start, finish]) expect(Number.isFinite(pose.y)).toBe(true);
    expect(start.y).toBeCloseTo(0, 0);
  });
});
