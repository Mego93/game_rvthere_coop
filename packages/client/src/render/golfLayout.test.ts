import { GOLF_RINGS } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { BAY_SCREEN, BALL_VISUAL_DIAMETER, FLAG_HEIGHT, LABEL_HEIGHT, RING_COLOURS, fieldBounds, ringsInField } from './golfLayout';

describe('golf layout', () => {
  it('gives every ring its own colour', () => {
    const colours = ringsInField().map((entry) => entry.colour);
    expect(colours).toHaveLength(GOLF_RINGS.length);
    expect(new Set(colours).size).toBe(colours.length);
    for (const ring of GOLF_RINGS) expect(RING_COLOURS[ring.id], ring.id).toBeDefined();
  });

  it('keeps every ring inside the field, with its flag and label above the ground', () => {
    const { halfWidth, length } = fieldBounds();
    for (const { ring } of ringsInField()) {
      expect(Math.abs(ring.x) + ring.radius, ring.id).toBeLessThanOrEqual(halfWidth);
      expect(-ring.z + ring.radius, ring.id).toBeLessThanOrEqual(length);
      expect(ring.z, ring.id).toBeLessThan(0);
    }
    expect(LABEL_HEIGHT).toBeGreaterThan(FLAG_HEIGHT);
  });

  it('draws the ball larger than life but still a ball', () => {
    expect(BALL_VISUAL_DIAMETER).toBeGreaterThan(0.0427);
    expect(BALL_VISUAL_DIAMETER).toBeLessThan(1);
  });

  it('puts the bay screen on the back wall inside the bay, clear of the Lodgy parked in the middle', () => {
    expect(Math.abs(BAY_SCREEN.x) + BAY_SCREEN.width / 2).toBeLessThanOrEqual(20);
    expect(BAY_SCREEN.x + BAY_SCREEN.width / 2).toBeLessThan(-1.5);
    expect(BAY_SCREEN.wallZ).toBeLessThan(30);
    expect(BAY_SCREEN.wallZ).toBeGreaterThan(24);
  });
});
