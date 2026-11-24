import { PROP_KINDS, type Surface } from '../constants';
import type { Box, BuiltCourse, GroundBox, GroundPatch, Placed } from '../course';
import { planEnemies, type EnemyEvent } from '../enemies';
import { groundHeightAt } from '../groundProbe';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3, type Vec3 } from '../math';
import { createRouteIndex } from '../routeAlong';
import { makePatch, terrainHeightAt, withTerrain } from '../terrain';

// Enemy events every ENEMY_SPACING / 6 m along each route, so about 42 m; the cap of 8 alive still holds.
export const ARRIVAL_ENEMY_DENSITY = 6;

// x east, z south, an airport district from x -110 to 110 and z 30 to -130. The terminal (x -40 to 40, z 10 to -24) holds the arrivals hall; its front wall has three exits at x -30, 0 and 30 onto the forecourt (z -24 to -62), with mounds of uneven ground either side and a stepped terrace in the middle. East of the forecourt the car park deck (x 56 to 98, z -30 to -72) stands 3.5 m up, reached by a ramp and stairs on its west side; the taxi lane runs east along z -80 under its south face; the service road goes round the back of the terminal (z 20) and down the east edge; all three end at the rental stop in the south-east corner, where the Lodgy waits.
const WEST = -110;
const EAST = 110;
const NORTH = 30;
const SOUTH = -130;
const WALL_HEIGHT = 3.5;
const FENCE = 1.2;
const WALL_HALF_THICKNESS = 0.15;
const KILL_PLANE = -20;

const TERMINAL = { x0: -40, x1: 40, z0: 10, z1: -24, height: 8 };
const EXITS: readonly (readonly [number, number])[] = [[-34, -26], [-4, 4], [26, 34]];

const DECK_TOP = 3.5;
const DECK = { x0: 56, x1: 98, z0: -30, z1: -72 };
const PARAPET = 1;
const RISE = 0.25;
const RAMP = { x0: 40, x1: 56, z0: -54, z1: -46 };
const STAIRS_WEST = { z0: -68, z1: -62, tread: 0.55 };
const STAIRS_SOUTH = { x0: 90, x1: 96, tread: 0.55 };
const TERRACE = { x0: -10, x1: 10, z0: -48, z1: -38, top: 1 };
const STAIRS_TERRACE = { x0: -3, x1: 3, tread: 0.6 };

const LANE = { z: -80, half: 4.5, from: -6, to: 46 };
const STOP = { x: 68, z: -110 };
const OFFICE = { x: 86, z: -122, halfX: 8, halfZ: 4, height: 5 };

const box = (x0: number, x1: number, z0: number, z1: number, top: number, bottom: number): Pick<Box, 'center' | 'halfExtents' | 'rot'> => ({
  center: vec3((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2),
  halfExtents: vec3(Math.abs(x1 - x0) / 2, (top - bottom) / 2, Math.abs(z1 - z0) / 2),
  rot: IDENTITY,
});
const ground = (x0: number, x1: number, z0: number, z1: number, top = 0, surface: Surface = 'road'): GroundBox => ({ ...box(x0, x1, z0, z1, top, -1), surface });

// A wall box from corner to corner on the x-z plane, from `base` up `height`.
const wall = (x0: number, z0: number, x1: number, z1: number, height = WALL_HEIGHT, base = 0): Box => ({
  center: vec3((x0 + x1) / 2, base + height / 2, (z0 + z1) / 2),
  halfExtents: vec3(Math.max(Math.abs(x1 - x0) / 2, WALL_HALF_THICKNESS), height / 2, Math.max(Math.abs(z1 - z0) / 2, WALL_HALF_THICKNESS)),
  rot: IDENTITY,
});

// A wall along z = `at` (axis 'x') or x = `at` (axis 'z') from `from` to `to`, leaving the gaps open.
function wallWithGaps(axis: 'x' | 'z', at: number, from: number, to: number, gaps: readonly (readonly [number, number])[], height = WALL_HEIGHT, base = 0): Box[] {
  const edges = [from, ...gaps.flatMap(([a, b]) => [a, b]), to];
  const boxes: Box[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    if (Math.abs(b - a) < 1e-9) continue;
    boxes.push(axis === 'x' ? wall(a, at, b, at, height, base) : wall(at, a, at, b, height, base));
  }
  return boxes;
}

// A flight of boxes that falls from the edge of a platform `top` m up to the ground: step k (k rises below the platform) is `tread` deep and its top is k rises lower. `dir` is the way down, a unit step along one axis.
function stairs(edge: number, dir: 1 | -1, axis: 'x' | 'z', lateral: readonly [number, number], top: number, tread: number): GroundBox[] {
  const steps: GroundBox[] = [];
  for (let k = 1; top - k * RISE > 1e-9; k++) {
    const a = edge + dir * (k - 1) * tread;
    const b = edge + dir * k * tread;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const level = top - k * RISE;
    steps.push(axis === 'x' ? ground(lo, hi, lateral[0], lateral[1], level) : ground(lateral[0], lateral[1], lo, hi, level));
  }
  return steps;
}

// The flat land: the district minus the rectangles of the patches, as boxes with top at y 0.
function flatLand(holes: readonly { x0: number; x1: number; z0: number; z1: number }[]): GroundBox[] {
  const xs = [...new Set([WEST, EAST, ...holes.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([SOUTH, NORTH, ...holes.flatMap((h) => [h.z0, h.z1])])].sort((a, b) => a - b);
  const inHole = (x: number, z: number) => holes.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  const boxes: GroundBox[] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let runStart: number | null = null;
    for (let i = 0; i < xs.length; i++) {
      const open = i + 1 < xs.length && !inHole((xs[i]! + xs[i + 1]!) / 2, (zs[j]! + zs[j + 1]!) / 2);
      if (open && runStart === null) runStart = xs[i]!;
      if (!open && runStart !== null) {
        boxes.push(ground(runStart, xs[i]!, zs[j]!, zs[j + 1]!));
        runStart = null;
      }
    }
  }
  return boxes;
}

// Smooth mounds: each (x, z, height, radius) is a cosine bump that is zero beyond its radius, so a patch meets the flat land at height 0.
const mounds = (list: readonly (readonly [number, number, number, number])[]) => (x: number, z: number): number =>
  list.reduce((sum, [mx, mz, h, r]) => {
    const d = Math.hypot(x - mx, z - mz);
    return d >= r ? sum : sum + (h * (1 + Math.cos((Math.PI * d) / r))) / 2;
  }, 0);

const PATCH_WEST = { x0: -62, z0: -62, cols: 44, rows: 38 };
const PATCH_EAST = { x0: 16, z0: -62, cols: 24, rows: 38 };
const patches: GroundPatch[] = [
  makePatch('forecourt-west', PATCH_WEST.x0, PATCH_WEST.z0, 1, PATCH_WEST.cols, PATCH_WEST.rows, mounds([[-50, -38, 1.4, 8], [-30, -52, 1.1, 7], [-52, -56, 1, 5]]), 'gravel'),
  makePatch('forecourt-east', PATCH_EAST.x0, PATCH_EAST.z0, 1, PATCH_EAST.cols, PATCH_EAST.rows, mounds([[28, -36, 1.2, 7], [27, -55, 1.3, 6]]), 'gravel'),
];
const holes = patches.map((p) => ({ x0: p.x0, x1: p.x0 + p.cols * p.cell, z0: p.z0, z1: p.z0 + p.rows * p.cell }));

// The ramp onto the deck: a thick box tilted about z, its top running from y 0 at RAMP.x0 to the deck top at RAMP.x1.
const rampAngle = Math.atan2(DECK_TOP, RAMP.x1 - RAMP.x0);
const ramp: GroundBox = {
  center: vec3((RAMP.x0 + RAMP.x1) / 2 + Math.sin(rampAngle) * 0.5, DECK_TOP / 2 - Math.cos(rampAngle) * 0.5, (RAMP.z0 + RAMP.z1) / 2),
  halfExtents: vec3(Math.hypot(RAMP.x1 - RAMP.x0, DECK_TOP) / 2, 0.5, (RAMP.z1 - RAMP.z0) / 2),
  rot: quatFromAxisAngle(vec3(0, 0, 1), rampAngle),
  surface: 'road',
};

const groundBoxes: GroundBox[] = [
  ...flatLand(holes),
  ground(DECK.x0, DECK.x1, DECK.z1, DECK.z0, DECK_TOP),
  ramp,
  ...stairs(DECK.x0, -1, 'x', [STAIRS_WEST.z0, STAIRS_WEST.z1], DECK_TOP, STAIRS_WEST.tread),
  ...stairs(DECK.z1, -1, 'z', [STAIRS_SOUTH.x0, STAIRS_SOUTH.x1], DECK_TOP, STAIRS_SOUTH.tread),
  ground(TERRACE.x0, TERRACE.x1, TERRACE.z0, TERRACE.z1, TERRACE.top),
  ...stairs(TERRACE.z1, 1, 'z', [STAIRS_TERRACE.x0, STAIRS_TERRACE.x1], TERRACE.top, STAIRS_TERRACE.tread),
  ...stairs(TERRACE.z0, -1, 'z', [STAIRS_TERRACE.x0, STAIRS_TERRACE.x1], TERRACE.top, STAIRS_TERRACE.tread),
];

const COVER_HEIGHT = 1;
// A solid box on the ground (or the deck) standing in for a planter or a parked car.
const solid = (x: number, z: number, halfX: number, halfZ: number, height: number, base = 0): Box => ({ center: vec3(x, base + height / 2, z), halfExtents: vec3(halfX, height / 2, halfZ), rot: IDENTITY });
const car = (x: number, z: number, base = 0): Box => solid(x, z, 2.2, 0.95, 1.5, base);

const walls: Box[] = [
  // The district's boundary.
  wall(WEST, SOUTH, WEST, NORTH),
  wall(EAST, SOUTH, EAST, NORTH),
  wall(WEST, NORTH, EAST, NORTH),
  wall(WEST, SOUTH, EAST, SOUTH),
  // The terminal: back and side walls, and the front wall with its three exits.
  wall(TERMINAL.x0, TERMINAL.z0, TERMINAL.x1, TERMINAL.z0, TERMINAL.height),
  wall(TERMINAL.x0, TERMINAL.z0, TERMINAL.x0, TERMINAL.z1, TERMINAL.height),
  wall(TERMINAL.x1, TERMINAL.z0, TERMINAL.x1, TERMINAL.z1, TERMINAL.height),
  ...wallWithGaps('x', TERMINAL.z1, TERMINAL.x0, TERMINAL.x1, EXITS, TERMINAL.height),
  // Check-in desks in the hall.
  solid(-16, -12, 4, 0.6, 1.1),
  solid(16, -12, 4, 0.6, 1.1),
  // Planters on the forecourt, between the mounds.
  ...[[-14, -56], [-9, -56], [9, -56], [14, -56], [-12, -31], [12, -31]].map(([x, z]) => solid(x!, z!, 1.5, 0.6, COVER_HEIGHT)),
  // A taxi rank and a minibus on the south edge of the forecourt.
  ...[-40, -33, -26].map((x) => car(x, -66)),
  solid(-48, -71, 3.5, 1.2, 2.2),
  // The taxi lane: a fenced pen with its gates, open at both ends.
  wall(LANE.from, LANE.z + LANE.half, LANE.to, LANE.z + LANE.half, FENCE),
  wall(LANE.from, LANE.z - LANE.half, LANE.to, LANE.z - LANE.half, FENCE),
  // The car park deck's parapet, open at the ramp and the two flights of stairs.
  ...wallWithGaps('z', DECK.x0, DECK.z0, DECK.z1, [[RAMP.z1, RAMP.z0], [STAIRS_WEST.z1, STAIRS_WEST.z0]], PARAPET, DECK_TOP),
  wall(DECK.x0, DECK.z0, DECK.x1, DECK.z0, PARAPET, DECK_TOP),
  wall(DECK.x1, DECK.z0, DECK.x1, DECK.z1, PARAPET, DECK_TOP),
  ...wallWithGaps('x', DECK.z1, DECK.x0, DECK.x1, [[STAIRS_SOUTH.x0, STAIRS_SOUTH.x1]], PARAPET, DECK_TOP),
  // Parked cars on the deck: two rows along the north and south sides, and two in the middle.
  ...[64, 72, 80].flatMap((x) => [car(x, -36, DECK_TOP), car(x, -64, DECK_TOP)]),
  car(72, -47, DECK_TOP),
  car(82, -55, DECK_TOP),
  // The rental office beside the stop.
  solid(OFFICE.x, OFFICE.z, OFFICE.halfX, OFFICE.halfZ, OFFICE.height),
];

const props: Placed[] = [];
const counts = new Map<string, number>();
const place = (kind: 'crate' | 'barrier', x: number, z: number, height = 0): void => {
  const n = (counts.get(kind) ?? 0) + 1;
  counts.set(kind, n);
  props.push({ id: `${kind}-${n}`, kind, pose: { pos: vec3(x, height, z), rot: IDENTITY } });
};

// The crossing's gates down the taxi lane, 12 m apart, alternating sides.
const GATES = [4, 16, 28, 40];
GATES.forEach((x, i) => place('barrier', x, LANE.z + (i % 2 === 0 ? 2.5 : -2.5)));
// The service road's roadblock, a gap of 5 m between two barriers, and crates stacked at the loading dock behind the terminal.
for (const z of [17.5, 22.5]) place('barrier', 60, z);
const CRATE_HEIGHT = 2 * PROP_KINDS.crate.halfExtents.y;
for (const [x, z, height] of [[-24, 26, 0], [-23.4, 26, 0], [-23.7, 26, CRATE_HEIGHT], [30, 26.5, 0], [30.6, 26.5, 0]] as const) place('crate', x, z, height);

// The Lodgy waits at the rental stop; the finish box is round it.
const lodgySpawn = { pos: vec3(STOP.x, 0, STOP.z), rot: quatFromAxisAngle(AXIS_Y, 0) };
const finish: Box = { center: vec3(STOP.x, 3, STOP.z), halfExtents: vec3(7, 3, 9), rot: IDENTITY };

const draft: BuiltCourse = {
  id: 'arrival',
  label: 'Arrival',
  ground: groundBoxes,
  walls,
  props,
  // One ammo box on the forecourt, one on the car park deck.
  pickups: [
    { id: 'ammo-1', kind: 'ammo', pose: { pos: vec3(5, 0, -58), rot: IDENTITY } },
    { id: 'ammo-2', kind: 'ammo', pose: { pos: vec3(76, DECK_TOP, -50), rot: IDENTITY } },
  ],
  anchors: [],
  stops: [],
  coins: [],
  decor: [],
  ravines: [],
  checkpoints: [
    {
      id: 'cp-0',
      trigger: { center: vec3(STOP.x, 2, STOP.z), halfExtents: vec3(6, 2, 6), rot: IDENTITY },
      spawn: lodgySpawn,
    },
  ],
  route: [],
  finish,
  finishBy: 'players',
  playerStart: { pos: vec3(0, 0, 2), yaw: 0 },
  killPlaneY: KILL_PLANE,
  targetTime: 300,
  enemyDensity: ARRIVAL_ENEMY_DENSITY,
};
const terrained = withTerrain(draft, patches);

// The top of the ground at (x, z): the highest ground box or patch.
const heightAt = (x: number, z: number): number => {
  const box = groundHeightAt(terrained.ground, x, z);
  const patch = terrainHeightAt(terrained, x, z);
  return Math.max(box ?? -Infinity, patch ?? -Infinity);
};
const line = (points: readonly (readonly [number, number])[]): Vec3[] => points.map(([x, z]) => vec3(x, Math.round(heightAt(x, z) * 100) / 100, z));

// The walk lines of the three routes, from the arrivals hall to the finish; each is clear of every box and goes through the stairs and ramp it names.
export const ARRIVAL_ROUTES: { id: 'taxi' | 'carpark' | 'service'; points: Vec3[] }[] = deepFreeze([
  {
    // Out of the centre exit, up and over the terrace by its two flights, then round the west end of the taxi lane's pen and down it past the gates.
    id: 'taxi' as const,
    points: line([[0, 2], [0, -30], [0, -36], [0, -50], [0, -60], [-10, -68], [-10, -80], [-2, -80], [4, -81.5], [16, -78.5], [28, -81.5], [40, -78.5], [52, -80], [62, -86], [68, -100], [STOP.x, STOP.z + 2]]),
  },
  {
    // Out of the right exit, over the east mounds, up the ramp onto the deck, along its aisle and down the south stairs.
    id: 'carpark' as const,
    points: line([[0, 2], [30, -12], [30, -30], [34, -44], [40, -50], [48, -50], [56, -50], [66, -50], [76, -50], [92, -50], [93, -66], [93, -72], [93, -77], [90, -86], [80, -94], [68, -104], [STOP.x, STOP.z + 2]]),
  },
  {
    // Out of the left exit, round the west of the terminal, along the service road behind it and down the east edge.
    id: 'service' as const,
    points: line([[0, 2], [-30, -12], [-30, -30], [-52, -34], [-52, -10], [-52, 20], [100, 20], [101, -60], [101, -96], [84, -102], [68, -108], [STOP.x, STOP.z + 2]]),
  },
]);

// The buildings the client draws over invisible boxes: `center` is the middle of the box, `size` its full width (x), height (y) and depth (z), `yaw` its turn.
export const ARRIVAL_BUILDINGS: { key: 'terminal' | 'carPark' | 'rentalOffice'; center: Vec3; size: Vec3; yaw: number }[] = deepFreeze([
  { key: 'terminal' as const, center: vec3(0, TERMINAL.height / 2, (TERMINAL.z0 + TERMINAL.z1) / 2), size: vec3(TERMINAL.x1 - TERMINAL.x0, TERMINAL.height, TERMINAL.z0 - TERMINAL.z1), yaw: 0 },
  { key: 'carPark' as const, center: vec3((DECK.x0 + DECK.x1) / 2, DECK_TOP / 2, (DECK.z0 + DECK.z1) / 2), size: vec3(DECK.x1 - DECK.x0, DECK_TOP, DECK.z0 - DECK.z1), yaw: 0 },
  { key: 'rentalOffice' as const, center: vec3(OFFICE.x, OFFICE.height / 2, OFFICE.z), size: vec3(2 * OFFICE.halfX, OFFICE.height, 2 * OFFICE.halfZ), yaw: 0 },
]);

// Enemy events along every route, at the arrival density, beside the walk line and at least 25 m from the start; `along` is the position on the taxi route, which the enemies and the friend furthest back are measured on.
const SPAWN_CLEAR = 25;
const SPAWN_OFFSET = 2;
const mainRoute = ARRIVAL_ROUTES.find((r) => r.id === 'taxi')!.points.map((p) => [p.x, p.z] as [number, number]);
const mainIndex = createRouteIndex(mainRoute);
const start = draft.playerStart!.pos;
const enemySpawns: EnemyEvent[] = ARRIVAL_ROUTES.flatMap((r, i) => {
  const index = createRouteIndex(r.points.map((p) => [p.x, p.z] as [number, number]));
  return planEnemies(4301 + i, index.length, null, ARRIVAL_ENEMY_DENSITY).map((e) => {
    const at = index.pointAt(e.along);
    return { x: at.x - at.tz * e.side * SPAWN_OFFSET, z: at.z + at.tx * e.side * SPAWN_OFFSET };
  });
})
  .filter((at) => Math.hypot(at.x - start.x, at.z - start.z) >= SPAWN_CLEAR)
  .map((at) => ({ at: { x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100 }, along: mainIndex.project(at.x, at.z).along }))
  .sort((a, b) => a.along - b.along)
  .map((e, id) => ({ id, along: e.along, side: 1 as const, at: e.at }));

export const arrival: BuiltCourse = deepFreeze({ ...terrained, route: mainRoute, enemySpawns });
