import { ITEM_DROP_AHEAD, ITEM_DROP_BEHIND, ITEM_DROP_EDGE_OFFSET, ITEM_DROP_JITTER, ITEM_DROP_MIX, ITEM_DROP_PICKUP_CLEAR, ITEM_DROP_SPACING, AMBIENT_REARM_CLEAR, ROAD_WIDTH, type ItemKind } from './constants';
import { eligibleSpans, mulberry32, type Span } from './ambient';

export interface ItemDropEvent {
  id: number;
  along: number;
  side: -1 | 1;
  // m, signed like the animals' lateral: positive to the right of the travel direction.
  lateral: number;
  kind: ItemKind;
}

// Two rounds of the murmur3 finaliser over the pair, so neighbouring run numbers give unrelated seeds.
export function mixSeed(a: number, b: number): number {
  let h = (a >>> 0) ^ Math.imul((b >>> 0) + 0x9e3779b9, 0x85ebca6b);
  for (let i = 0; i < 2; i++) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    h = (h + (b >>> 0) + 0x7f4a7c15) | 0;
  }
  return h >>> 0;
}

// Slots laid along the eligible route as one joined line, each jittered, as planAmbient does; course pickups block a span either side.
export function planItemDrops(seed: number, routeLength: number, blocked: readonly Span[], pickupAlongs: readonly number[]): ItemDropEvent[] {
  const spans = [...blocked, ...pickupAlongs.map((a) => ({ from: a - ITEM_DROP_PICKUP_CLEAR, to: a + ITEM_DROP_PICKUP_CLEAR }))];
  const open = eligibleSpans(routeLength, spans);
  const eligible = open.reduce((sum, s) => sum + s.to - s.from, 0);
  const rand = mulberry32(seed);
  const events: ItemDropEvent[] = [];
  let span = 0;
  let spanStart = 0;
  for (let k = 0; (k + 0.5) * ITEM_DROP_SPACING - ITEM_DROP_JITTER < eligible; k++) {
    const virtual = (k + 0.5) * ITEM_DROP_SPACING + (rand() * 2 - 1) * ITEM_DROP_JITTER;
    const r = rand();
    const kind: ItemKind = r < ITEM_DROP_MIX.jerrycan ? 'jerrycan' : r < ITEM_DROP_MIX.jerrycan + ITEM_DROP_MIX.toolbox ? 'toolbox' : 'healthKit';
    const side: -1 | 1 = rand() < 0.5 ? -1 : 1;
    if (virtual >= eligible) continue;
    while (span < open.length - 1 && virtual >= spanStart + (open[span]!.to - open[span]!.from)) {
      spanStart += open[span]!.to - open[span]!.from;
      span++;
    }
    events.push({ id: events.length, along: open[span]!.from + (virtual - spanStart), side, lateral: side * (ROAD_WIDTH / 2 + ITEM_DROP_EDGE_OFFSET), kind });
  }
  return events;
}

export interface OwnedDrop {
  eventId: number;
  itemId: string;
}

export interface ItemDirectorState {
  events: readonly ItemDropEvent[];
  fired: boolean[];
  // Drops this director placed and the world still holds, in the order they were recorded.
  owned: OwnedDrop[];
}

export function createItemDirector(plan: readonly ItemDropEvent[]): ItemDirectorState {
  return { events: plan, fired: plan.map(() => false), owned: [] };
}

export interface ItemDirectorInput {
  vehicleAlong: number;
  // Ids of the items now in the world.
  existing: ReadonlySet<string>;
}

export function stepItemDirector(state: ItemDirectorState, input: ItemDirectorInput): { drop: ItemDropEvent[]; take: string[] } {
  const { vehicleAlong, existing } = input;
  const take: string[] = [];
  const kept: OwnedDrop[] = [];
  for (const o of state.owned) {
    if (!existing.has(o.itemId)) continue;
    if (vehicleAlong - state.events[o.eventId]!.along > ITEM_DROP_BEHIND) take.push(o.itemId);
    else kept.push(o);
  }
  state.owned = kept;

  const drop: ItemDropEvent[] = [];
  for (const e of state.events) {
    if (state.fired[e.id] || e.along < vehicleAlong) continue;
    if (e.along - vehicleAlong > ITEM_DROP_AHEAD) break;
    state.fired[e.id] = true;
    drop.push(e);
  }
  return { drop, take };
}

export function markDropped(state: ItemDirectorState, eventId: number, itemId: string): void {
  state.owned.push({ eventId, itemId });
}

// Lets an event fire again when the world could not place it (no ground under it yet).
export function unfireItem(state: ItemDirectorState, eventId: number): void {
  state.fired[eventId] = false;
}

// Returns the ids of every owned drop for the caller to take. Events behind and within AMBIENT_REARM_CLEAR ahead stay fired; the rest fire again.
export function rearmItems(state: ItemDirectorState, vehicleAlong: number): string[] {
  const ids = state.owned.map((o) => o.itemId);
  state.owned = [];
  for (const e of state.events) state.fired[e.id] = e.along <= vehicleAlong + AMBIENT_REARM_CLEAR;
  return ids;
}
