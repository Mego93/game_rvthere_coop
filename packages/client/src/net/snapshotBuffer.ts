import {
  CLOCK_OFFSET_SMOOTHING,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  lerp,
  nlerp,
  type CableSnapshot,
  type PlayerSnapshot,
  type PropSnapshot,
  type SnapshotMessage,
  type VehicleState,
  type WorldSnapshot,
} from '@lodgy/shared';

export interface SnapshotBuffer {
  // Stores a snapshot received at local time `receivedAt` (seconds). Snapshots older than the newest are ignored.
  push(snapshot: SnapshotMessage, receivedAt: number): void;
  // The world as it was INTERPOLATION_DELAY before local time `now`, or null before any snapshot.
  sample(now: number): { vehicle: VehicleState; players: PlayerSnapshot[]; props: PropSnapshot[]; cable: CableSnapshot } | null;
  // The tick of the newest snapshot, or 0 before any.
  latestTick(): number;
  // Every prop as of the newest snapshot, partial snapshots merged in.
  latestProps(): PropSnapshot[];
  // The cable as of the newest snapshot, or null before any.
  latestCable(): CableSnapshot | null;
  // The run's clock and counters as of the newest snapshot, or null before any.
  latestStatus(): RunStatus | null;
}

export interface RunStatus {
  elapsed: number;
  checkpoint: number;
  checkpointCount: number;
  restarts: number;
  respawns: number;
  won: boolean;
}

function blend(a: VehicleState, b: VehicleState, t: number): VehicleState {
  return {
    pos: lerp(a.pos, b.pos, t),
    rot: nlerp(a.rot, b.rot, t),
    linvel: lerp(a.linvel, b.linvel, t),
    throttle: b.throttle,
    steer: b.steer,
    fuel: b.fuel,
    health: b.health,
  };
}

const copyVec = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z });

function copyPlayer(p: PlayerSnapshot): PlayerSnapshot {
  return {
    playerId: p.playerId,
    pos: copyVec(p.pos),
    yaw: p.yaw,
    seat: p.seat,
    hands: p.hands,
    ground: p.ground && { bodyId: p.ground.bodyId, localPos: copyVec(p.ground.localPos) },
    walk: { x: p.walk.x, z: p.walk.z },
    carry: { x: p.carry.x, z: p.carry.z },
    vy: p.vy,
    grounded: p.grounded,
    inventory: [p.inventory[0], p.inventory[1], p.inventory[2]],
    slot: p.slot,
    hold: p.hold && { action: p.hold.action, targetId: p.hold.targetId, progress: p.hold.progress },
    health: p.health,
    downed: p.downed,
  };
}

function copyVehicle(v: VehicleState): VehicleState {
  return { pos: copyVec(v.pos), rot: { ...v.rot }, linvel: copyVec(v.linvel), throttle: v.throttle, steer: v.steer, fuel: v.fuel, health: v.health };
}

const copyProp = (p: PropSnapshot): PropSnapshot => ({ id: p.id, kind: p.kind, pos: copyVec(p.pos), rot: { ...p.rot } });

const copyCable = (c: CableSnapshot): CableSnapshot => ({
  state: c.state,
  holderId: c.holderId,
  anchorId: c.anchorId,
  hookPos: copyVec(c.hookPos),
  length: c.length,
  reel: c.reel,
});

// Across a state change the hook jumps (a stow, a drop), so the newer one is taken whole.
function blendCable(a: CableSnapshot, b: CableSnapshot, t: number): CableSnapshot {
  if (a.state !== b.state) return copyCable(b);
  return { ...copyCable(b), hookPos: lerp(a.hookPos, b.hookPos, t), length: a.length + (b.length - a.length) * t };
}

const copyWorld = (w: WorldSnapshot) => ({
  vehicle: copyVehicle(w.vehicle),
  players: w.players.map(copyPlayer),
  props: w.props.map(copyProp),
  cable: copyCable(w.cable),
});

function blendProps(from: readonly PropSnapshot[], to: readonly PropSnapshot[], t: number): PropSnapshot[] {
  const before = new Map(from.map((p) => [p.id, p]));
  return to.map((p) => {
    const a = before.get(p.id);
    return a ? { ...copyProp(p), pos: lerp(a.pos, p.pos, t), rot: nlerp(a.rot, p.rot, t) } : copyProp(p);
  });
}

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
  // Every prop as last told: a full snapshot replaces it, a partial one updates the props it lists.
  let propMap = new Map<string, PropSnapshot>();

  return {
    push(snapshot, receivedAt) {
      const time = snapshot.tick * TICK_DT;
      const newest = entries[entries.length - 1];
      if (newest && time <= newest.time) return;
      if (snapshot.full) propMap = new Map();
      for (const prop of snapshot.props) propMap.set(prop.id, copyProp(prop));
      const measured = time - receivedAt;
      // A snapshot that arrives early shows the true offset at once; late ones only nudge it,
      // so one delayed packet does not move the clock but a lasting change is followed.
      offset = offset === null || measured > offset ? measured : offset + (measured - offset) * CLOCK_OFFSET_SMOOTHING;
      entries.push({ time, snapshot: { ...snapshot, props: [...propMap.values()].map(copyProp) } });
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
        props: blendProps(from.snapshot.props, to.snapshot.props, t),
        cable: blendCable(from.snapshot.cable, to.snapshot.cable, t),
      };
    },
    latestTick: () => entries[entries.length - 1]?.snapshot.tick ?? 0,
    latestCable() {
      const newest = entries[entries.length - 1];
      return newest ? copyCable(newest.snapshot.cable) : null;
    },
    latestStatus() {
      const newest = entries[entries.length - 1]?.snapshot;
      if (!newest) return null;
      const { elapsed, checkpoint, checkpointCount, restarts, respawns, won } = newest;
      return { elapsed, checkpoint, checkpointCount, restarts, respawns, won };
    },
    latestProps: () => (entries[entries.length - 1]?.snapshot.props ?? []).map(copyProp),
  };
}
