import {
  CLOCK_OFFSET_SMOOTHING,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  lerp,
  nlerp,
  type PlayerSnapshot,
  type VehicleState,
  type WorldSnapshot,
} from '@lodgy/shared';

export interface SnapshotBuffer {
  // Stores a snapshot received at local time `receivedAt` (seconds). Snapshots older than the newest are ignored.
  push(snapshot: WorldSnapshot, receivedAt: number): void;
  // The world as it was INTERPOLATION_DELAY before local time `now`, or null before any snapshot.
  sample(now: number): { vehicle: VehicleState; players: PlayerSnapshot[] } | null;
  // The tick of the newest snapshot, or 0 before any.
  latestTick(): number;
}

function blend(a: VehicleState, b: VehicleState, t: number): VehicleState {
  return {
    pos: lerp(a.pos, b.pos, t),
    rot: nlerp(a.rot, b.rot, t),
    linvel: lerp(a.linvel, b.linvel, t),
    throttle: b.throttle,
    steer: b.steer,
  };
}

const copyVec = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z });

function copyPlayer(p: PlayerSnapshot): PlayerSnapshot {
  return {
    playerId: p.playerId,
    pos: copyVec(p.pos),
    yaw: p.yaw,
    seat: p.seat,
    ground: p.ground && { bodyId: p.ground.bodyId, localPos: copyVec(p.ground.localPos) },
  };
}

function copyVehicle(v: VehicleState): VehicleState {
  return { pos: copyVec(v.pos), rot: { ...v.rot }, linvel: copyVec(v.linvel), throttle: v.throttle, steer: v.steer };
}

const copyWorld = (w: WorldSnapshot) => ({ vehicle: copyVehicle(w.vehicle), players: w.players.map(copyPlayer) });

function blendPlayer(a: PlayerSnapshot | undefined, b: PlayerSnapshot, t: number): PlayerSnapshot {
  if (!a) return copyPlayer(b);
  // The shorter way round, so a turn across +-pi does not spin the long way.
  const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  const yaw = a.yaw + turn * t;
  const wrapped = yaw > Math.PI ? yaw - 2 * Math.PI : yaw <= -Math.PI ? yaw + 2 * Math.PI : yaw;
  return { ...copyPlayer(b), pos: lerp(a.pos, b.pos, t), yaw: wrapped };
}

export function createSnapshotBuffer(): SnapshotBuffer {
  // Oldest first. `time` is the server's clock at the snapshot's tick.
  const entries: { time: number; snapshot: WorldSnapshot }[] = [];
  // Server clock minus local clock, as estimated from arrival times.
  let offset: number | null = null;

  return {
    push(snapshot, receivedAt) {
      const time = snapshot.tick * TICK_DT;
      const newest = entries[entries.length - 1];
      if (newest && time <= newest.time) return;
      const measured = time - receivedAt;
      // A snapshot that arrives early shows the true offset at once; late ones only nudge it,
      // so one delayed packet does not move the clock but a lasting change is followed.
      offset = offset === null || measured > offset ? measured : offset + (measured - offset) * CLOCK_OFFSET_SMOOTHING;
      entries.push({ time, snapshot });
      if (entries.length > SNAPSHOT_BUFFER_SIZE) entries.shift();
    },
    sample(now) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      if (!first || !last || offset === null) return null;
      const time = now + offset - INTERPOLATION_DELAY;
      if (time <= first.time) return copyWorld(first.snapshot);
      // Past the newest snapshot there is nothing to blend toward; it is shown as it is, with no guessing ahead.
      if (time >= last.time) return copyWorld(last.snapshot);
      let index = entries.length - 2;
      while (entries[index]!.time > time) index -= 1;
      const from = entries[index]!;
      const to = entries[index + 1]!;
      const t = (time - from.time) / (to.time - from.time);
      const before = new Map(from.snapshot.players.map((p) => [p.playerId, p]));
      return {
        vehicle: blend(from.snapshot.vehicle, to.snapshot.vehicle, t),
        players: to.snapshot.players.map((p) => blendPlayer(before.get(p.playerId), p, t)),
      };
    },
    latestTick: () => entries[entries.length - 1]?.snapshot.tick ?? 0,
  };
}
