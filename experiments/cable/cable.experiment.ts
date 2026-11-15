import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, test } from 'vitest';
import { GRAVITY, TICK_DT, TICK_RATE } from '../../packages/shared/src/constants';
import type { BuiltCourse, GroundBox } from '../../packages/shared/src/course';
import { slopePose, testGround } from '../../packages/shared/src/courses/testGround';
import { AXIS_X, IDENTITY, add, deepFreeze, degToRad, dot, length, quatFromAxisAngle, rotate, scale, sub, vec3, type Pose, type Vec3 } from '../../packages/shared/src/math';
import { createProps, type Props } from '../../packages/shared/src/props';
import { createRig, withBoxes, withProps, type Rig } from '../../packages/shared/src/testRig';
import { getVehicleConfig, type VehicleId } from '../../packages/shared/src/vehicles';
import { anchorPoint } from '../../packages/shared/src/winch';

// Throwaway experiment for build step 1. It finds stable starting values for the force-based
// winch cable at both vehicle masses. Nothing in packages/ imports this file.

interface CableParams {
  // Spring stiffness per kilogram of vehicle, in N/m per kg.
  stiffnessPerKg: number;
  dampingRatio: number;
  // The tension cap as a fraction of the vehicle's weight.
  forcePerWeight: number;
}

// The value the stiffness sweep was run at; the force sweep below varies it.
const BASELINE_FORCE_PER_WEIGHT = 0.6;
const FORCE_SWEEP = [0.6, 0.75, 0.9, 1.0];
const REEL_SPEED = 1;
const MIN_LENGTH = 1.5;
const START_ALONG = 8;
const ANCHOR_ALONG = 38;
const GOAL_ALONG = 30;

interface Result {
  vehicle: VehicleId;
  stiffnessPerKg: number;
  dampingRatio: number;
  forcePerWeight: number;
  secondsToTop: number | null;
  maxSpeed: number;
  maxSpin: number;
  maxStretch: number;
  maxSpeedAfterRelease: number;
  // Mean tension in N while climbing, and the share of climbing ticks spent at the cap.
  meanTension: number;
  cappedShare: number;
}

function simulate(vehicle: VehicleId, params: CableParams, brakedSeconds: number): Omit<Result, 'maxSpeedAfterRelease'> & { speedAfterRelease: number } {
  const rig = createRig(RAPIER, vehicle, slopePose('steep', START_ALONG));
  const { body, config } = rig.vehicle;
  rig.run(1, { brake: true });

  const anchor = add(slopePose('steep', ANCHOR_ALONG).pos, vec3(0, 0.5, 0));
  const mount = (): Vec3 => add(body.translation(), rotate(body.rotation(), config.winchMount));
  const stiffness = params.stiffnessPerKg * config.mass;
  const damping = 2 * params.dampingRatio * config.mass * Math.sqrt(params.stiffnessPerKg);
  const cap = params.forcePerWeight * config.mass * GRAVITY;
  const startY = body.translation().y;
  const goalGain = slopePose('steep', GOAL_ALONG).pos.y - slopePose('steep', START_ALONG).pos.y;

  let cableLength = length(sub(anchor, mount()));
  let secondsToTop: number | null = null;
  let maxSpeed = 0;
  let maxSpin = 0;
  let maxStretch = 0;
  let speedAfterRelease = 0;
  let tensionSum = 0;
  let climbTicks = 0;
  let cappedTicks = 0;

  const totalTicks = (brakedSeconds + 40) * TICK_RATE;
  for (let tick = 0; tick < totalTicks; tick++) {
    const braked = tick < brakedSeconds * TICK_RATE;
    const from = mount();
    const toAnchor = sub(anchor, from);
    const distance = length(toAnchor);
    const direction = scale(toAnchor, 1 / distance);
    const stretch = distance - cableLength;
    // Positive when the two ends are moving apart.
    const stretchRate = -dot(body.velocityAtPoint(from), direction);
    const tension = stretch > 0 ? Math.min(cap, Math.max(0, stiffness * stretch + damping * stretchRate)) : 0;
    if (!braked && secondsToTop === null) {
      tensionSum += tension;
      climbTicks++;
      if (tension >= cap) cappedTicks++;
    }
    if (tension > 0) body.applyImpulseAtPoint(scale(direction, tension * TICK_DT), from, true);
    // The cable does not shorten while its tension is at the cap.
    if (tension < cap) cableLength = Math.max(MIN_LENGTH, cableLength - REEL_SPEED * TICK_DT);

    rig.vehicle.step({ throttle: 0, steer: 0, brake: braked });
    rig.world.step();

    const speed = length(body.linvel());
    maxSpeed = Math.max(maxSpeed, speed);
    maxSpin = Math.max(maxSpin, length(body.angvel()));
    maxStretch = Math.max(maxStretch, stretch);
    if (!braked && tick < (brakedSeconds + 3) * TICK_RATE) speedAfterRelease = Math.max(speedAfterRelease, speed);
    if (secondsToTop === null && body.translation().y - startY >= goalGain) {
      secondsToTop = (tick + 1) / TICK_RATE - brakedSeconds;
    }
  }
  return { vehicle, ...params, secondsToTop, maxSpeed, maxSpin, maxStretch, speedAfterRelease, meanTension: climbTicks > 0 ? tensionSum / climbTicks : 0, cappedShare: climbTicks > 0 ? cappedTicks / climbTicks : 0 };
}

beforeAll(async () => {
  await RAPIER.init();
});

test('sweep cable stiffness and damping for both vehicles', () => {
  const rows: Result[] = [];
  for (const vehicle of ['lodgy', 'rv'] as const) {
    for (const stiffnessPerKg of [20, 60, 150, 400]) {
      for (const dampingRatio of [0.5, 1, 2]) {
        const free = simulate(vehicle, { stiffnessPerKg, dampingRatio, forcePerWeight: BASELINE_FORCE_PER_WEIGHT }, 0);
        const stalled = simulate(vehicle, { stiffnessPerKg, dampingRatio, forcePerWeight: BASELINE_FORCE_PER_WEIGHT }, 5);
        rows.push({
          vehicle,
          stiffnessPerKg,
          dampingRatio,
          forcePerWeight: BASELINE_FORCE_PER_WEIGHT,
          secondsToTop: free.secondsToTop,
          maxSpeed: free.maxSpeed,
          maxSpin: free.maxSpin,
          maxStretch: free.maxStretch,
          maxSpeedAfterRelease: stalled.speedAfterRelease,
          meanTension: free.meanTension,
          cappedShare: free.cappedShare,
        });
      }
    }
  }
  const fmt = (n: number | null) => (n === null ? 'never' : n.toFixed(2));
  console.log('vehicle  k/kg  zeta  toTop(s)  maxSpeed  maxSpin  maxStretch  speedAfterRelease');
  for (const r of rows) {
    console.log(
      [r.vehicle.padEnd(7), String(r.stiffnessPerKg).padStart(5), fmt(r.dampingRatio).padStart(5), fmt(r.secondsToTop).padStart(9),
        fmt(r.maxSpeed).padStart(9), fmt(r.maxSpin).padStart(8), fmt(r.maxStretch).padStart(11), fmt(r.maxSpeedAfterRelease).padStart(18)].join(' '),
    );
  }
});

// ---- Step 26 (W1, B7): the tension cap swept over {0.6, 0.75, 0.9, 1.0} ----

const STIFFNESS_PER_KG = 150;
const DAMPING_RATIO = 1;

interface Pull {
  vehicle: VehicleId;
  course: BuiltCourse;
  spawn: Pose;
  forcePerWeight: number;
  seconds: number;
  brake: boolean | ((tick: number) => boolean);
  anchor: (rig: Rig, props: Props) => () => { point: Vec3; velocity: Vec3 };
  // Called after each tick.
  onTick?: (tick: number, tension: number, rig: Rig, props: Props) => void;
  before?: (rig: Rig, props: Props) => void;
}

// The same tension and reel rules as winch.ts, with the cap as a parameter and the far end free to move.
function pull(p: Pull): { rig: Rig; props: Props; capped: number; ticks: number } {
  const rig = createRig(RAPIER, p.vehicle, p.spawn, p.course);
  const props = createProps(RAPIER, rig.world, p.course);
  rig.world.step();
  p.before?.(rig, props);
  rig.run(1, { brake: true });
  const { body, config } = rig.vehicle;
  const far = p.anchor(rig, props);
  const mount = (): Vec3 => add(body.translation(), rotate(body.rotation(), config.winchMount));
  const stiffness = STIFFNESS_PER_KG * config.mass;
  const damping = 2 * DAMPING_RATIO * config.mass * Math.sqrt(STIFFNESS_PER_KG);
  const cap = p.forcePerWeight * config.mass * GRAVITY;
  let cableLength = length(sub(far().point, mount()));
  let capped = 0;
  const ticks = Math.round(p.seconds * TICK_RATE);
  for (let tick = 0; tick < ticks; tick++) {
    const from = mount();
    const end = far();
    const span = sub(end.point, from);
    const distance = length(span);
    const direction = scale(span, 1 / distance);
    const stretch = distance - cableLength;
    const rate = -dot(sub(body.velocityAtPoint(from), end.velocity), direction);
    const tension = stretch > 0 ? Math.min(cap, Math.max(0, stiffness * stretch + damping * rate)) : 0;
    if (tension > 0) {
      const impulse = scale(direction, tension * TICK_DT);
      body.applyImpulseAtPoint(impulse, from, true);
      for (const prop of props.all()) {
        if (prop.heldBy === null && !prop.locked && length(sub(prop.body.translation(), end.point)) < 2) {
          prop.body.applyImpulseAtPoint(scale(impulse, -1), end.point, true);
        }
      }
    }
    if (tension >= cap) capped++;
    else cableLength = Math.max(MIN_LENGTH, cableLength - REEL_SPEED * TICK_DT);
    const brake = typeof p.brake === 'function' ? p.brake(tick) : p.brake;
    rig.vehicle.step({ throttle: 0, steer: 0, brake });
    rig.world.step();
    p.onTick?.(tick, tension, rig, props);
  }
  return { rig, props, capped, ticks };
}

function rampBox(start: Vec3, angleDeg: number, length: number): GroundBox {
  const rot = quatFromAxisAngle(AXIS_X, degToRad(angleDeg));
  return { center: add(start, rotate(rot, vec3(0, -0.25, -length / 2))), halfExtents: vec3(4, 0.25, length / 2), rot, surface: 'road' };
}

// Steady climb of the 25 degree reference slope, from the existing simulation.
function climb(vehicle: VehicleId, forcePerWeight: number) {
  const r = simulate(vehicle, { stiffnessPerKg: STIFFNESS_PER_KG, dampingRatio: DAMPING_RATIO, forcePerWeight }, 0);
  const meanSpeed = r.secondsToTop === null ? 0 : (GOAL_ALONG - START_ALONG) / r.secondsToTop;
  return { ...r, meanSpeed };
}

// The steepest slope (degrees, step 1) the vehicle is pulled up from a stop by the winch alone, with no throttle.
function maxSlope(vehicle: VehicleId, forcePerWeight: number): number {
  let best = 0;
  for (let angle = 10; angle <= 50; angle += 1) {
    const start = vec3(-60, 0, -20);
    const course = withBoxes(testGround, { ground: [rampBox(start, angle, 45)] });
    const rot = quatFromAxisAngle(AXIS_X, degToRad(angle));
    const along = (a: number) => add(start, rotate(rot, vec3(0, 0, -a)));
    const startY = along(6).y;
    let top = false;
    pull({
      vehicle,
      course,
      spawn: { pos: along(6), rot },
      forcePerWeight,
      seconds: 60,
      brake: (tick) => tick < 0,
      anchor: () => () => ({ point: add(along(44), vec3(0, 0.5, 0)), velocity: vec3(0, 0, 0) }),
      onTick: (_tick, _t, rig) => {
        if (rig.vehicle.body.translation().y - startY >= 0.6 * (along(34).y - startY)) top = true;
      },
    });
    if (!top) break;
    best = angle;
  }
  return best;
}

function barrierDrag(vehicle: VehicleId, forcePerWeight: number) {
  const course = withProps(testGround, [{ id: 'barrier-x', kind: 'barrier', pose: { pos: vec3(0, 0, -14), rot: IDENTITY } }]);
  let maxSpeed = 0;
  let reversals = 0;
  let moving = false;
  let away = false;
  let moved = 0;
  let start = vec3(0, 0, 0);
  const { rig } = pull({
    vehicle,
    course,
    spawn: { pos: vec3(0, 0, 0), rot: IDENTITY },
    forcePerWeight,
    seconds: 15,
    brake: true,
    before: (_rig, props) => {
      props.setLocked('barrier-x', false);
      start = props.get('barrier-x')!.body.translation();
    },
    anchor: (_rig, props) => () => {
      const body = props.get('barrier-x')!.body;
      const point = anchorPoint('barrier-x', course, props)!;
      return { point, velocity: body.velocityAtPoint(point) };
    },
    onTick: (_tick, _t, r, props) => {
      const barrier = props.get('barrier-x')!.body;
      const v = barrier.linvel();
      // Toward the vehicle is +Z here.
      const toward = v.z;
      // Speeds after the barrier reaches the bumper are collision bounces, not drag.
      const gap = length(sub(barrier.translation(), add(r.vehicle.body.translation(), rotate(r.vehicle.body.rotation(), r.vehicle.config.winchMount))));
      if (gap > 3) maxSpeed = Math.max(maxSpeed, length(v));
      if (toward > 0.05) moving = true;
      if (moving && toward < -0.05 && !away) {
        reversals++;
        away = true;
      }
      if (toward > 0.05) away = false;
      moved = length(sub(barrier.translation(), start));
    },
  });
  return { maxSpeed, reversals, moved, vehicleCreep: length(rig.vehicle.body.linvel()) };
}

function holeExit(vehicle: VehicleId, forcePerWeight: number, exitDeg: number | null) {
  const depth = 0.8;
  const pitStart = -6;
  const lip = -26;
  const floorY = -depth;
  const ground: GroundBox[] = [
    { center: vec3(0, -0.5, 20), halfExtents: vec3(150, 0.5, 26), rot: IDENTITY, surface: 'road' },
    { center: vec3(0, floorY - 0.5, (pitStart + lip) / 2), halfExtents: vec3(150, 0.5, (pitStart - lip) / 2), rot: IDENTITY, surface: 'road' },
    { center: vec3(0, -0.5, -226), halfExtents: vec3(150, 0.5, 200), rot: IDENTITY, surface: 'road' },
  ];
  if (exitDeg !== null) {
    const run = depth / Math.tan(degToRad(exitDeg));
    ground.push(rampBox(vec3(0, floorY, lip + run), exitDeg, depth / Math.sin(degToRad(exitDeg))));
  }
  const course = deepFreeze({ ...testGround, ground, props: [], pickups: [], coins: [] });
  let seconds: number | null = null;
  pull({
    vehicle,
    course,
    spawn: { pos: vec3(0, floorY, -14), rot: IDENTITY },
    forcePerWeight,
    seconds: 60,
    brake: false,
    anchor: () => () => ({ point: vec3(0, 0.5, lip - 14), velocity: vec3(0, 0, 0) }),
    onTick: (tick, _t, rig) => {
      const p = rig.vehicle.body.translation();
      if (seconds === null && p.y > -0.3 && p.z < lip - 1) seconds = (tick + 1) / TICK_RATE;
    },
  });
  return seconds;
}

function highAnchor(vehicle: VehicleId, forcePerWeight: number, horizontal: number, braked: boolean) {
  let maxPitch = 0;
  let maxTilt = 0;
  let to30: number | null = null;
  pull({
    vehicle,
    course: testGround,
    spawn: { pos: vec3(0, 0, 0), rot: IDENTITY },
    forcePerWeight,
    seconds: 15,
    brake: braked,
    anchor: (rig) => {
      const mountNow = add(rig.vehicle.body.translation(), rotate(rig.vehicle.body.rotation(), rig.vehicle.config.winchMount));
      const point = add(mountNow, vec3(0, 8, -horizontal));
      return () => ({ point, velocity: vec3(0, 0, 0) });
    },
    onTick: (_tick, _t, rig) => {
      const rot = rig.vehicle.body.rotation();
      const forward = rotate(rot, vec3(0, 0, -1));
      const up = rotate(rot, vec3(0, 1, 0));
      maxPitch = Math.max(maxPitch, (Math.asin(Math.max(-1, Math.min(1, forward.y))) * 180) / Math.PI);
      if (to30 === null && maxPitch >= 30) to30 = (_tick + 1) / TICK_RATE;
      maxTilt = Math.max(maxTilt, (Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI);
    },
  });
  return { maxPitch, maxTilt, to30 };
}

test('sweep the tension cap for both vehicles (step 26 W1, B7)', () => {
  const fmt = (n: number | null, d = 2) => (n === null ? 'never' : n.toFixed(d));
  const lines: string[] = [];
  lines.push('F/W   vehicle  cap(kN)  climb25: mean(kN) capped% speed spin  | maxSlope(deg) | barrier: maxSpeed moved reversals | hole ramp25(s) wall(s) | high anchor pitch/tilt (worst of 4,8,12 m, braked and free)');
  for (const forcePerWeight of FORCE_SWEEP) {
    for (const vehicle of ['lodgy', 'rv'] as const) {
      const mass = getVehicleConfig(vehicle).mass;
      const c = climb(vehicle, forcePerWeight);
      const slope = maxSlope(vehicle, forcePerWeight);
      const b = barrierDrag(vehicle, forcePerWeight);
      const holeRamp = holeExit(vehicle, forcePerWeight, 25);
      const holeWall = holeExit(vehicle, forcePerWeight, null);
      let pitch = 0;
      let tilt = 0;
      for (const horizontal of [4, 8, 12]) {
        for (const braked of [true, false]) {
          const h = highAnchor(vehicle, forcePerWeight, horizontal, braked);
          if (process.env.CABLE_DETAIL) console.log(`  high anchor ${vehicle} F/W ${forcePerWeight} ${horizontal} m ${braked ? 'braked' : 'free'}: pitch ${fmt(h.maxPitch, 1)} tilt ${fmt(h.maxTilt, 1)} 30deg at ${fmt(h.to30, 1)} s`);
          pitch = Math.max(pitch, h.maxPitch);
          tilt = Math.max(tilt, h.maxTilt);
        }
      }
      lines.push(
        [
          String(forcePerWeight).padEnd(5), vehicle.padEnd(7), fmt((forcePerWeight * mass * GRAVITY) / 1000, 1).padStart(7),
          `${fmt(c.meanTension / 1000, 1)} ${fmt(c.cappedShare * 100, 0)}% ${fmt(c.meanSpeed)} ${fmt(c.maxSpin)}`.padStart(34),
          `| ${slope}`.padStart(6), `| ${fmt(b.maxSpeed)} ${fmt(b.moved, 1)} ${b.reversals}`.padEnd(20),
          `| ${fmt(holeRamp, 1)} ${fmt(holeWall, 1)}`.padEnd(14), `| ${fmt(pitch, 1)}/${fmt(tilt, 1)}`,
        ].join(' '),
      );
    }
  }
  console.log(lines.join('\n'));
}, 3_600_000);

test('fine sweep of the braked high anchor between the swept caps (step 26 B7)', () => {
  const lines = ['F/W    vehicle  braked pitch at 4 m / 8 m / 12 m (degrees), worst tilt'];
  for (let f = 0.6; f <= 0.801; f += 0.025) {
    for (const vehicle of ['lodgy', 'rv'] as const) {
      const hs = [4, 8, 12].map((h) => highAnchor(vehicle, f, h, true));
      lines.push(`${f.toFixed(3)} ${vehicle.padEnd(7)} ${hs.map((h) => h.maxPitch.toFixed(1)).join(' / ')}  tilt ${Math.max(...hs.map((h) => h.maxTilt)).toFixed(1)}`);
    }
  }
  console.log(lines.join('\n'));
}, 3_600_000);
