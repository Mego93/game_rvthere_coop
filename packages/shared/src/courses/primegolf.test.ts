import { describe, expect, test } from 'vitest';
import { groundHeightAt } from '../groundProbe';
import { GOLF_FIELD, GOLF_RINGS } from '../story/primegolf';
import { courseIds, getCourse } from './index';
import { primegolf } from './primegolf';

describe('the primegolf course', () => {
  test('is registered, labelled and kept out of the lobby list', () => {
    expect(getCourse('primegolf')).toBe(primegolf);
    expect(primegolf.label).toBe('PrimeGolf');
    expect(courseIds()).not.toContain('primegolf');
  });

  test('has no race elements and no spots', () => {
    expect(primegolf.coins).toEqual([]);
    expect(primegolf.props).toEqual([]);
    expect(primegolf.stops).toEqual([]);
    expect(primegolf.spots).toBeUndefined();
    expect(primegolf.checkpoints).toHaveLength(1);
  });

  test('has a tee on solid ground and a 240 by 80 m field behind every ring', () => {
    const tee = primegolf.golf!.tee;
    expect(groundHeightAt(primegolf.ground, tee.x, tee.z)).toBeCloseTo(tee.y, 6);
    expect(GOLF_FIELD).toEqual({ length: 240, width: 80 });
    for (const ring of GOLF_RINGS) {
      const x = tee.x + ring.x;
      const z = tee.z + ring.z;
      expect(groundHeightAt(primegolf.ground, x, z)).not.toBeNull();
      expect(Math.abs(ring.x) + ring.radius).toBeLessThanOrEqual(GOLF_FIELD.width / 2);
      expect(-ring.z + ring.radius).toBeLessThanOrEqual(GOLF_FIELD.length);
    }
  });

  test('has a waiting area with ground behind the tee, where the crew spawns', () => {
    const spawn = primegolf.checkpoints[0]!.spawn.pos;
    expect(spawn.z).toBeGreaterThan(primegolf.golf!.tee.z + 5);
    expect(groundHeightAt(primegolf.ground, spawn.x, spawn.z)).not.toBeNull();
  });
});
