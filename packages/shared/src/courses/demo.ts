import type { CourseDef } from './build';

export const segmentDemo: CourseDef = {
  id: 'segment-demo',
  segments: [
    { type: 'road', length: 40, stop: { kind: 'fuel', side: 1, along: 20 } },
    { type: 'road', length: 60, curve: Math.PI / 4, debris: 4 },
    { type: 'alley', length: 50, clutter: 0.6 },
    { type: 'sand', length: 30, palms: 4 },
    { type: 'ford', width: 20, rocks: 6 },
    { type: 'bank', height: 3, gradient: 15, anchors: 2 },
    { type: 'roadworks', length: 40, obstacles: 6 },
    { type: 'road', length: 30, slope: 5 },
    { type: 'road', length: 30, stop: { kind: 'garage', side: -1, along: 15 } },
  ],
  targetTime: 300,
};
