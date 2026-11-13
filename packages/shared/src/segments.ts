import {
  COIN_HEIGHT,
  ROAD_JOINT_OVERLAP,
  ROAD_MAX_PIECE_YAW,
  ROAD_PIECE_LENGTH,
  ROAD_THICKNESS,
  ROAD_WIDTH,
  SEGMENT_MIN_LENGTH,
  STOP_PAD,
  STOP_ZONE,
} from './constants';
import type { Box, GroundBox, Placed, ServiceStop } from './course';
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
  | ({ type: 'bank'; height: number; gradient: number; anchors: number } & SegmentExtras)
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
}

// Pieces of a road, each starting exactly where the previous one's top surface ends.
function roadPieces(length: number, curve: number, slope: number): Piece[] {
  const pitch = degToRad(slope);
  const n = Math.max(Math.ceil(length / ROAD_PIECE_LENGTH - 1e-9), Math.ceil(Math.abs(curve) / ROAD_MAX_PIECE_YAW - 1e-9), 1);
  const pieceLength = length / n;
  const pieces: Piece[] = [];
  let start = vec3(0, 0, 0);
  let alongStart = 0;
  for (let i = 0; i < n; i++) {
    const yaw = ((i + 0.5) * curve) / n;
    const horizontal = pieceLength * Math.cos(pitch);
    pieces.push({ start, yaw, pitch, length: pieceLength, alongStart, horizontal });
    start = add(start, rotate(yawPitchQuat(yaw, pitch), vec3(0, 0, -pieceLength)));
    alongStart += horizontal;
  }
  return pieces;
}

function roadBoxes(pieces: Piece[], curved: boolean): GroundBox[] {
  return pieces.map((piece) => {
    const rot = yawPitchQuat(piece.yaw, piece.pitch);
    // Pieces meet end to end; only a change of yaw leaves a wedge at the outer edge that the overlap closes.
    const before = curved ? ROAD_JOINT_OVERLAP : 0;
    const total = piece.length + 2 * before;
    const center = add(piece.start, rotate(rot, vec3(0, -ROAD_THICKNESS / 2, -(total / 2 - before))));
    return { center, halfExtents: vec3(ROAD_WIDTH / 2, ROAD_THICKNESS / 2, total / 2), rot, surface: 'road' };
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
    const s = surfaceAt(along);
    const rot = yawQuat(s.yaw);
    const padCenter = offsetFrom(s, side * (ROAD_WIDTH / 2 + STOP_PAD.x), -STOP_PAD.y);
    out.ground.push({ center: padCenter, halfExtents: STOP_PAD, rot, surface: 'road' });
    const zoneLateral = side * (ROAD_WIDTH / 2 + 0.5 + STOP_ZONE.x);
    const operateLateral = side * (ROAD_WIDTH / 2 + 0.5 + 2 * STOP_ZONE.x + 1);
    const operatePoint = offsetFrom(s, operateLateral);
    out.stops.push({
      id: id('stop'),
      kind,
      zone: { center: offsetFrom(s, zoneLateral, STOP_ZONE.y), halfExtents: STOP_ZONE, rot },
      operatePoint,
      // A stop sits on a straight road facing -Z, so 2 m further along is -2 in z.
      shopCounter: kind === 'fuel' ? vec3(operatePoint.x, operatePoint.y, operatePoint.z - 2) : null,
    });
  }
}

function buildRoad(def: Extract<SegmentDef, { type: 'road' }>): LocalSegment {
  const curve = def.curve ?? 0;
  const slope = def.slope ?? 0;
  if (!(def.length > 0)) throw new Error('A road needs a positive length');
  if (curve !== 0 && slope !== 0) throw new Error('A road cannot both curve and slope');
  const pieces = roadPieces(def.length, curve, slope);
  const last = pieces[pieces.length - 1]!;
  const routeLength = last.alongStart + last.horizontal;
  if (routeLength < SEGMENT_MIN_LENGTH) throw new Error(`A segment's route must be at least ${SEGMENT_MIN_LENGTH} m`);
  const surfaceAt = surfaceOnPieces(pieces);
  const id = idCounter();
  const props: Placed[] = [];
  for (const [i, slot] of evenSlots(def.debris ?? 0, routeLength).entries()) {
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
  addExtras(def, curve === 0 && slope === 0, surfaceAt, id, seg);
  return seg;
}

export function buildSegment(def: SegmentDef): LocalSegment {
  if (def.type === 'road') return buildRoad(def);
  throw new Error(`Segment type ${def.type} is not built yet`);
}
