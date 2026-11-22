import type { SegmentDef } from '../segments';
import type { CourseDef } from './build';
import { hillSegments } from './terrain';

const dirt = (length: number, extra: Partial<Extract<SegmentDef, { type: 'road' }>> = {}): SegmentDef => ({ type: 'road', length, surface: 'dirt', ...extra });

// The Agafay stony desert, about 3.9 km for the buggy: dirt with two stretches of sand, five hills (crests that throw it into the air), rocks, mud and two tight turns. No fuel stops.
export const AGAFAY_SEGMENTS: SegmentDef[] = [
  { type: 'road', length: 80 },
  dirt(200, { curve: 0.5 }),
  dirt(250),
  ...hillSegments(7),
  dirt(180, { curve: -0.7 }),
  { type: 'sand', length: 160, palms: 0 },
  dirt(220, { hazards: [{ kind: 'rocks', along: 70, side: 1 }, { kind: 'rocks', along: 150, side: -1 }] }),
  dirt(100),
  dirt(60, { curve: 1.3 }),
  dirt(100),
  ...hillSegments(9),
  dirt(200, { hazards: [{ kind: 'mud', along: 90, length: 16 }] }),
  dirt(200, { curve: -0.5 }),
  dirt(160, { curve: 0.5 }),
  ...hillSegments(8),
  dirt(100),
  dirt(60, { curve: -1.3 }),
  dirt(120),
  ...hillSegments(6),
  { type: 'sand', length: 140, palms: 0 },
  ...hillSegments(10),
  dirt(250, { bumps: 3 }),
  dirt(200, { curve: 0.4 }),
  dirt(150),
];

// The scripted buggy's whole-course time (122.25 s, agafay.test.ts) times 1.3, rounded to 5 s.
export const AGAFAY_TARGET_TIME = 160;

// Built when asked for, like the stage defs.
export const agafayDef = (): CourseDef => ({ id: 'agafay', label: 'Agafay', theme: 'desert', segments: AGAFAY_SEGMENTS, targetTime: AGAFAY_TARGET_TIME, corridor: true });
