import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, add, rotate, scale, vec3, yawOf, type Quat, type Vec3, type VehicleConfig } from '@lodgy/shared';

export const FIRST_PERSON_FOV = 75;
// How far along the aim the camera looks.
const TARGET_DISTANCE = 30;
// Keeps the seated eye below the top face of the vehicle box.
const TOP_MARGIN = 0.05;

// The prototype is on for ?fp or localStorage lodgy.fp = "1".
export function firstPersonEnabled(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).has('fp') || stored === '1';
}

function aimDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return vec3(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
}

export function onFootPose(feet: Vec3, eyeHeight: number, yaw: number, pitch: number): { position: Vec3; target: Vec3 } {
  const position = vec3(feet.x, feet.y + eyeHeight, feet.z);
  return { position, target: add(position, scale(aimDirection(yaw, pitch), TARGET_DISTANCE)) };
}

// The eye at the seat's head position; the view turns by the mouse offset from the vehicle's yaw.
export function seatedPose(
  vehiclePos: Vec3,
  vehicleRot: Quat,
  config: VehicleConfig,
  seatId: string,
  aimYaw: number,
  aimPitch: number,
): { position: Vec3; target: Vec3 } | null {
  const seat = config.seats.find((candidate) => candidate.id === seatId);
  if (!seat) return null;
  const local = vec3(seat.pos.x, Math.min(seat.pos.y + PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2, config.halfExtents.y - TOP_MARGIN), seat.pos.z);
  const position = add(vehiclePos, rotate(vehicleRot, local));
  return { position, target: add(position, scale(aimDirection(yawOf(vehicleRot) + aimYaw, aimPitch), TARGET_DISTANCE)) };
}
