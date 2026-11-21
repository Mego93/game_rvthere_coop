import { getCourse } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { BOOTH_COUNT, CROSSING, PLAZA_EDGE, RENTAL_BOX, TERMINAL, TERMINAL_PLACES, booths, crossingBars, lampPosts } from './arrivalLayout';

const arrival = getCourse('arrival');

describe('arrival layout', () => {
  it('sets the rental stand on the course\'s wall box, which it must cover exactly', () => {
    const wall = arrival.walls.find((box) => Math.abs(box.center.x - (RENTAL_BOX.x0 + RENTAL_BOX.x1) / 2) < 1e-9 && Math.abs(box.center.z - (RENTAL_BOX.z0 + RENTAL_BOX.z1) / 2) < 1e-9);
    expect(wall).toBeDefined();
    expect(wall!.halfExtents.x * 2).toBeCloseTo(RENTAL_BOX.x1 - RENTAL_BOX.x0, 9);
    expect(wall!.halfExtents.z * 2).toBeCloseTo(RENTAL_BOX.z1 - RENTAL_BOX.z0, 9);
    expect(wall!.halfExtents.y * 2).toBeCloseTo(RENTAL_BOX.height, 9);
  });

  it('lines the booths up inside the box, end to end', () => {
    const list = booths();
    expect(list).toHaveLength(BOOTH_COUNT);
    for (const booth of list) {
      expect(booth.z - booth.length / 2).toBeGreaterThanOrEqual(RENTAL_BOX.z0 - 1e-9);
      expect(booth.z + booth.length / 2).toBeLessThanOrEqual(RENTAL_BOX.z1 + 1e-9);
    }
    expect(list[1]!.z - list[0]!.z).toBeCloseTo(list[0]!.length, 9);
  });

  it('puts the terminals outside the hall, the first behind the start wall and the second beside the hall', () => {
    const start = arrival.walls.find((box) => box.center.z === 6)!;
    expect(start).toBeDefined();
    const behind = TERMINAL_PLACES[0]!;
    expect(behind.z - TERMINAL.depth / 2).toBeGreaterThanOrEqual(6);
    const side = TERMINAL_PLACES[1]!;
    // Turned a quarter, its width runs along z and its depth along x: its inner face stays outside the hall's side wall at x -9.
    expect(side.x + TERMINAL.depth / 2).toBeLessThanOrEqual(-9);
  });

  it('stands the lamp posts outside the plaza fences, none in the stop\'s finish box', () => {
    const posts = lampPosts();
    expect(posts.length).toBeGreaterThan(4);
    for (const post of posts) {
      expect(Math.abs(post.x)).toBeGreaterThan(PLAZA_EDGE);
      expect(post.z).toBeLessThan(-100);
    }
  });

  it('draws the crossing bars inside the lane between its fences', () => {
    const bars = crossingBars();
    expect(bars.length).toBeGreaterThan(10);
    for (const z of bars) {
      expect(z).toBeLessThanOrEqual(-112);
      expect(z).toBeGreaterThanOrEqual(-178);
    }
    expect(CROSSING.x).toBeLessThanOrEqual(7);
  });
});
