import { CHECKPOINT_TRIGGER, FINISH_PAD, KILL_PLANE_BELOW, ROAD_WIDTH, SEGMENT_SPAWN_INSET } from '../constants';
import type { Box, BuiltCourse, Checkpoint, GroundBox, Placed } from '../course';
import { add, deepFreeze, quatMul, rotate, vec3, type Pose, type Vec3 } from '../math';
import { buildSegment, yawPitchQuat, yawQuat, type LocalSegment, type SegmentDef } from '../segments';

export interface CourseDef {
  id: string;
  segments: SegmentDef[];
  targetTime: number;
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

export function buildCourse(def: CourseDef): BuiltCourse {
  if (def.segments.length === 0) throw new Error('A course needs at least one segment');
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
    frame = { pos: at.point(local.exit.pos), yaw: frame.yaw + local.exit.yaw };
  });

  const pad = buildSegment({ type: 'road', length: FINISH_PAD });
  const at = placer(frame);
  ground.push(...pad.ground.map(at.box));
  addRoute(pad, at, false);
  course.finish = {
    center: at.point(vec3(0, 2, -FINISH_PAD / 2)),
    halfExtents: vec3(ROAD_WIDTH / 2, 2, 2),
    rot: at.q,
  };

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
