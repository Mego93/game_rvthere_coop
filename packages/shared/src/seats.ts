import { BOARD_RANGE, DRIVER_DOOR_RANGE, SEAT_EXIT_DISTANCE } from './constants';
import { AXIS_Y, add, quatFromAxisAngle, rotate, sub, vec3, yawOf, type Quat, type Vec3 } from './math';
import type { SeatConfig, VehicleConfig } from './vehicles';

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

// A point given in the vehicle yaw frame (heading only, so a rolled vehicle does not tip it), at ground level.
function inYawFrame(config: VehicleConfig, vehiclePos: Vec3, vehicleRot: Quat, x: number, z: number): Vec3 {
  const at = add(vehiclePos, rotate(quatFromAxisAngle(AXIS_Y, yawOf(vehicleRot)), vec3(x, 0, z)));
  return vec3(at.x, vehiclePos.y - config.rideHeight, at.z);
}

export function seatDoorPoint(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): Vec3 {
  return inYawFrame(config, vehiclePos, vehicleRot, seat.side * config.halfExtents.x, seat.pos.z);
}

export function exitPoints(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): [Vec3, Vec3] {
  const reach = config.halfExtents.x + SEAT_EXIT_DISTANCE;
  return [
    inYawFrame(config, vehiclePos, vehicleRot, seat.side * reach, seat.pos.z),
    inYawFrame(config, vehiclePos, vehicleRot, -seat.side * reach, seat.pos.z),
  ];
}

export function distanceToBox(point: Vec3, halfExtents: Vec3, pos: Vec3, rot: Quat): number {
  const local = rotate(conjugate(rot), sub(point, pos));
  return Math.hypot(
    Math.max(Math.abs(local.x) - halfExtents.x, 0),
    Math.max(Math.abs(local.y) - halfExtents.y, 0),
    Math.max(Math.abs(local.z) - halfExtents.z, 0),
  );
}

export function chooseSeat(
  config: VehicleConfig,
  vehiclePos: Vec3,
  vehicleRot: Quat,
  playerPos: Vec3,
  taken: ReadonlySet<string>,
): string | null {
  if (distanceToBox(playerPos, config.halfExtents, vehiclePos, vehicleRot) > BOARD_RANGE) return null;
  const horizontal = (seat: SeatConfig): number => {
    const door = seatDoorPoint(config, seat, vehiclePos, vehicleRot);
    return Math.hypot(door.x - playerPos.x, door.z - playerPos.z);
  };
  const driver = config.seats[0];
  if (driver && !taken.has(driver.id) && horizontal(driver) <= DRIVER_DOOR_RANGE) return driver.id;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const seat of config.seats) {
    if (taken.has(seat.id)) continue;
    const distance = horizontal(seat);
    if (distance < bestDistance) {
      best = seat.id;
      bestDistance = distance;
    }
  }
  return best;
}
