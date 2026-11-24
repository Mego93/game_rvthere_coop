import { ARRIVAL_BUILDINGS, ARRIVAL_ROUTES, type Box, type BuiltCourse } from '@lodgy/shared';
import type { Avoid } from './dressMap';

// The arrival's dressing, in the course's frame (x east, z south, the route runs toward -z). The shared course owns every collision box; the scene draws real models over them, and these are the numbers that tie the two together.

export type BuildingKey = (typeof ARRIVAL_BUILDINGS)[number]['key'];

export function buildingOf(key: BuildingKey) {
  return ARRIVAL_BUILDINGS.find((b) => b.key === key)!;
}

// The car park deck's top, and the height of the garage model's second-floor slab in its own metres: the model is scaled in height until that slab is the deck.
export const DECK_TOP = 3.5;
export const GARAGE_FLOOR = 4.4;
// The model's slab sits this far over the deck, so it is what is seen (its concrete and parking lines) and the deck box under it never shares its plane.
export const GARAGE_LIFT = 0.03;
// Only the slab is drawn: the garage's other floors, its roof and its pillars would stand in the camera's way and in the players'.
export const GARAGE_BAND = { from: DECK_TOP - 0.1, to: DECK_TOP + 0.2 };
export const GARAGE_PARTS = ['Cube_0'];

export function garageFit(): { scaleY: number; offsetY: number } {
  return { scaleY: DECK_TOP / GARAGE_FLOOR, offsetY: GARAGE_LIFT };
}

// The deck's sides drawn as a podium of light concrete, a hair outside the deck box.
export const PODIUM_COLOUR = 0xb9b6ad;
export const PARAPET_COLOUR = 0xc9c6bd;

// The terminal is drawn in slices, one over each stretch of its front wall between two exits, so the exits stay open. A slice is a range of x, a little wider than the wall at the ends of the terminal.
const TERMINAL_OVERHANG = 0.3;

export function terminalFront(course: BuiltCourse): Box[] {
  const terminal = buildingOf('terminal');
  const frontZ = terminal.center.z - terminal.size.z / 2;
  return course.walls
    .filter((w) => Math.abs(w.center.z - frontZ) < 0.2 && w.halfExtents.y * 2 >= terminal.size.y - 0.01 && w.halfExtents.z < 0.5)
    .sort((a, b) => a.center.x - b.center.x);
}

export function terminalDoors(course: BuiltCourse): [number, number][] {
  const front = terminalFront(course);
  const doors: [number, number][] = [];
  for (let i = 1; i < front.length; i++) doors.push([front[i - 1]!.center.x + front[i - 1]!.halfExtents.x, front[i]!.center.x - front[i]!.halfExtents.x]);
  return doors;
}

export function terminalSlices(course: BuiltCourse): [number, number][] {
  const front = terminalFront(course);
  return front.map((w, i) => [w.center.x - w.halfExtents.x - (i === 0 ? TERMINAL_OVERHANG : 0), w.center.x + w.halfExtents.x + (i === front.length - 1 ? TERMINAL_OVERHANG : 0)]);
}

// The terminal model is a two-storey house with a canopy and flag poles on one side. Its body (the stucco walls) is the core below, in the model's own metres; the arrival draws the core five times along the terminal, each stretched over its stretch of the box, and cuts the canopy and poles away.
export const TERMINAL_CORE = { x0: -11.85, x1: 3.7, z0: -6.42, z1: 6.8, height: 7.31 };
export const TERMINAL_TILES = 5;

// The box the tiles cover: the collider's, a little larger so the model hides the plain walls under it and does not share their planes.
export function terminalFit(): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } {
  const t = buildingOf('terminal');
  return { center: t.center, size: { x: t.size.x + 2 * TERMINAL_OVERHANG, y: t.size.y, z: t.size.z + 2 * TERMINAL_OVERHANG } };
}

export interface TerminalPiece {
  // The x range of the tile the piece is cut from, and the range of it that is drawn (the tile less the exits).
  tile: [number, number];
  from: number;
  to: number;
  scale: { x: number; y: number; z: number };
  // Where the model's origin goes, so the core lands on the tile.
  position: { x: number; y: number; z: number };
}

export function terminalPieces(course: BuiltCourse): TerminalPiece[] {
  const fit = terminalFit();
  const tileWidth = fit.size.x / TERMINAL_TILES;
  const coreWidth = TERMINAL_CORE.x1 - TERMINAL_CORE.x0;
  const scale = { x: tileWidth / coreWidth, y: fit.size.y / TERMINAL_CORE.height, z: fit.size.z / (TERMINAL_CORE.z1 - TERMINAL_CORE.z0) };
  const pieces: TerminalPiece[] = [];
  for (let i = 0; i < TERMINAL_TILES; i++) {
    const from = fit.center.x - fit.size.x / 2 + i * tileWidth;
    const to = from + tileWidth;
    const position = {
      x: (from + to) / 2 - ((TERMINAL_CORE.x0 + TERMINAL_CORE.x1) / 2) * scale.x,
      y: 0,
      z: fit.center.z - ((TERMINAL_CORE.z0 + TERMINAL_CORE.z1) / 2) * scale.z,
    };
    for (const [a, b] of terminalSlices(course)) {
      const lo = Math.max(a, from);
      const hi = Math.min(b, to);
      if (hi - lo > 0.01) pieces.push({ tile: [from, to], from: lo, to: hi, scale, position });
    }
  }
  return pieces;
}

export type CoverKind = 'planter' | 'desk' | 'taxi' | 'sedan' | 'hatch' | 'minibus';

export interface CoverPiece {
  kind: CoverKind;
  box: Box;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.05;

// Which model a cover box is drawn as, by its size: planters 3 x 1 x 1.2, check-in desks 8 x 1.1 x 1.2, cars 4.4 x 1.5 x 1.9 (a taxi on the ground, a sedan or hatch on the deck) and the minibus 7 x 2.2 x 2.4.
export function coverPieces(course: BuiltCourse): CoverPiece[] {
  const pieces: CoverPiece[] = [];
  let parked = 0;
  for (const box of course.walls) {
    const h = box.halfExtents;
    if (near(h.x, 1.5) && near(h.y, 0.5) && near(h.z, 0.6)) pieces.push({ kind: 'planter', box });
    else if (near(h.x, 4) && near(h.y, 0.55) && near(h.z, 0.6)) pieces.push({ kind: 'desk', box });
    else if (near(h.x, 2.2) && near(h.y, 0.75) && near(h.z, 0.95)) pieces.push({ kind: box.center.y - h.y < 0.5 ? 'taxi' : parked++ % 2 === 0 ? 'sedan' : 'hatch', box });
    else if (near(h.x, 3.5) && near(h.y, 1.1) && near(h.z, 1.2)) pieces.push({ kind: 'minibus', box });
  }
  return pieces;
}

export interface Container {
  x: number;
  y: number;
  z: number;
  size: { x: number; y: number; z: number };
}

// The rental office as a stack of shipping containers over its box: three along its width, three deep and two high, the middle column left out (nobody sees it).
export function officeContainers(): Container[] {
  const office = buildingOf('rentalOffice');
  const cols = 3;
  const rows = 3;
  const levels = 2;
  const size = { x: office.size.x / cols, y: office.size.y / levels, z: office.size.z / rows };
  const out: Container[] = [];
  for (let level = 0; level < levels; level++) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (i === 1 && j === 1) continue;
        out.push({ x: office.center.x - office.size.x / 2 + (i + 0.5) * size.x, y: level * size.y, z: office.center.z - office.size.z / 2 + (j + 0.5) * size.z, size });
      }
    }
  }
  return out;
}

// The sign over the office, facing the stop: on the face toward +z.
export const RENTAL_SIGN = { text: 'Car Rental', width: 7, height: 1.3, y: 4.1 };

// Two buildings far off beyond the district's boundary walls, for a skyline: the concourse beyond the west wall and the shop beyond the east. Nothing can be walked there; the land they stand on is the course's red earth, a little under the district's floor.
export const BACKDROPS: readonly { key: 'airport.concourse' | 'airport.shop'; x: number; z: number; size: { x: number; y: number; z: number } }[] = [
  { key: 'airport.concourse', x: -150, z: -50, size: { x: 70, y: 7, z: 75 } },
  { key: 'airport.shop', x: 140, z: -60, size: { x: 36, y: 8.6, z: 35 } },
];
export const BACKDROP_SINK = 0.4;

export const FOUNTAIN = { x: 20, z: -45, size: 5 };
export const FLAGS: readonly { x: number; z: number }[] = [
  { x: -6.5, z: -28 },
  { x: 6.5, z: -28 },
  { x: 79.5, z: -113 },
  { x: 79.5, z: -108 },
];
const PALM_ROWS = [-28.5, -60];
const PALM_STEP = 8;
const PALM_CLEAR = 3.2;

const lineDistance = (x: number, z: number): number => {
  let best = Infinity;
  for (const route of ARRIVAL_ROUTES) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!;
      const b = route.points[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
  }
  return best;
};

const wallDistance = (course: BuiltCourse, x: number, z: number): number => {
  let best = Infinity;
  for (const w of course.walls) {
    const yaw = 2 * Math.atan2(w.rot.y, w.rot.w);
    const dx = x - w.center.x;
    const dz = z - w.center.z;
    const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    best = Math.min(best, Math.hypot(Math.max(Math.abs(lx) - w.halfExtents.x, 0), Math.max(Math.abs(lz) - w.halfExtents.z, 0)));
  }
  return best;
};

// Palms in two rows across the forecourt, left out wherever one would stand on a walk line, close to a wall or a cover box, or on the fountain.
export function palmAvenue(course: BuiltCourse): { x: number; z: number }[] {
  const palms: { x: number; z: number }[] = [];
  for (const z of PALM_ROWS) {
    for (let x = -56; x <= 56; x += PALM_STEP) {
      if (lineDistance(x, z) < PALM_CLEAR || wallDistance(course, x, z) < PALM_CLEAR) continue;
      if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.size / 2 + PALM_CLEAR) continue;
      if (FLAGS.some((f) => Math.hypot(x - f.x, z - f.z) < PALM_CLEAR)) continue;
      palms.push({ x, z });
    }
  }
  return palms;
}

// The circles the dressing keeps clear of: the hand-placed landmarks.
export function landmarkAvoids(course: BuiltCourse): Avoid[] {
  return [
    { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.size / 2 },
    ...FLAGS.map((f) => ({ x: f.x, z: f.z, r: 1.7 })),
    ...palmAvenue(course).map((p) => ({ x: p.x, z: p.z, r: 1.6 })),
  ];
}
