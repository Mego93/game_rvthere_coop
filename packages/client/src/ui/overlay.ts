import {
  dot,
  finalTime,
  interactCandidates,
  ITEM_KINDS,
  resolveInteract,
  rotate,
  splitCandidates,
  stars,
  stopUsable,
  useTarget,
  vec3,
  type CableSnapshot,
  type InteractAction,
  type LobbyMessage,
  type Placed,
  type PlayerSnapshot,
  type PropSnapshot,
  type ServiceStop,
  type VehicleConfig,
  type Vec3,
  type VehicleState,
} from '@lodgy/shared';
import type { RunStatus } from '../net/snapshotBuffer';
import { buildUseContext } from './useContext';

const FORWARD = vec3(0, 0, -1);
const percent = (fraction: number) => `${Math.floor(fraction * 100 + 1e-9)}%`;
// Floors to tenths, so the display never runs ahead of the clock.
const clock = (seconds: number) => {
  const tenths = Math.floor(seconds * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
};
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
  // The run's clock and counters, or null before the first snapshot.
  status: RunStatus | null;
  // The course's service stops.
  stops: readonly ServiceStop[];
  // The course's target time, for the stars.
  targetTime: number;
  // True on a touch device, which changes the control line.
  touch?: boolean;
}

const STOWED: CableSnapshot = { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 };

// What pressing interact would do for the local player, or null if nothing; the client opens the shop menu on the same resolution.
export function interactAction(
  config: VehicleConfig,
  vehicle: VehicleState,
  local: PlayerSnapshot,
  players: PlayerSnapshot[],
  yaw: number,
  pitch: number,
  props: readonly PropSnapshot[],
  cable: CableSnapshot | null,
  anchors: readonly Placed[],
  stops: readonly ServiceStop[] = [],
): InteractAction | null {
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
    items: props.filter((prop) => Object.hasOwn(ITEM_KINDS, prop.kind)),
    freeSlot: local.inventory.includes(null),
    heldProps,
    cable: cable ?? STOWED,
    anchors,
    stops: stops.map((stop) => ({
      id: stop.id,
      kind: stop.kind,
      operatePoint: stop.operatePoint,
      shopCounter: stop.shopCounter,
      usable: stopUsable(stop, vehicle.pos, vehicle.fuel, vehicle.health),
    })),
  });
  return resolveInteract({ seat: local.seat, hands: local.hands, holdsHook: local.hands === 'hook', ...splitCandidates(found) });
}

// What pressing interact would do for the local player, as words, or null if nothing.
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
  stops: readonly ServiceStop[] = [],
): string | null {
  const action = interactAction(config, vehicle, local, players, yaw, pitch, props, cable, anchors, stops);
  if (action?.kind === 'exitSeat') return 'E to leave the seat';
  if (action?.kind === 'throw') return 'E to throw';
  if (action?.kind === 'board') return 'E to board';
  if (action?.kind === 'pickUp') return 'E to pick up';
  if (action?.kind === 'pickUpItem') {
    const kind = props.find((prop) => prop.id === action.itemId)?.kind;
    return `E to pick up the ${kind ?? 'item'}`;
  }
  if (action?.kind === 'attachHook') return 'E to attach the hook';
  if (action?.kind === 'dropHook') return 'E to drop the hook';
  if (action?.kind === 'takeHook') return 'E to take the hook';
  if (action?.kind === 'detachHook') return 'E to unhook';
  if (action?.kind === 'releaseHook') return 'E to release the hook';
  if (action?.kind === 'operate') return stops.find((stop) => stop.id === action.stopId)?.kind === 'fuel' ? 'Hold E to refuel' : 'Hold E to repair';
  if (action?.kind === 'shop') return 'E to shop';
  return null;
}

// The debug text shown until the real HUD exists.
export function overlayText({ lobby, config, tick, fps, vehicle, players, localId, predicted, server, aim, propPoses, cable, anchors, status, stops, targetTime, touch }: OverlayData): string {
  const names = lobby.players.map((player) => {
    const snapshot = players.find((candidate) => candidate.playerId === player.playerId);
    return snapshot ? `${player.name} (${snapshot.seat ?? 'on foot'})` : player.name;
  });
  const lines = [
    `room     ${lobby.room}   vehicle ${lobby.vehicleId}   course ${lobby.courseId}`,
    `players  ${names.join(', ')}`,
    `tick     ${tick}   fps ${Math.round(fps)}`,
  ];
  if (status) {
    lines.push(`time     ${clock(status.elapsed)}   cp ${status.checkpoint + 1}/${status.checkpointCount}   restarts ${status.restarts}   respawns ${status.respawns}`);
    lines.push(`coins    ${status.wallet}   ${status.coinsCollected}/${status.coinsTotal}`);
    if (status.won) {
      lines.push('FINISHED');
      const final = finalTime({ elapsed: status.elapsed, restarts: status.restarts, respawns: status.respawns, wallet: status.wallet });
      const earned = stars({ restarts: status.restarts, finalTime: final, targetTime, coinsCollected: status.coinsCollected, coinsTotal: status.coinsTotal, assisted: false });
      lines.push(`final    ${clock(final)}   stars ${earned.map((star) => (star ? '*' : '-')).join('')}`);
    }
  }
  if (vehicle) {
    const speed = dot(vehicle.linvel, rotate(vehicle.rot, FORWARD));
    lines.push(
      `speed    ${fixed(speed * 3.6)} km/h`,
      `pos      ${fixed(vehicle.pos.x)} ${fixed(vehicle.pos.y)} ${fixed(vehicle.pos.z)}`,
      `throttle ${fixed(vehicle.throttle, 2)}   steer ${fixed(vehicle.steer, 2)}`,
      `fuel     ${percent(vehicle.fuel)}   health ${percent(vehicle.health)}`,
    );
    // These lines must not start with "pos": the e2e test reads the vehicle's position from the "pos" line.
    if (predicted) {
      lines.push(`you      ${fixed(predicted.x)} ${fixed(predicted.y)} ${fixed(predicted.z)}   (predicted)`);
      if (server) lines.push(`server   ${fixed(server.x)} ${fixed(server.y)} ${fixed(server.z)}`);
    }
    const local = players.find((player) => player.playerId === localId);
    const hint = local ? interactHint(config, vehicle, local, players, aim.yaw, aim.pitch, propPoses, cable, anchors, stops) : null;
    if (hint) lines.push(`hint     ${hint}`);
    if (local) {
      lines.push(`slots    ${local.inventory.map((kind, index) => (index === local.slot ? `[${kind ?? '-'}]` : (kind ?? '-'))).join(' ')}`);
      lines.push(`health   ${local.health}`);
      if (local.downed !== null) lines.push(`DOWNED   ${Math.ceil(local.downed - 1e-9)}s`);
      if (local.hold) lines.push(`hold     ${percent(local.hold.progress)}`);
      const selected = local.inventory[local.slot];
      const context = buildUseContext(local, players, vehicle, config, aim);
      const others = context.players;
      const target = local.seat === null && local.downed === null ? useTarget(selected ?? null, context) : null;
      if (target) {
        if (selected === 'jerrycan') lines.push('hint     Hold F to refuel');
        else if (selected === 'toolbox') lines.push('hint     Hold F to repair');
        else if (selected === 'healthKit') {
          const mate = others.find((other) => other.id === target);
          if (!mate) lines.push('hint     Hold F to heal yourself');
          else {
            const name = lobby.players.find((info) => info.playerId === mate.id)?.name ?? mate.id;
            lines.push(`hint     Hold F to ${mate.downed !== null ? 'revive' : 'heal'} ${name}`);
          }
        }
      }
    }
  } else {
    lines.push('waiting for the server…');
  }
  lines.push(`props    ${propPoses.length}`);
  if (cable) lines.push(`cable    ${cable.state} ${cable.length.toFixed(1)} m`);
  lines.push('', touch ? 'joystick move   drag right half to look   buttons act' : 'WASD move   Space jump (brake when driving)   E board or leave   Esc menu   click to look');
  return lines.join('\n');
}
