import { dot, rotate, vec3, type LobbyMessage, type VehicleState } from '@lodgy/shared';

const FORWARD = vec3(0, 0, -1);
const fixed = (value: number, digits = 1) => value.toFixed(digits).padStart(7);

export interface OverlayData {
  lobby: LobbyMessage;
  tick: number;
  fps: number;
  // Null until the first snapshot arrives.
  vehicle: VehicleState | null;
}

// The debug text shown until the real HUD exists.
export function overlayText({ lobby, tick, fps, vehicle }: OverlayData): string {
  // Until seats exist (step 3) the first player in the list drives.
  const names = lobby.players.map((player, index) => (index === 0 ? `${player.name} (drives)` : player.name));
  const lines = [
    `room     ${lobby.room}   vehicle ${lobby.vehicleId}   course ${lobby.courseId}`,
    `players  ${names.join(', ')}`,
    `tick     ${tick}   fps ${Math.round(fps)}`,
  ];
  if (vehicle) {
    const speed = dot(vehicle.linvel, rotate(vehicle.rot, FORWARD));
    lines.push(
      `speed    ${fixed(speed * 3.6)} km/h`,
      `pos      ${fixed(vehicle.pos.x)} ${fixed(vehicle.pos.y)} ${fixed(vehicle.pos.z)}`,
      `throttle ${fixed(vehicle.throttle, 2)}   steer ${fixed(vehicle.steer, 2)}`,
    );
  } else {
    lines.push('waiting for the server…');
  }
  lines.push('', 'WASD drive   Space brake');
  return lines.join('\n');
}
