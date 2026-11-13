import {
  dot,
  interactCandidates,
  resolveInteract,
  rotate,
  splitCandidates,
  vec3,
  type CableSnapshot,
  type LobbyMessage,
  type Placed,
  type PlayerSnapshot,
  type PropSnapshot,
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
  // The local mouse look, which is what interact aims with.
  aim: { yaw: number; pitch: number };
  // The props in the sampled world.
  propPoses: PropSnapshot[];
  // The winch cable in the sampled world, or null before the first snapshot.
  cable: CableSnapshot | null;
  // The course's static anchors.
  anchors: readonly Placed[];
}

const STOWED: CableSnapshot = { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 };

// What pressing interact would do for the local player, or null if nothing.
export function interactHint(
  config: VehicleConfig,
  vehicle: VehicleState,
  local: PlayerSnapshot,
  players: PlayerSnapshot[],
  yaw: number,
  pitch: number,
  props: readonly PropSnapshot[],
  cable: CableSnapshot | null,
  anchors: readonly Placed[],
): string | null {
  const takenSeats = new Set<string>();
  const heldProps = new Set<string>();
  for (const player of players) {
    if (player.seat !== null) takenSeats.add(player.seat);
    if (player.hands !== null && player.hands !== 'hook') heldProps.add(player.hands);
  }
  const found = interactCandidates({
    config,
    vehiclePos: vehicle.pos,
    vehicleRot: vehicle.rot,
    feet: local.pos,
    yaw,
    pitch,
    seat: local.seat,
    hands: local.hands,
    takenSeats,
    props,
    heldProps,
    cable: cable ?? STOWED,
    anchors,
  });
  const action = resolveInteract({ seat: local.seat, hands: local.hands, holdsHook: local.hands === 'hook', ...splitCandidates(found) });
  if (action?.kind === 'exitSeat') return 'E to leave the seat';
  if (action?.kind === 'throw') return 'E to throw';
  if (action?.kind === 'board') return 'E to board';
  if (action?.kind === 'pickUp') return 'E to pick up';
  if (action?.kind === 'attachHook') return 'E to attach the hook';
  if (action?.kind === 'dropHook') return 'E to drop the hook';
  if (action?.kind === 'takeHook') return 'E to take the hook';
  if (action?.kind === 'detachHook') return 'E to unhook';
  if (action?.kind === 'releaseHook') return 'E to release the hook';
  return null;
}

// The debug text shown until the real HUD exists.
export function overlayText({ lobby, config, tick, fps, vehicle, players, localId, predicted, server, aim, propPoses, cable, anchors }: OverlayData): string {
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
    const hint = local ? interactHint(config, vehicle, local, players, aim.yaw, aim.pitch, propPoses, cable, anchors) : null;
    if (hint) lines.push(`hint     ${hint}`);
  } else {
    lines.push('waiting for the server…');
  }
  lines.push(`props    ${propPoses.length}`);
  lines.push('', 'WASD move   Space jump (brake when driving)   E board or leave   click to look');
  return lines.join('\n');
}
