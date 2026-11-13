import {
  CLOCK_OFFSET_SMOOTHING,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  lerp,
  nlerp,
  type VehicleState,
  type WorldSnapshot,
} from '@lodgy/shared';

export interface SnapshotBuffer {
  // Stores a snapshot received at local time `receivedAt` (seconds). Snapshots older than the newest are ignored.
  push(snapshot: WorldSnapshot, receivedAt: number): void;
  // The vehicle as it was INTERPOLATION_DELAY before local time `now`, or null before any snapshot.
  sample(now: number): VehicleState | null;
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
      if (time <= first.time) return first.snapshot.vehicle;
      // Past the newest snapshot there is nothing to blend toward; it is shown as it is, with no guessing ahead.
      if (time >= last.time) return last.snapshot.vehicle;
      let index = entries.length - 2;
      while (entries[index]!.time > time) index -= 1;
      const from = entries[index]!;
      const to = entries[index + 1]!;
      return blend(from.snapshot.vehicle, to.snapshot.vehicle, (time - from.time) / (to.time - from.time));
    },
    latestTick: () => entries[entries.length - 1]?.snapshot.tick ?? 0,
  };
}
