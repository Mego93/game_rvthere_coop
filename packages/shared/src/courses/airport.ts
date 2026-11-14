import type { Placement } from '../segments';
import type { CourseDef } from './build';

// Evenly spaced from 15 m along to 15 m before `length`, alternating sides.
function coinsAlong(count: number, length: number): Placement[] {
  return Array.from({ length: count }, (_, i) => ({
    along: count === 1 ? length / 2 : 15 + ((length - 30) * i) / (count - 1),
    lateral: i % 2 === 0 ? -2.5 : 2.5,
  }));
}

export const airport: CourseDef = {
  id: 'airport',
  segments: [
    {
      type: 'road',
      length: 120,
      pickups: [
        { kind: 'jerrycan', along: 30, lateral: -3 },
        { kind: 'toolbox', along: 30, lateral: 3 },
        { kind: 'healthKit', along: 40, lateral: 0 },
      ],
      coins: coinsAlong(4, 120),
    },
    { type: 'road', length: 360, curve: 0.35, debris: 4, coins: coinsAlong(6, 360) },
    { type: 'road', length: 300, curve: -0.5, debris: 3 },
    { type: 'road', length: 200, stop: { kind: 'fuel', side: 1, along: 100 } },
    { type: 'sand', length: 140, palms: 6, coins: coinsAlong(5, 140), pickups: [{ kind: 'jerrycan', along: 20, lateral: -3 }] },
    { type: 'road', length: 260, curve: 0.4, coins: coinsAlong(4, 260) },
    { type: 'ford', width: 24, rocks: 8, coins: [{ along: 18, lateral: -2.5 }, { along: 21, lateral: 2.5 }] },
    { type: 'road', length: 60, slope: 4 },
    { type: 'bank', height: 3, gradient: 15, anchors: 3 },
    { type: 'alley', length: 160, clutter: 0.7, coins: coinsAlong(4, 160) },
    { type: 'roadworks', length: 120, obstacles: 6, pickups: [{ kind: 'toolbox', along: 10, lateral: 3 }] },
    { type: 'road', length: 300, stop: { kind: 'garage', side: -1, along: 150 } },
    { type: 'road', length: 300, curve: 0.3 },
    { type: 'road', length: 220 },
  ],
  targetTime: 600,
};
