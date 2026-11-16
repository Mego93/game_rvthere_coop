import { aimRay, isCrouchedStance, type PlayerSnapshot, type UseContext, type VehicleConfig, type VehicleState } from '@lodgy/shared';

// The context rule J6 evaluates for the local player; the overlay and the touch view must build it the same way.
export function buildUseContext(
  local: PlayerSnapshot,
  players: PlayerSnapshot[],
  vehicle: VehicleState,
  config: VehicleConfig,
  aim: { yaw: number; pitch: number },
): UseContext {
  const { origin, dir } = aimRay(local.pos, aim.yaw, aim.pitch, isCrouchedStance(local.stance));
  const others = players
    .filter((other) => other.playerId !== local.playerId)
    .map((other) => ({ id: other.playerId, feet: other.pos, health: other.health, downed: other.downed, seated: other.seat !== null }));
  return {
    self: { id: local.playerId, feet: local.pos, eye: origin, aim: dir, health: local.health },
    vehicle: { pos: vehicle.pos, rot: vehicle.rot, half: config.halfExtents, fuel: vehicle.fuel, health: vehicle.health },
    players: others,
  };
}
