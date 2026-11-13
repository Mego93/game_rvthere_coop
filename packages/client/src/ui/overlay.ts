import {
  chooseSeat,
  dot,
  resolveInteract,
  rotate,
  vec3,
  type LobbyMessage,
  type PlayerSnapshot,
  type VehicleConfig,
  type Vec3,
  type VehicleState,
} from '@lodgy/shared';

const FORWARD = vec3(0, 0, -1);
const fixed = (value: number, digits = 1) => value.toFixed(digits).padStart(7);

export interface OverlayData {
  lobby: LobbyMessage;
  config: VehicleConfig;
  tick: number;
  fps: number;
  // Null until the first snapshot arrives.
  vehicle: VehicleState | null;
  players: PlayerSnapshot[];
  localId: string;
  // The drawn predicted position of the local player, or null while prediction is off.
  predicted: Vec3 | null;
  // The local player's position in the latest snapshot (not interpolated), or null if absent.
  server: Vec3 | null;
}

// What pressing interact would do for the local player, or null if nothing.
export function interactHint(
  config: VehicleConfig,
  vehicle: VehicleState,
  local: PlayerSnapshot,
  players: PlayerSnapshot[],
): string | null {
  const taken = new Set<string>();
  for (const player of players) if (player.seat !== null) taken.add(player.seat);
  const seatChoice = local.seat === null ? chooseSeat(config, vehicle.pos, vehicle.rot, local.pos, taken) : null;
  const action = resolveInteract({ seat: local.seat, seatChoice });
  if (action?.kind === 'exitSeat') return 'E to leave the seat';
  if (action?.kind === 'board') return 'E to board';
  return null;
}

// The debug text shown until the real HUD exists.
export function overlayText({ lobby, config, tick, fps, vehicle, players, localId, predicted, server }: OverlayData): string {
  const names = lobby.players.map((player) => {
    const snapshot = players.find((candidate) => candidate.playerId === player.playerId);
    return snapshot ? `${player.name} (${snapshot.seat ?? 'on foot'})` : player.name;
  });
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
    // These lines must not start with "pos": the e2e test reads the vehicle's position from the "pos" line.
    if (predicted) {
      lines.push(`you      ${fixed(predicted.x)} ${fixed(predicted.y)} ${fixed(predicted.z)}   (predicted)`);
      if (server) lines.push(`server   ${fixed(server.x)} ${fixed(server.y)} ${fixed(server.z)}`);
    }
    const local = players.find((player) => player.playerId === localId);
    const hint = local ? interactHint(config, vehicle, local, players) : null;
    if (hint) lines.push(`hint     ${hint}`);
  } else {
    lines.push('waiting for the server…');
  }
  lines.push('', 'WASD move   Space jump (brake when driving)   E board or leave   click to look');
  return lines.join('\n');
}
