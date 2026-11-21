import type { CharacterId } from '@lodgy/shared';
import type { FitSize } from './models';
import type { ModelKey } from './modelManifest';

// The villa's layout as the client dresses it (x east, z south); the shared course owns the collision boxes and the spots.
export const VILLA_POOL = { x0: 12, x1: 22, z0: 0, z1: 6, depth: 1 };
export const VILLA_WATER_Y = -0.15;
export const VILLA_COURT = { x0: 20, x1: 32, z0: -24, z1: -6 };
export const VILLA_GYM = { x0: 18, x1: 34, z0: 10, z1: 22 };
export const VILLA_HOUSE = { x0: -34, x1: 10, z0: -24, z1: -2 };
const FLOOR = 0.05;
const TERRACE = 0.1;

export interface Placement {
  key: ModelKey;
  x: number;
  y: number;
  z: number;
  yaw: number;
  size: FitSize;
}

export const COUCH_SEAT_X = (index: number): number => -17.5 + COUCH_SEAT_SPACING * index;

const at = (key: ModelKey, x: number, y: number, z: number, yaw: number, size: FitSize): Placement => ({ key, x, y, z, yaw, size });
const SOUTH = 0;
const EAST = -Math.PI / 2;

// Two couches of three seats, centred on the middle seat spot of each trio and facing the room.
export const COUCH_Z = -21.5;
export const COUCH_SEAT_SPACING = 2.4;
export const COUCH_WIDTH = 6.8;
const couches = [1, 4].map((middle) => at('villa.couch', COUCH_SEAT_X(middle), FLOOR, COUCH_Z, SOUTH, { x: COUCH_WIDTH, y: 0.9, z: 1.0 }));
// The bed row sits on the bed spots, the head to the north.
const beds = Array.from({ length: 6 }, (_, i) => at('villa.bed', -2.5 + 1.8 * i, FLOOR, -12, Math.PI / 2, { x: 1.5, y: 0.6, z: 2.1 }));
// The desk the laptops stand on runs along the wing's north wall.
export const DESK = { x: 3, y: FLOOR, z: -22.8, halfX: 7, halfZ: 0.8, top: 0.75 };
const laptops = Array.from({ length: 6 }, (_, i) => at('villa.laptop', -2.5 + 1.8 * i, FLOOR + DESK.top, -22.8, SOUTH, { x: 0.34, y: 0.23, z: 0.32 }));

export const PLACEMENTS: readonly Placement[] = [
  ...couches,
  at('villa.kitchenIsland', -27, FLOOR, -14.5, Math.PI / 2, { x: 4.2, y: 1.0, z: 1.5 }),
  at('villa.diningSet', -12, FLOOR, -11, 0, { x: 4.2, y: 1.0, z: 2.4 }),
  ...beds,
  ...laptops,
  // The terrace: loungers by the pool side and two parasols.
  at('villa.lounger', 2, TERRACE, 5, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.lounger', 4.5, TERRACE, 5, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.lounger', 7.5, TERRACE, 3, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.lounger', 15, 0, -1.6, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.lounger', 18, 0, -1.6, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.lounger', 21, 0, -1.6, Math.PI / 2, { x: 1.9, y: 0.8, z: 0.75 }),
  at('villa.parasol', 3.2, TERRACE, 3.4, 0, { y: 2.6 }),
  at('villa.parasol', 6.5, TERRACE, 6, 0, { y: 2.6 }),
  at('villa.parasol', 18, 0, -3.2, 0, { y: 2.6 }),
  // The pickleball court on its box, and the gym's treadmills.
  at('villa.court', (VILLA_COURT.x0 + VILLA_COURT.x1) / 2, 0.02, (VILLA_COURT.z0 + VILLA_COURT.z1) / 2, 0, { x: VILLA_COURT.x1 - VILLA_COURT.x0, y: 1.4, z: VILLA_COURT.z1 - VILLA_COURT.z0 }),
  at('villa.treadmill', 23, FLOOR, 11.5, Math.PI, { x: 0.7, y: 1.2, z: 1.8 }),
  at('villa.treadmill', 26, FLOOR, 11.5, Math.PI, { x: 0.7, y: 1.2, z: 1.8 }),
  at('villa.treadmill', 29, FLOOR, 11.5, Math.PI, { x: 0.7, y: 1.2, z: 1.8 }),
  // Outside the gate: the ATM and the kiosk face the gate.
  at('villa.atm', -8, 0, 35.5, Math.PI, { y: 2 }),
  at('villa.kiosk', 8, 0, 37, Math.PI, { x: 3.4, y: 2.5, z: 2.4 }),
];

// Where each friend sits on the couch while nobody plays him: the seat with his index in the cast.
export const seatFor = (id: CharacterId, cast: readonly CharacterId[]): { x: number; y: number; z: number } => ({ x: COUCH_SEAT_X(Math.max(0, cast.indexOf(id))), y: FLOOR, z: COUCH_Z + 0.2 });

// Olive trees (the broadleaf in grey-green) and palms, all on the lawn outside the paths and the buildings.
export const OLIVES: readonly { x: number; z: number; size: number }[] = [
  { x: -36, z: -12, size: 5 }, { x: -36, z: 4, size: 5.5 }, { x: -36, z: 22, size: 5 }, { x: -24, z: 16, size: 4.5 }, { x: -12, z: 22, size: 5 },
  { x: -30, z: 26, size: 5.5 }, { x: 36, z: -12, size: 5 }, { x: 30, z: 3, size: 4.5 }, { x: 14, z: 14, size: 5 }, { x: 14, z: -27, size: 5 }, { x: -20, z: -27, size: 5 },
];
export const PALMS: readonly { key: ModelKey; x: number; z: number }[] = [
  { key: 'decor.palm.b', x: -38, z: -28 }, { key: 'decor.palm.a', x: 38, z: -28 }, { key: 'decor.palm.e', x: 38, z: 26 }, { key: 'decor.palm.c', x: -38, z: 28 },
  { key: 'decor.palm.b', x: 11, z: -3 }, { key: 'decor.palm.e', x: 23, z: 8 }, { key: 'decor.palm.a', x: 24, z: -3 }, { key: 'decor.palm.d', x: 11, z: 8 },
];

export const OLIVE_TINT = 0x8f9c7a;
