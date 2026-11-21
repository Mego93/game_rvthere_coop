import { GOLF_FIELD, GOLF_RINGS, type GolfRing } from '@lodgy/shared';

// Colours of the ring targets, by ring id (hex RGB).
export const RING_COLOURS: Readonly<Record<string, number>> = {
  red: 0xe5483a,
  yellow: 0xf4d03f,
  green: 0x48b85c,
  blue: 0x3b82d6,
  purple: 0x8b5cc6,
  orange: 0xf28c28,
  white: 0xf5f5f5,
  jackpot: 0xffc400,
};

// The visible ball: the real one is 4 cm and would not be seen from the tee, so it is drawn about ten times larger.
export const BALL_VISUAL_DIAMETER = 0.45;
export const BALL_MODEL_DIAMETER = 0.0427;

// The flag at a ring's centre, in metres tall, and the points label above it.
export const FLAG_HEIGHT = 4;
export const LABEL_HEIGHT = 5.4;

// The bay screen on the back wall of the waiting area: centre x, the wall's z, and its size.
export const BAY_SCREEN = { x: -9, wallZ: 29.7, width: 6.4, height: 3.6, lift: 1.2 };

// Field coordinates: the tee is the origin and the field runs toward -z.
export function ringsInField(rings: readonly GolfRing[] = GOLF_RINGS): { ring: GolfRing; colour: number }[] {
  return rings.map((ring) => ({ ring, colour: RING_COLOURS[ring.id] ?? 0xffffff }));
}

// The fraction of the field's width the rings use, for the checks.
export const fieldBounds = () => ({ halfWidth: GOLF_FIELD.width / 2, length: GOLF_FIELD.length });
