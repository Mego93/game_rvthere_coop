import { AMBIENT_ENDS, AMBIENT_MARGIN, CHECKPOINT_TRIGGER, FINISH_PAD, FINISH_TRIGGER, KILL_PLANE_BELOW, ROAD_WIDTH, SEGMENT_SPAWN_INSET } from '../constants';
import type { Box, BuiltCourse, Checkpoint, GroundBox, Placed } from '../course';
import { add, deepFreeze, quatMul, rotate, vec3, type Pose, type Vec3 } from '../math';
import { createRouteIndex } from '../routeAlong';
import { buildSegment, hazardSpan, obstacleSpans, yawPitchQuat, yawQuat, type LocalSegment, type SegmentDef } from '../segments';

export interface CourseDef {
  id: string;
  segments: SegmentDef[];
  targetTime: number;
  // Switches on ambient animals; the built course then carries `ambient` spans.
  ambient?: boolean;
  // Gives the course the solid, uneven land beside the road (see corridor.ts).
  corridor?: boolean;
}

interface Frame {
  pos: Vec3;
  yaw: number;
}

function placer(frame: Frame) {
  const q = yawQuat(frame.yaw);
  const point = (p: Vec3): Vec3 => add(frame.pos, rotate(q, p));
  const box = <T extends Box>(b: T): T => ({ ...b, center: point(b.center), rot: quatMul(q, b.rot) });
  const placed = (prefix: string) => (p: Placed): Placed => ({
    ...p,
    id: `${prefix}${p.id}`,
    pose: { pos: point(p.pose.pos), rot: quatMul(q, p.pose.rot) },
  });
  return { q, point, box, placed };
}

function mergeSpans(spans: { from: number; to: number }[]): { from: number; to: number }[] {
  const merged: { from: number; to: number }[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

export function buildCourse(def: CourseDef): BuiltCourse {
  if (def.segments.length === 0) throw new Error('A course needs at least one segment');
  def.segments.forEach((a, i) => {
    const b = def.segments[i + 1];
    if (a.type !== 'road' || b?.type !== 'road') return;
    // A curve's end overlap would leave a lip against a sloped neighbour.
    if ((a.curve && b.slope) || (a.slope && b.curve)) throw new Error(`Segments ${i} and ${i + 1}: a curved road next to a sloped one`);
  });
  const ground: GroundBox[] = [];
  const course: BuiltCourse = {
    id: def.id,
    ground,
    walls: [],
    props: [],
    pickups: [],
    anchors: [],
    stops: [],
    coins: [],
    decor: [],
    checkpoints: [],
    route: [],
    finish: { center: vec3(0, 0, 0), halfExtents: vec3(0, 0, 0), rot: yawQuat(0) },
    killPlaneY: 0,
    targetTime: def.targetTime,
  };

  const raw: { from: number; to: number }[] = [];
  const obstacles: { from: number; to: number }[] = [];
  let routeAt = 0;
  let frame: Frame = { pos: vec3(0, 0, 0), yaw: 0 };
  const addRoute = (local: LocalSegment, at: ReturnType<typeof placer>, first: boolean) => {
    const points = local.route.map(([x, z]) => at.point(vec3(x, 0, z)));
    for (const p of first ? points : points.slice(1)) course.route.push([p.x, p.z]);
  };

  def.segments.forEach((segmentDef, index) => {
    const local = buildSegment(segmentDef);
    const at = placer(frame);
    const prefix = `s${index}-`;
    ground.push(...local.ground.map(at.box));
    course.walls.push(...local.walls.map(at.box));
    course.props.push(...local.props.map(at.placed(prefix)));
    course.pickups.push(...local.pickups.map(at.placed(prefix)));
    course.anchors.push(...local.anchors.map(at.placed(prefix)));
    course.coins.push(...local.coins.map(at.placed(prefix)));
    course.decor.push(...local.decor.map(at.placed(prefix)));
    for (const stop of local.stops) {
      course.stops.push({
        ...stop,
        id: `${prefix}${stop.id}`,
        zone: at.box(stop.zone),
        operatePoint: at.point(stop.operatePoint),
        shopCounter: stop.shopCounter && at.point(stop.shopCounter),
      });
    }
    const spawn = local.surfaceAt(SEGMENT_SPAWN_INSET);
    const spawnPose: Pose = { pos: at.point(spawn.pos), rot: quatMul(at.q, yawPitchQuat(spawn.yaw, spawn.pitch)) };
    const checkpoint: Checkpoint = {
      id: `cp-${index}`,
      trigger: {
        center: at.point(vec3(0, CHECKPOINT_TRIGGER.y, 0)),
        halfExtents: vec3(local.width / 2, CHECKPOINT_TRIGGER.y, CHECKPOINT_TRIGGER.z),
        rot: at.q,
      },
      spawn: spawnPose,
    };
    course.checkpoints.push(checkpoint);
    addRoute(local, at, index === 0);
    const from = routeAt;
    if (def.ambient || def.corridor) {
      for (let i = 1; i < local.route.length; i++) routeAt += Math.hypot(local.route[i]![0] - local.route[i - 1]![0], local.route[i]![1] - local.route[i - 1]![1]);
    }
    if (def.corridor) for (const [a, b] of obstacleSpans(segmentDef, routeAt - from)) obstacles.push({ from: from + a, to: from + b });
    if (def.ambient) {
      const terrain = segmentDef.type !== 'road' || Boolean(segmentDef.slope);
      if (terrain) raw.push({ from: from - AMBIENT_MARGIN, to: routeAt + AMBIENT_MARGIN });
      const marks: [number, number][] = [];
      if (segmentDef.stop) marks.push([segmentDef.stop.along, segmentDef.stop.along]);
      if (segmentDef.type === 'road') for (const h of segmentDef.hazards ?? []) marks.push(hazardSpan(h));
      for (const d of local.debrisAlong ?? []) marks.push([d, d]);
      for (const [a, b] of marks) raw.push({ from: from + a - AMBIENT_MARGIN, to: from + b + AMBIENT_MARGIN });
    }
    frame = { pos: at.point(local.exit.pos), yaw: frame.yaw + local.exit.yaw };
  });

  const pad = buildSegment({ type: 'road', length: FINISH_PAD });
  const at = placer(frame);
  ground.push(...pad.ground.map(at.box));
  addRoute(pad, at, false);
  course.finish = {
    center: at.point(vec3(0, FINISH_TRIGGER.y, -FINISH_PAD / 2)),
    halfExtents: FINISH_TRIGGER,
    rot: at.q,
  };

  if (def.ambient) {
    const total = createRouteIndex(course.route).length;
    raw.push({ from: -1, to: AMBIENT_ENDS }, { from: total - AMBIENT_ENDS, to: total + 1 });
    const blocked: { from: number; to: number }[] = [];
    for (const span of raw.map((r) => ({ from: Math.max(0, r.from), to: Math.min(total, r.to) })).sort((a, b) => a.from - b.from || a.to - b.to)) {
      const last = blocked[blocked.length - 1];
      if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
      else blocked.push(span);
    }
    course.ambient = { blocked };
  }
  if (def.corridor) course.corridor = { obstacles: mergeSpans(obstacles) };

  let lowest = Infinity;
  for (const b of ground) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = add(b.center, rotate(b.rot, vec3(sx * b.halfExtents.x, b.halfExtents.y, sz * b.halfExtents.z)));
        lowest = Math.min(lowest, corner.y);
      }
    }
  }
  course.killPlaneY = lowest - KILL_PLANE_BELOW;

  return deepFreeze(course);
}
