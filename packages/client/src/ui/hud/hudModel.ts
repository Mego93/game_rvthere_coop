import { FINAL_RESTART_PENALTY, PLAYER_MAX_HEALTH, clamp, yawOf, type Box, type Checkpoint, type Vec3 } from '@lodgy/shared';
import { clock, interactHint, useHint, type OverlayData } from '../overlay';
import { bearingTo, compassLabel, compassTarget, edgeSide, headingOffset, markerPosition } from './compass';
import { LOW_FRACTION, MARKER_HEIGHT } from './constants';
import { ITEM_LABELS } from './itemLabels';
import { seatLabel } from './seatLabels';
import { touchWording } from './touchWording';

export interface HudModel {
  heading: number;
  compass: { marker: number | null; label: string; side: -1 | 0 | 1 };
  vehicle: { fuel: number; health: number; fuelLow: boolean; healthLow: boolean } | null;
  timer: string;
  wallet: number;
  ownHealth: number;
  ownSeat: { id: string; label: string } | null;
  slots: { kind: string | null; label: string | null; selected: boolean }[];
  prompt: string | null;
  canReset: boolean;
  hold: number | null;
  downedSelf: number | null;
  downedOthers: { id: string; name: string; pos: Vec3; seconds: number }[];
  mapEntities: {
    id: string;
    kind: 'vehicle' | 'self' | 'player' | 'stop' | 'checkpoint';
    x: number;
    z: number;
    reached?: boolean;
    stopKind?: 'fuel' | 'garage';
    yaw?: number;
  }[];
}

export const ownHealthFraction = (health: number): number => (Number.isFinite(health) ? clamp(health / PLAYER_MAX_HEALTH, 0, 1) : 0);

const RESET_HINT = `Hold X to reset (${FINAL_RESTART_PENALTY} s penalty)`;

const seconds = (left: number) => Math.ceil(left - 1e-9);

export function buildHudModel(data: OverlayData, course: { checkpoints: readonly Checkpoint[]; finish: Box }): HudModel {
  const { lobby, config, vehicle, players, localId, predicted, aim, propPoses, cable, anchors, status, stops } = data;
  const local = players.find((player) => player.playerId === localId);
  const seated = !!local && local.seat !== null;
  const ownPos = local ? (predicted ?? local.pos) : null;
  const pos = vehicle && (seated || !ownPos) ? vehicle.pos : ownPos;
  const heading = vehicle && seated ? yawOf(vehicle.rot) : aim.yaw;

  const target = status ? compassTarget(course.checkpoints, course.finish, status.checkpoint, status.won) : null;
  let compass: HudModel['compass'] = { marker: null, label: '', side: 0 };
  if (target && pos && vehicle) {
    const offset = headingOffset(heading, bearingTo(pos, target));
    compass = { marker: markerPosition(offset), label: compassLabel(Math.hypot(target.x - pos.x, target.z - pos.z)), side: edgeSide(offset) };
  }

  const slots: HudModel['slots'] = [0, 1, 2].map((index) => {
    const kind = local?.inventory[index] ?? null;
    return { kind, label: kind ? ITEM_LABELS[kind] : null, selected: !!local && local.slot === index };
  });

  let prompt: string | null = null;
  const canReset = !!vehicle && seated && local.downed === null && vehicle.resetReady === true;
  if (vehicle && local && local.downed === null) {
    const hints = [
      interactHint(config, vehicle, local, players, aim.yaw, aim.pitch, propPoses, cable, anchors, stops),
      useHint(data),
      canReset ? RESET_HINT : null,
    ];
    prompt = hints.filter((hint) => hint !== null).map((hint) => (data.touch ? touchWording(hint) : hint)).join('   ') || null;
  }

  const mapEntities: HudModel['mapEntities'] = [];
  if (vehicle) {
    mapEntities.push({ id: 'vehicle', kind: 'vehicle', x: vehicle.pos.x, z: vehicle.pos.z });
    if (local && ownPos && !seated) mapEntities.push({ id: local.playerId, kind: 'self', x: ownPos.x, z: ownPos.z, yaw: aim.yaw });
    for (const player of players) {
      if (player.playerId !== localId) mapEntities.push({ id: player.playerId, kind: 'player', x: player.pos.x, z: player.pos.z });
    }
    for (const stop of stops) mapEntities.push({ id: stop.id, kind: 'stop', x: stop.operatePoint.x, z: stop.operatePoint.z, stopKind: stop.kind });
    course.checkpoints.forEach((checkpoint, index) => {
      const { center } = checkpoint.trigger;
      mapEntities.push({ id: checkpoint.id, kind: 'checkpoint', x: center.x, z: center.z, reached: !!status && index <= status.checkpoint });
    });
  }

  const downedOthers: HudModel['downedOthers'] = [];
  for (const player of players) {
    if (player.playerId === localId || player.downed === null) continue;
    const name = lobby.players.find((info) => info.playerId === player.playerId)?.name ?? player.playerId;
    downedOthers.push({ id: player.playerId, name, pos: { x: player.pos.x, y: player.pos.y + MARKER_HEIGHT, z: player.pos.z }, seconds: seconds(player.downed) });
  }

  return {
    heading,
    compass,
    vehicle: vehicle
      ? { fuel: vehicle.fuel, health: vehicle.health, fuelLow: vehicle.fuel < LOW_FRACTION, healthLow: vehicle.health < LOW_FRACTION }
      : null,
    timer: clock(status?.elapsed ?? 0),
    wallet: status?.wallet ?? 0,
    ownHealth: local?.health ?? 0,
    ownSeat: local && local.seat !== null ? { id: local.seat, label: seatLabel(local.seat) ?? local.seat } : null,
    slots,
    prompt,
    canReset,
    hold: local?.hold?.progress ?? null,
    downedSelf: local && local.downed !== null ? seconds(local.downed) : null,
    downedOthers,
    mapEntities,
  };
}
