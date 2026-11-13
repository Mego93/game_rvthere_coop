import {
  ALLEY_CLUTTER_SPACING,
  ALLEY_WALL_CLEARANCE,
  ALLEY_WALL_HEIGHT,
  ALLEY_WIDTH,
  BANK_APPROACH,
  BANK_TOP,
  BOULDER_EDGE_INSET,
  BOULDER_FIRST_ALONG,
  BOULDER_PAIR_SPACING,
  COIN_HEIGHT,
  FENCE_HEIGHT,
  FORD_ROCK,
  FORD_ROCK_LATERAL,
  PALM_OFFSET,
  PROP_KINDS,
  ROADWORKS_BARRIER_SPACING,
  ROADWORKS_FIRST_ROW,
  ROADWORKS_LAST_ROW_CLEARANCE,
  ROADWORKS_ROW,
  ROADWORKS_ROW_SPACING,
  SAND_APRON,
  WALL_THICKNESS,
  WATER_HALF_THICKNESS,
  ROAD_JOINT_OVERLAP,
  ROAD_MAX_PIECE_YAW,
  ROAD_PIECE_LENGTH,
  ROAD_THICKNESS,
  ROAD_WIDTH,
  SEGMENT_MIN_LENGTH,
  SEGMENT_SPAWN_INSET,
  STOP_COUNTER_OFFSET,
  STOP_OPERATE_GAP,
  STOP_PAD,
  STOP_ZONE_GAP,
  STOP_ZONE,
  type PropKind,
  type Surface,
} from './constants';
import type { Box, GroundBox, Placed, ServiceStop } from './course';
import { VEHICLES } from './vehicles';
import { AXIS_X, AXIS_Y, add, degToRad, quatFromAxisAngle, quatMul, rotate, vec3, type Quat, type Vec3 } from './math';

export interface Placement {
  kind?: string;
  along: number;
  lateral: number;
  height?: number;
}

export interface SegmentExtras {
  pickups?: Placement[];
  anchors?: Placement[];
  coins?: Placement[];
  stop?: { kind: 'fuel' | 'garage'; side: -1 | 1; along: number };
}

export type SegmentDef =
  | ({ type: 'road'; length: number; curve?: number; slope?: number; debris?: number } & SegmentExtras)
  | ({ type: 'alley'; length: number; clutter: number } & SegmentExtras)
  | ({ type: 'sand'; length: number; palms: number } & SegmentExtras)
  | ({ type: 'ford'; width: number; rocks: number } & SegmentExtras)
  // A bank's own `anchors` count takes the place of the extras' anchor list.
  | ({ type: 'bank'; height: number; gradient: number; anchors: number } & Omit<SegmentExtras, 'anchors'>)
  | ({ type: 'roadworks'; length: number; obstacles: number } & SegmentExtras);

export interface SurfacePoint {
  pos: Vec3;
  yaw: number;
  pitch: number;
}

// A segment in its own frame: entry at the origin facing -Z. Ids are local (`crate-1`); the course builder prefixes them.
export interface LocalSegment {
  ground: GroundBox[];
  walls: Box[];
  props: Placed[];
  pickups: Placed[];
  anchors: Placed[];
  stops: ServiceStop[];
  coins: Placed[];
  decor: Placed[];
  width: number;
  route: [x: number, z: number][];
  exit: { pos: Vec3; yaw: number };
  // The surface `along` metres (horizontal, along the route) from the entry, on the centre line.
  surfaceAt(along: number): SurfacePoint;
}

export const yawQuat = (yaw: number): Quat => quatFromAxisAngle(AXIS_Y, yaw);
export const yawPitchQuat = (yaw: number, pitch: number): Quat => quatMul(yawQuat(yaw), quatFromAxisAngle(AXIS_X, pitch));

// A point `lateral` metres to the right of the centre line (and `height` above the surface) at a surface point.
export function offsetFrom(s: SurfacePoint, lateral: number, height = 0): Vec3 {
  const right = rotate(yawQuat(s.yaw), vec3(1, 0, 0));
  return vec3(s.pos.x + right.x * lateral, s.pos.y + height, s.pos.z + right.z * lateral);
}

interface Piece {
  start: Vec3;
  yaw: number;
  pitch: number;
  // Along the surface.
  length: number;
  // Along the ground, from the entry of the segment.
  alongStart: number;
  horizontal: number;
  surface: Surface;
}

// Pieces of a road, each starting exactly where the previous one's top surface ends.
function roadPieces(length: number, curve: number, slope: number, surface: Surface = 'road', from?: Piece): Piece[] {
  const pitch = degToRad(slope);
  const n = Math.max(Math.ceil(length / ROAD_PIECE_LENGTH - 1e-9), Math.ceil(Math.abs(curve) / ROAD_MAX_PIECE_YAW - 1e-9), 1);
  const pieceLength = length / n;
  const pieces: Piece[] = [];
  let start = from ? endOf(from) : vec3(0, 0, 0);
  let alongStart = from ? from.alongStart + from.horizontal : 0;
  for (let i = 0; i < n; i++) {
    const yaw = ((i + 0.5) * curve) / n;
    const horizontal = pieceLength * Math.cos(pitch);
    pieces.push({ start, yaw, pitch, length: pieceLength, alongStart, horizontal, surface });
    start = add(start, rotate(yawPitchQuat(yaw, pitch), vec3(0, 0, -pieceLength)));
    alongStart += horizontal;
  }
  return pieces;
}

function roadBoxes(pieces: Piece[], curved: boolean, width = ROAD_WIDTH): GroundBox[] {
  return pieces.map((piece) => {
    const rot = yawPitchQuat(piece.yaw, piece.pitch);
    // Pieces meet end to end; only a change of yaw leaves a wedge at the outer edge that the overlap closes.
    const before = curved ? ROAD_JOINT_OVERLAP : 0;
    const total = piece.length + 2 * before;
    const center = add(piece.start, rotate(rot, vec3(0, -ROAD_THICKNESS / 2, -(total / 2 - before))));
    return { center, halfExtents: vec3(width / 2, ROAD_THICKNESS / 2, total / 2), rot, surface: piece.surface };
  });
}

function endOf(piece: Piece): Vec3 {
  return add(piece.start, rotate(yawPitchQuat(piece.yaw, piece.pitch), vec3(0, 0, -piece.length)));
}

function surfaceOnPieces(pieces: Piece[]): (along: number) => SurfacePoint {
  const last = pieces[pieces.length - 1]!;
  const total = last.alongStart + last.horizontal;
  return (along) => {
    if (along < -1e-9 || along > total + 1e-9) throw new RangeError(`along ${along} is outside the segment (0 to ${total})`);
    const piece = pieces.find((p) => along <= p.alongStart + p.horizontal + 1e-9) ?? last;
    const t = piece.horizontal === 0 ? 0 : Math.min(1, Math.max(0, (along - piece.alongStart) / piece.horizontal));
    const from = piece.start;
    const to = endOf(piece);
    return {
      pos: vec3(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t),
      yaw: piece.yaw,
      pitch: piece.pitch,
    };
  };
}

// Ids are `<kind>-<n>`, n from 1 per kind within the segment, across every list the segment fills.
export function idCounter(): (kind: string) => string {
  const counts = new Map<string, number>();
  return (kind) => {
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    return `${kind}-${n}`;
  };
}

// S7: `count` things at fractions (n - 0.5) / count of the route, sides alternating left, right, starting left.
export function evenSlots(count: number, routeLength: number): { along: number; side: -1 | 1 }[] {
  return Array.from({ length: count }, (_, i) => ({ along: ((i + 0.5) / count) * routeLength, side: i % 2 === 0 ? -1 : 1 }));
}

function addExtras(
  def: SegmentExtras,
  flat: boolean,
  surfaceAt: (along: number) => SurfacePoint,
  routeLength: number,
  id: (kind: string) => string,
  out: Pick<LocalSegment, 'ground' | 'pickups' | 'anchors' | 'coins' | 'stops'>,
): void {
  for (const [list, target] of [
    [def.pickups, out.pickups],
    [def.anchors, out.anchors],
  ] as const) {
    for (const p of list ?? []) {
      if (!p.kind) throw new Error('A pickup or anchor placement needs a kind');
      const s = surfaceAt(p.along);
      const rot = list === def.pickups ? yawPitchQuat(s.yaw, s.pitch) : yawQuat(s.yaw);
      target.push({ id: id(p.kind), kind: p.kind, pose: { pos: offsetFrom(s, p.lateral, p.height ?? 0), rot } });
    }
  }
  for (const p of def.coins ?? []) {
    const s = surfaceAt(p.along);
    const kind = p.kind ?? 'coin';
    out.coins.push({ id: id(kind), kind, pose: { pos: offsetFrom(s, p.lateral, p.height ?? COIN_HEIGHT), rot: yawQuat(s.yaw) } });
  }
  if (def.stop) {
    if (!flat) throw new Error('A stop needs a straight, flat road');
    const { kind, side, along } = def.stop;
    if (along - STOP_PAD.z < 0 || along + STOP_PAD.z > routeLength) throw new Error('A stop pad would leave the segment');
    const s = surfaceAt(along);
    const rot = yawQuat(s.yaw);
    const padCenter = offsetFrom(s, side * (ROAD_WIDTH / 2 + STOP_PAD.x), -STOP_PAD.y);
    out.ground.push({ center: padCenter, halfExtents: STOP_PAD, rot, surface: 'road' });
    const zoneLateral = side * (ROAD_WIDTH / 2 + STOP_ZONE_GAP + STOP_ZONE.x);
    const operateLateral = side * (ROAD_WIDTH / 2 + STOP_ZONE_GAP + 2 * STOP_ZONE.x + STOP_OPERATE_GAP);
    const operatePoint = offsetFrom(s, operateLateral);
    out.stops.push({
      id: id('stop'),
      kind,
      zone: { center: offsetFrom(s, zoneLateral, STOP_ZONE.y), halfExtents: STOP_ZONE, rot },
      operatePoint,
      // A stop sits on a straight road facing -Z, so further along is smaller z.
      shopCounter: kind === 'fuel' ? vec3(operatePoint.x, operatePoint.y, operatePoint.z - STOP_COUNTER_OFFSET) : null,
    });
  }
}

function buildRoad(def: Extract<SegmentDef, { type: 'road' }>): LocalSegment {
  const curve = def.curve ?? 0;
  const slope = def.slope ?? 0;
  if (!(def.length > 0)) throw new Error('A road needs a positive length');
  if (curve !== 0 && slope !== 0) throw new Error('A road cannot both curve and slope');
  checkCount(def.debris, 'Debris');
  const pieces = roadPieces(def.length, curve, slope);
  const last = pieces[pieces.length - 1]!;
  const routeLength = last.alongStart + last.horizontal;
  if (routeLength < SEGMENT_MIN_LENGTH) throw new Error(`A segment's route must be at least ${SEGMENT_MIN_LENGTH} m`);
  const surfaceAt = surfaceOnPieces(pieces);
  const id = idCounter();
  const props: Placed[] = [];
  for (const slot of evenSlots(def.debris ?? 0, routeLength)) {
    const s = surfaceAt(slot.along);
    props.push({ id: id('crate'), kind: 'crate', pose: { pos: offsetFrom(s, (slot.side * ROAD_WIDTH) / 4), rot: yawPitchQuat(s.yaw, s.pitch) } });
  }
  const seg: LocalSegment = {
    ground: roadBoxes(pieces, curve !== 0),
    walls: [],
    props,
    pickups: [],
    anchors: [],
    stops: [],
    coins: [],
    decor: [],
    width: ROAD_WIDTH,
    route: [[0, 0], ...pieces.map((p) => [endOf(p).x, endOf(p).z] as [number, number])],
    exit: { pos: endOf(last), yaw: curve },
    surfaceAt,
  };
  addExtras(def, curve === 0 && slope === 0, surfaceAt, routeLength, id, seg);
  return seg;
}

const routeOf = (pieces: Piece[]): [number, number][] => [[0, 0], ...pieces.map((p) => [endOf(p).x, endOf(p).z] as [number, number])];
const routeLengthOf = (pieces: Piece[]): number => {
  const last = pieces[pieces.length - 1]!;
  return last.alongStart + last.horizontal;
};

function finish(
  pieces: Piece[],
  parts: Pick<LocalSegment, 'ground' | 'walls' | 'props' | 'anchors' | 'decor'> & { width: number },
  def: SegmentExtras,
  id: (kind: string) => string,
): LocalSegment {
  const routeLength = routeLengthOf(pieces);
  if (routeLength < SEGMENT_MIN_LENGTH) throw new Error(`A segment's route must be at least ${SEGMENT_MIN_LENGTH} m`);
  const surfaceAt = surfaceOnPieces(pieces);
  const seg: LocalSegment = {
    ...parts,
    pickups: [],
    stops: [],
    coins: [],
    route: routeOf(pieces),
    exit: { pos: endOf(pieces[pieces.length - 1]!), yaw: 0 },
    surfaceAt,
  };
  addExtras(def, false, surfaceAt, routeLength, id, seg);
  return seg;
}

// A wall along one edge: the inner face at `inner`, the thickness outward, from the ground top up to `height`.
function edgeWall(side: -1 | 1, inner: number, height: number, length: number): Box {
  return {
    center: vec3(side * (inner + WALL_THICKNESS / 2), height / 2, -length / 2),
    halfExtents: vec3(WALL_THICKNESS / 2, height / 2, length / 2),
    rot: yawQuat(0),
  };
}

function checkCount(count: number | undefined, what: string): void {
  if (count !== undefined && !(Number.isInteger(count) && count >= 0)) throw new Error(`${what} must be a non-negative whole number`);
}

function checkLength(length: number, what: string): void {
  if (!(length > 0)) throw new Error(`${what} needs a positive length`);
}

function buildAlley(def: Extract<SegmentDef, { type: 'alley' }>): LocalSegment {
  checkLength(def.length, 'An alley');
  if (!(def.clutter >= 0 && def.clutter <= 1)) throw new Error('Alley clutter is a density from 0 to 1');
  const pieces = roadPieces(def.length, 0, 0);
  const routeLength = routeLengthOf(pieces);
  const surfaceAt = surfaceOnPieces(pieces);
  const id = idCounter();
  const kinds: PropKind[] = ['crate', 'cart', 'scooter'];
  const count = Math.floor((def.clutter * def.length) / ALLEY_CLUTTER_SPACING + 1e-9);
  // Clutter starts past the RV standing on the checkpoint spawn, so none lands on a player slot there.
  const from = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + Math.max(...kinds.map((k) => PROP_KINDS[k].halfExtents.z));
  const props = evenSlots(count, routeLength - from).map((slot, i): Placed => {
    const kind = kinds[i % kinds.length]!;
    const lateral = slot.side * (ALLEY_WIDTH / 2 - PROP_KINDS[kind].halfExtents.x - ALLEY_WALL_CLEARANCE);
    return { id: id(kind), kind, pose: { pos: offsetFrom(surfaceAt(from + slot.along), lateral), rot: yawQuat(0) } };
  });
  return finish(
    pieces,
    {
      ground: roadBoxes(pieces, false, ALLEY_WIDTH),
      walls: [edgeWall(-1, ALLEY_WIDTH / 2, ALLEY_WALL_HEIGHT, routeLength), edgeWall(1, ALLEY_WIDTH / 2, ALLEY_WALL_HEIGHT, routeLength)],
      props,
      anchors: [],
      decor: [],
      width: ALLEY_WIDTH,
    },
    def,
    id,
  );
}

function buildSand(def: Extract<SegmentDef, { type: 'sand' }>): LocalSegment {
  checkLength(def.length, 'A sand segment');
  checkCount(def.palms, 'Palms');
  const apron = roadPieces(SAND_APRON, 0, 0);
  const last = apron[apron.length - 1]!;
  const start = endOf(last);
  const sand: Piece = { start, yaw: 0, pitch: 0, length: def.length, alongStart: routeLengthOf(apron), horizontal: def.length, surface: 'sand' };
  const pieces = [...apron, sand];
  const routeLength = routeLengthOf(pieces);
  const surfaceAt = surfaceOnPieces(pieces);
  const id = idCounter();
  const anchors = evenSlots(def.palms, routeLength).map(
    (slot): Placed => ({
      id: id('palm'),
      kind: 'palm',
      pose: { pos: offsetFrom(surfaceAt(slot.along), slot.side * (ROAD_WIDTH / 2 + PALM_OFFSET)), rot: yawQuat(0) },
    }),
  );
  return finish(pieces, { ground: roadBoxes(pieces, false), walls: [], props: [], anchors, decor: [], width: ROAD_WIDTH }, def, id);
}

function buildFord(def: Extract<SegmentDef, { type: 'ford' }>): LocalSegment {
  checkLength(def.width, 'A ford');
  checkCount(def.rocks, 'Rocks');
  const bed: Piece = { start: vec3(0, 0, 0), yaw: 0, pitch: 0, length: def.width, alongStart: 0, horizontal: def.width, surface: 'riverbed' };
  const surfaceAt = surfaceOnPieces([bed]);
  const id = idCounter();
  // Rocks start past the RV standing on the checkpoint spawn, so none lands under a wheel there.
  const from = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + FORD_ROCK.z;
  const walls = evenSlots(def.rocks, def.width - FORD_ROCK.z - from).map(
    (slot): Box => ({
      center: offsetFrom(surfaceAt(from + slot.along), slot.side * FORD_ROCK_LATERAL, FORD_ROCK.y),
      halfExtents: FORD_ROCK,
      rot: yawQuat(0),
    }),
  );
  const water: Placed = {
    id: id('water'),
    kind: 'water',
    pose: { pos: surfaceAt(def.width / 2).pos, rot: yawQuat(0) },
    size: vec3(ROAD_WIDTH / 2, WATER_HALF_THICKNESS, def.width / 2),
  };
  return finish([bed], { ground: roadBoxes([bed], false), walls, props: [], anchors: [], decor: [water], width: ROAD_WIDTH }, def, id);
}

function buildBank(def: Extract<SegmentDef, { type: 'bank' }>): LocalSegment {
  if (!(def.height > 0)) throw new Error('A bank needs a positive height');
  checkCount(def.anchors, 'Bank anchors');
  if (!(def.gradient > 0 && def.gradient < 90)) throw new Error('A bank needs a gradient between 0 and 90 degrees');
  const approach = roadPieces(BANK_APPROACH, 0, 0);
  const ramp = roadPieces(def.height / Math.sin(degToRad(def.gradient)), 0, def.gradient, 'gravel', approach[approach.length - 1]);
  const top = roadPieces(BANK_TOP, 0, 0, 'road', ramp[ramp.length - 1]);
  const pieces = [...approach, ...ramp, ...top];
  const surfaceAt = surfaceOnPieces(pieces);
  const topStart = top[0]!.alongStart;
  const id = idCounter();
  // Boulders alternate sides; each further pair sits further on.
  const anchors = Array.from({ length: def.anchors }, (_, i): Placed => {
    const side = i % 2 === 0 ? -1 : 1;
    const along = topStart + BOULDER_FIRST_ALONG + BOULDER_PAIR_SPACING * Math.floor(i / 2);
    if (along > topStart + BANK_TOP) throw new Error('Too many boulders for the top of the bank');
    return { id: id('boulder'), kind: 'boulder', pose: { pos: offsetFrom(surfaceAt(along), side * (ROAD_WIDTH / 2 - BOULDER_EDGE_INSET)), rot: yawQuat(0) } };
  });
  const { anchors: _count, ...extras } = def;
  return finish(pieces, { ground: roadBoxes(pieces, false), walls: [], props: [], anchors, decor: [], width: ROAD_WIDTH }, extras, id);
}

function buildRoadworks(def: Extract<SegmentDef, { type: 'roadworks' }>): LocalSegment {
  checkLength(def.length, 'A roadworks segment');
  checkCount(def.obstacles, 'Obstacles');
  const rows = Math.ceil(def.obstacles / ROADWORKS_ROW);
  if (rows > 0 && def.length < ROADWORKS_FIRST_ROW + (rows - 1) * ROADWORKS_ROW_SPACING + ROADWORKS_LAST_ROW_CLEARANCE) {
    throw new Error(`${def.obstacles} obstacles do not fit in ${def.length} m of roadworks`);
  }
  const pieces = roadPieces(def.length, 0, 0);
  const routeLength = routeLengthOf(pieces);
  const surfaceAt = surfaceOnPieces(pieces);
  const id = idCounter();
  const props = Array.from({ length: def.obstacles }, (_, i): Placed => {
    const along = ROADWORKS_FIRST_ROW + Math.floor(i / ROADWORKS_ROW) * ROADWORKS_ROW_SPACING;
    const lateral = ((i % ROADWORKS_ROW) - (ROADWORKS_ROW - 1) / 2) * ROADWORKS_BARRIER_SPACING;
    return { id: id('barrier'), kind: 'barrier', pose: { pos: offsetFrom(surfaceAt(along), lateral), rot: yawQuat(0) } };
  });
  const walls = [edgeWall(-1, ROAD_WIDTH / 2, FENCE_HEIGHT, routeLength), edgeWall(1, ROAD_WIDTH / 2, FENCE_HEIGHT, routeLength)];
  return finish(pieces, { ground: roadBoxes(pieces, false), walls, props, anchors: [], decor: [], width: ROAD_WIDTH }, def, id);
}

export function buildSegment(def: SegmentDef): LocalSegment {
  switch (def.type) {
    case 'road':
      return buildRoad(def);
    case 'alley':
      return buildAlley(def);
    case 'sand':
      return buildSand(def);
    case 'ford':
      return buildFord(def);
    case 'bank':
      return buildBank(def);
    case 'roadworks':
      return buildRoadworks(def);
  }
}
