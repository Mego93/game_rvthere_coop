import { TICK_RATE } from '../constants';
import type { Vec3 } from '../math';
import { exitPoints } from '../seats';
import { NEUTRAL_INPUT, type InputFields } from '../protocol';
import type { World } from '../world';

const press = (fields: Partial<InputFields>): InputFields => ({ ...NEUTRAL_INPUT, ...fields });

const playerOf = (world: World, id: string) => world.snapshot().players.find((p) => p.playerId === id)!;
const propAt = (world: World, id: string): Vec3 => world.snapshot().props.find((p) => p.id === id)!.pos;

// The yaw whose forward walk points from (x, z) toward (tx, tz).
export const yawToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

// Presses interact once (the key edge), facing `at`.
export function pressInteract(world: World, id: string, at: Vec3): void {
  const feet = playerOf(world, id).pos;
  const yaw = yawToward(feet.x, feet.z, at.x, at.z);
  world.step(new Map([[id, press({ interact: true, yaw })]]));
  world.step(new Map([[id, press({ yaw })]]));
}

const speedOf = (world: World): number => {
  const v = world.debugBody('vehicle')!.linvel();
  return Math.hypot(v.x, v.y, v.z);
};

// The seated driver brakes with the reverse key until the vehicle stands, then leaves it.
export function exitVehicle(world: World, id: string): void {
  for (let i = 0; i < 20 * TICK_RATE && speedOf(world) > 0.05; i++) world.step(new Map([[id, press({ moveY: speedOf(world) > 0.5 ? -1 : 0 })]]));
  world.step(new Map([[id, press({ interact: true })]]));
  world.step(new Map());
}

// Walks a player on foot toward a point; true when within `tolerance` m.
export function walkTo(world: World, id: string, to: { x: number; z: number }, tolerance = 0.4, maxSeconds = 60): boolean {
  for (let i = 0; i < maxSeconds * TICK_RATE; i++) {
    const feet = playerOf(world, id).pos;
    if (Math.hypot(to.x - feet.x, to.z - feet.z) <= tolerance) return true;
    world.step(new Map([[id, press({ moveY: 1, yaw: yawToward(feet.x, feet.z, to.x, to.z) })]]));
  }
  return false;
}

// Walks to the vehicle's driver door and boards.
export function boardVehicle(world: World, id: string): boolean {
  const body = world.debugBody('vehicle')!;
  const config = world.vehicleConfig;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [outside] = exitPoints(config, config.seats[0]!, body.translation(), body.rotation());
    walkTo(world, id, { x: outside.x, z: outside.z }, 0.4, 30);
    pressInteract(world, id, body.translation());
    if (playerOf(world, id).seat === 'driver') return true;
  }
  return false;
}

// Pushes a prop along `direction` (a unit vector on the ground), standing behind it, until it has moved `distance` m or the time is up. Returns the distance moved.
export function pushProp(world: World, id: string, propId: string, direction: { x: number; z: number }, distance: number, maxSeconds = 30): number {
  const start = propAt(world, propId);
  const stand = { x: start.x - direction.x * 1.3, z: start.z - direction.z * 1.3 };
  walkTo(world, id, stand, 0.3);
  const yaw = yawToward(0, 0, direction.x, direction.z);
  for (let i = 0; i < maxSeconds * TICK_RATE; i++) {
    const now = propAt(world, propId);
    if (Math.hypot(now.x - start.x, now.z - start.z) >= distance) break;
    world.step(new Map([[id, press({ moveY: 1, yaw })]]));
  }
  const end = propAt(world, propId);
  return Math.hypot(end.x - start.x, end.z - start.z);
}

// Pushes a barrier forward out of its row, then to the side, so a gap opens in the row. Returns where it ended.
export function pushAside(world: World, id: string, propId: string, forward: { x: number; z: number }, side: { x: number; z: number }, ahead: number, across: number): Vec3 {
  pushProp(world, id, propId, forward, ahead);
  const feet = playerOf(world, id).pos;
  const barrier = propAt(world, propId);
  // Step back and around so the walk to the far side does not shove the barrier.
  walkTo(world, id, { x: feet.x - side.x * 2.5, z: feet.z - side.z * 2.5 });
  walkTo(world, id, { x: barrier.x - side.x * 2.5, z: barrier.z - side.z * 2.5 });
  pushProp(world, id, propId, side, across);
  return propAt(world, propId);
}
