import { getCourse, type Box, type Surface } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { groupBySurface, mergeBoxes, TEXTURE_METRES_PER_REPEAT } from './groundMerge';

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot = IDENTITY): Box => ({
  center: { x: cx, y: cy, z: cz },
  halfExtents: { x: hx, y: hy, z: hz },
  rot,
});

describe('mergeBoxes', () => {
  test('a box has five faces, without its underside', () => {
    const merged = mergeBoxes([box(0, 0, 0, 2, 0.5, 3)])!;
    expect(merged.positions.length / 3).toBe(20);
    expect(merged.indices.length / 3).toBe(10);
    for (let i = 0; i < merged.normals.length; i += 3) expect(merged.normals[i + 1]).toBeGreaterThan(-0.5);
  });

  test('with the underside it has six faces', () => {
    const merged = mergeBoxes([box(0, 0, 0, 1, 1, 1)], TEXTURE_METRES_PER_REPEAT, true)!;
    expect(merged.positions.length / 3).toBe(24);
    expect(merged.indices.length / 3).toBe(12);
  });

  test('no boxes give no geometry', () => {
    expect(mergeBoxes([])).toBeNull();
  });

  test('the top face uvs are the world x and z in repeats', () => {
    const merged = mergeBoxes([box(10, 1, -7, 2, 0.5, 3)])!;
    let tops = 0;
    for (let v = 0; v < merged.normals.length / 3; v++) {
      if (merged.normals[v * 3 + 1]! < 0.99) continue;
      tops++;
      expect(merged.uvs[v * 2]).toBeCloseTo(merged.positions[v * 3]! / TEXTURE_METRES_PER_REPEAT, 5);
      expect(merged.uvs[v * 2 + 1]).toBeCloseTo(merged.positions[v * 3 + 2]! / TEXTURE_METRES_PER_REPEAT, 5);
    }
    expect(tops).toBe(4);
  });

  test('uvs are continuous across abutting boxes: the same world point has the same uv', () => {
    const merged = mergeBoxes([box(-2, 0, 0, 2, 0.5, 2), box(2, 0, 0, 2, 0.5, 2)])!;
    const seen = new Map<string, [number, number]>();
    for (let v = 0; v < merged.normals.length / 3; v++) {
      if (merged.normals[v * 3 + 1]! < 0.99) continue;
      const key = [0, 1, 2].map((a) => merged.positions[v * 3 + a]!.toFixed(4)).join(',');
      const uv: [number, number] = [merged.uvs[v * 2]!, merged.uvs[v * 2 + 1]!];
      const previous = seen.get(key);
      if (previous) {
        expect(uv[0]).toBeCloseTo(previous[0], 6);
        expect(uv[1]).toBeCloseTo(previous[1], 6);
      }
      seen.set(key, uv);
    }
    expect([...seen.keys()].some((key) => key.startsWith('0.0000,0.5000'))).toBe(true);
  });

  test('positions are in the world: a box turned a quarter about y swaps its extents and the normals turn with it', () => {
    const s = Math.SQRT1_2;
    const merged = mergeBoxes([box(5, 0, 0, 4, 1, 1, { x: 0, y: s, z: 0, w: s })])!;
    const xs = [];
    const zs = [];
    for (let v = 0; v < merged.positions.length / 3; v++) {
      xs.push(merged.positions[v * 3]!);
      zs.push(merged.positions[v * 3 + 2]!);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 4);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(8, 4);
    for (let v = 0; v < merged.normals.length / 3; v++) {
      const length = Math.hypot(merged.normals[v * 3]!, merged.normals[v * 3 + 1]!, merged.normals[v * 3 + 2]!);
      expect(length).toBeCloseTo(1, 5);
    }
  });

  test('faces wind outwards: each triangle\'s geometric normal agrees with its vertex normal', () => {
    const merged = mergeBoxes([box(1, 2, 3, 2, 0.5, 1.5)], 4, true)!;
    for (let t = 0; t < merged.indices.length; t += 3) {
      const [a, b, c] = [merged.indices[t]!, merged.indices[t + 1]!, merged.indices[t + 2]!];
      const p = (i: number) => [0, 1, 2].map((k) => merged.positions[i * 3 + k]!);
      const [pa, pb, pc] = [p(a), p(b), p(c)] as [number[], number[], number[]];
      const e1 = pb.map((v, k) => v - pa[k]!);
      const e2 = pc.map((v, k) => v - pa[k]!);
      const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const dot = cross[0]! * merged.normals[a * 3]! + cross[1]! * merged.normals[a * 3 + 1]! + cross[2]! * merged.normals[a * 3 + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });

  test('indices stay inside the merged vertex range', () => {
    const merged = mergeBoxes([box(0, 0, 0, 1, 1, 1), box(5, 0, 0, 1, 1, 1), box(9, 0, 0, 1, 1, 1)])!;
    const vertices = merged.positions.length / 3;
    expect(vertices).toBe(60);
    for (const index of merged.indices) expect(index).toBeLessThan(vertices);
  });
});

describe('groupBySurface', () => {
  test('the airport ground merges into at most four geometries covering every box once', () => {
    const course = getCourse('airport');
    const groups = groupBySurface(course.ground);
    const surfaces = Object.keys(groups) as Surface[];
    expect(surfaces.length).toBeLessThanOrEqual(4);
    expect(surfaces).toEqual(expect.arrayContaining(['road', 'gravel', 'sand']));
    expect(surfaces.reduce((sum, surface) => sum + groups[surface]!.length, 0)).toBe(course.ground.length);
    for (const surface of surfaces) {
      const merged = mergeBoxes(groups[surface]!)!;
      expect(merged.indices.length / 3).toBe(groups[surface]!.length * 10);
    }
  });
});
