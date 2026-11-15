import {
  CHASSIS_FRICTION,
  GRAVITY,
  MAX_SUSPENSION_FORCE_PER_WEIGHT,
  SURFACES,
  TICK_DT,
  VEHICLE_IMPACT_DAMAGE,
  VEHICLE_IMPACT_SPEED,
  VEHICLE_JOLT_FLOOR,
  VEHICLE_STOPPED_SPEED,
  VEHICLE_UPSIDE_DOWN_DRAIN,
  type Surface,
} from './constants';
import { GROUP_WORLD, groups } from './groups';
import { AXIS_Y, IDENTITY, add, clamp, dot, rotate, scale, vec3, type Pose, type Quat, type Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import type { VehicleConfig } from './vehicles';

export interface VehicleControls {
  // -1 (reverse) to 1 (forward).
  throttle: number;
  // -1 (left) to 1 (right).
  steer: number;
  brake: boolean;
}

export interface VehicleState {
  pos: Vec3;
  rot: Quat;
  linvel: Vec3;
  throttle: number;
  steer: number;
  // Fractions of a full tank and of full health.
  fuel: number;
  health: number;
  // Set by the world while a seated player could reset the vehicle; absent means false.
  resetReady?: boolean;
}

export interface Vehicle {
  readonly config: VehicleConfig;
  readonly body: RigidBody;
  readonly chassisHandle: number;
  // Sets the wheel forces for this tick. Call once per tick, before the physics world steps.
  step(controls: VehicleControls): void;
  state(): VehicleState;
  // Speed along the vehicle's forward (-Z) axis; negative when reversing.
  forwardSpeed(): number;
  // The surface under each wheel (front-left, front-right, rear-left, rear-right), or null if airborne.
  wheelSurfaces(): (Surface | null)[];
  // Each wheel's friction slip as last set by step().
  wheelFrictionSlips(): number[];
  fuel(): number;
  health(): number;
  addFuel(amount: number): void;
  repair(amount: number): void;
  // Placed on the ground pose (raised by the ride height) with zero velocities; impact tracking restarts.
  resetTo(pose: Pose, fuel: number, health: number): void;
  // Impact and upside-down damage. Call once per tick, after the physics world steps.
  // Returns the impact speed that caused damage this tick (above the threshold), or 0.
  afterPhysics(): number;
}

const WHEEL_COUNT = 4;
const FRONT_WHEELS = 2;
const FORWARD = vec3(0, 0, -1);

export function createVehicle(
  rapier: Rapier,
  world: RapierWorld,
  config: VehicleConfig,
  // A pose on the ground; the chassis centre is placed above it by the ride height.
  spawn: Pose,
  surfaceOf: (colliderHandle: number) => Surface | null,
  options: { gripScale?: number } = {},
): Vehicle {
  const gripScale = options.gripScale ?? 1;
  const h = config.halfExtents;
  const pos = add(spawn.pos, rotate(spawn.rot, scale(AXIS_Y, config.rideHeight)));
  const inertia = {
    x: (config.mass / 3) * (h.y * h.y + h.z * h.z),
    y: (config.mass / 3) * (h.x * h.x + h.z * h.z),
    z: (config.mass / 3) * (h.x * h.x + h.y * h.y),
  };
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(spawn.rot)
      .setCanSleep(false)
      .setAdditionalMassProperties(config.mass, { x: 0, y: config.comY, z: 0 }, inertia, IDENTITY),
  );
  const chassis = world.createCollider(
    rapier.ColliderDesc.cuboid(h.x, h.y, h.z)
      .setDensity(0)
      .setFriction(CHASSIS_FRICTION)
      .setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)),
    body,
  );

  const controller = world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  // Order: front-left, front-right, rear-left, rear-right. Front is -Z, left is -X.
  const corners: [number, number][] = [
    [-config.wheelX, -config.wheelZ],
    [config.wheelX, -config.wheelZ],
    [-config.wheelX, config.wheelZ],
    [config.wheelX, config.wheelZ],
  ];
  for (const [x, z] of corners) {
    controller.addWheel(
      { x, y: config.wheelY, z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      config.suspensionRest,
      config.wheelRadius,
    );
  }
  for (let i = 0; i < WHEEL_COUNT; i++) {
    controller.setWheelSuspensionStiffness(i, config.suspensionStiffness);
    controller.setWheelSuspensionCompression(i, config.suspensionCompression);
    controller.setWheelSuspensionRelaxation(i, config.suspensionRelaxation);
    controller.setWheelMaxSuspensionTravel(i, config.suspensionTravel);
    controller.setWheelMaxSuspensionForce(i, config.mass * GRAVITY * MAX_SUSPENSION_FORCE_PER_WEIGHT);
    controller.setWheelSideFrictionStiffness(i, config.sideGrip);
  }

  let throttle = 0;
  let steer = 0;
  let fuel = 1;
  let health = 1;
  let previousVelocity: Vec3 = { ...body.linvel() };
  let impact = 0;

  const forwardSpeed = () => dot(body.linvel(), rotate(body.rotation(), FORWARD));

  const wheelSurfaces = () =>
    Array.from({ length: WHEEL_COUNT }, (_, i) => {
      const collider = controller.wheelIsInContact(i) ? controller.wheelGroundObject(i) : null;
      return collider ? surfaceOf(collider.handle) : null;
    });

  return {
    config,
    body,
    chassisHandle: chassis.handle,
    forwardSpeed,
    wheelSurfaces,
    wheelFrictionSlips: () => Array.from({ length: WHEEL_COUNT }, (_, i) => controller.wheelFrictionSlip(i) ?? 0),
    step(controls) {
      throttle = clamp(controls.throttle, -1, 1);
      steer = clamp(controls.steer, -1, 1);
      const speed = forwardSpeed();
      const fade = throttle >= 0 ? 1 - speed / config.maxSpeed : 1 + speed / config.reverseSpeed;
      const drive = fuel > 0 ? throttle * config.engineForce * clamp(fade, 0, 1) : 0;
      fuel = Math.max(0, fuel - Math.abs(throttle) * config.fuelBurn * TICK_DT);
      const moving = Math.abs(speed) > VEHICLE_STOPPED_SPEED;
      const surfaces = wheelSurfaces();
      for (let i = 0; i < WHEEL_COUNT; i++) {
        const surface = SURFACES[surfaces[i] ?? 'road'];
        const resistance = surface.rolling * config.mass * GRAVITY + (controls.brake ? config.brakeForce : 0);
        // The controller ignores the brake on a driven wheel, so while driving, resistance is subtracted from the drive force.
        const held = drive === 0 || controls.brake || (!moving && Math.abs(drive) <= resistance);
        const net = drive - (moving ? Math.sign(speed) : Math.sign(drive)) * resistance;
        controller.setWheelFrictionSlip(i, config.grip * surface.grip * gripScale);
        // With the axle along -X, a negative engine force drives toward -Z.
        controller.setWheelEngineForce(i, held ? 0 : -net / WHEEL_COUNT);
        // The controller takes the brake as an impulse per step.
        controller.setWheelBrake(i, held ? (resistance * TICK_DT) / WHEEL_COUNT : 0);
        // A positive steering angle turns left, so right-positive input is negated.
        if (i < FRONT_WHEELS) controller.setWheelSteering(i, -steer * config.maxSteer);
      }
      // Wheel rays ignore players.
      controller.updateVehicle(TICK_DT, undefined, groups(GROUP_WORLD, GROUP_WORLD));
    },
    fuel: () => fuel,
    health: () => health,
    addFuel(amount) {
      fuel = clamp(fuel + amount, 0, 1);
    },
    repair(amount) {
      health = clamp(health + amount, 0, 1);
    },
    resetTo(pose, newFuel, newHealth) {
      const at = add(pose.pos, rotate(pose.rot, scale(AXIS_Y, config.rideHeight)));
      body.setTranslation(at, true);
      body.setRotation(pose.rot, true);
      body.setLinvel(vec3(0, 0, 0), true);
      body.setAngvel(vec3(0, 0, 0), true);
      fuel = clamp(newFuel, 0, 1);
      health = clamp(newHealth, 0, 1);
      previousVelocity = vec3(0, 0, 0);
      impact = 0;
    },
    afterPhysics() {
      const v = body.linvel();
      const jolt = Math.hypot(v.x - previousVelocity.x, v.y - previousVelocity.y + GRAVITY * TICK_DT, v.z - previousVelocity.z);
      previousVelocity = { x: v.x, y: v.y, z: v.z };
      let damaging = 0;
      if (jolt > VEHICLE_JOLT_FLOOR) impact += jolt;
      else {
        if (impact > VEHICLE_IMPACT_SPEED) {
          health -= (impact - VEHICLE_IMPACT_SPEED) * VEHICLE_IMPACT_DAMAGE;
          damaging = impact;
        }
        impact = 0;
      }
      if (rotate(body.rotation(), AXIS_Y).y < 0) health -= VEHICLE_UPSIDE_DOWN_DRAIN * TICK_DT;
      health = clamp(health, 0, 1);
      return damaging;
    },
    state() {
      const t = body.translation();
      const r = body.rotation();
      const v = body.linvel();
      return {
        pos: { x: t.x, y: t.y, z: t.z },
        rot: { x: r.x, y: r.y, z: r.z, w: r.w },
        linvel: { x: v.x, y: v.y, z: v.z },
        throttle,
        steer,
        fuel,
        health,
      };
    },
  };
}
