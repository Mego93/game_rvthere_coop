import {
  AMBIENT_DESPAWN_BEHIND,
  AMBIENT_EDGE_OFFSET,
  AMBIENT_GOAT_SHARE,
  AMBIENT_GOAT_SPEED,
  AMBIENT_GOAT_STOP_BEYOND,
  AMBIENT_JITTER,
  AMBIENT_MAX_GOATS,
  AMBIENT_MAX_SCOOTERS,
  AMBIENT_REARM_CLEAR,
  AMBIENT_SCOOTER_LEAVE,
  AMBIENT_SCOOTER_SPEED,
  AMBIENT_SPACING,
  AMBIENT_SPAWN_AHEAD,
  AMBIENT_TRIGGER,
  ANIMAL_HIT_LINGER,
  ROAD_WIDTH,
} from './constants';

export type AnimalKind = 'goat' | 'scooter';

export interface AmbientEvent {
  id: number;
  along: number;
  side: -1 | 1;
  kind: AnimalKind;
}

export interface AnimalSnapshot {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hit?: true;
}

export interface Span {
  from: number;
  to: number;
}

// FNV-1a over the UTF-16 code units.
export function hashSeed(courseId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < courseId.length; i++) h = Math.imul(h ^ courseId.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function eligibleSpans(routeLength: number, blocked: readonly Span[]): Span[] {
  const open: Span[] = [];
  let at = 0;
  for (const b of [...blocked].sort((x, y) => x.from - y.from || x.to - y.to)) {
    if (b.from > at) open.push({ from: at, to: Math.min(b.from, routeLength) });
    at = Math.max(at, b.to);
  }
  if (at < routeLength) open.push({ from: at, to: routeLength });
  return open.filter((s) => s.to > s.from);
}

// Slots of AMBIENT_SPACING laid along the eligible route as one joined line, each jittered by the PRNG, so the count follows the eligible length and gaps never shrink below AMBIENT_SPACING - 2 * AMBIENT_JITTER.
export function planAmbient(seed: number, routeLength: number, blocked: readonly Span[]): AmbientEvent[] {
  const open = eligibleSpans(routeLength, blocked);
  const eligible = open.reduce((sum, s) => sum + s.to - s.from, 0);
  const rand = mulberry32(seed);
  const events: AmbientEvent[] = [];
  let span = 0;
  let spanStart = 0;
  for (let k = 0; (k + 0.5) * AMBIENT_SPACING - AMBIENT_JITTER < eligible; k++) {
    const virtual = (k + 0.5) * AMBIENT_SPACING + (rand() * 2 - 1) * AMBIENT_JITTER;
    const kind: AnimalKind = rand() < AMBIENT_GOAT_SHARE ? 'goat' : 'scooter';
    const side: -1 | 1 = rand() < 0.5 ? -1 : 1;
    if (virtual >= eligible) continue;
    while (span < open.length - 1 && virtual >= spanStart + (open[span]!.to - open[span]!.from)) {
      spanStart += open[span]!.to - open[span]!.from;
      span++;
    }
    events.push({ id: events.length, along: open[span]!.from + (virtual - spanStart), side, kind });
  }
  return events;
}

export type AnimalPhase = 'wait' | 'cross' | 'done' | 'hit';

export interface DirectorAnimal {
  id: number;
  eventId: number;
  kind: AnimalKind;
  phase: AnimalPhase;
  along: number;
  // m, positive to the right of the travel direction.
  lateral: number;
  // -1 or 1: the lateral direction of the crossing.
  dir: -1 | 1;
  // m/s along `lateral`, signed; 0 when standing.
  velocity: number;
  hitAge: number;
}

export interface DirectorState {
  events: readonly AmbientEvent[];
  fired: boolean[];
  animals: DirectorAnimal[];
  nextId: number;
}

export interface Spawn {
  id: number;
  eventId: number;
  kind: AnimalKind;
  along: number;
  lateral: number;
}

export interface DirectorInput {
  vehicleAlong: number;
  vehicleLateral: number;
  dt: number;
}

export function createDirector(plan: readonly AmbientEvent[]): DirectorState {
  return { events: plan, fired: plan.map(() => false), animals: [], nextId: 1 };
}

const ROAD_HALF = ROAD_WIDTH / 2;

function live(state: DirectorState, kind: AnimalKind): number {
  let n = 0;
  for (const a of state.animals) if (a.kind === kind) n++;
  return n;
}

export function stepDirector(state: DirectorState, input: DirectorInput): { spawn: Spawn[]; despawn: number[] } {
  const { vehicleAlong, dt } = input;
  const despawn: number[] = [];
  const kept: DirectorAnimal[] = [];
  for (const a of state.animals) {
    let gone = vehicleAlong - a.along > AMBIENT_DESPAWN_BEHIND;
    if (a.phase === 'hit') {
      a.hitAge += dt;
      gone ||= a.hitAge >= ANIMAL_HIT_LINGER;
    } else {
      if (a.phase === 'wait' && a.along - vehicleAlong <= AMBIENT_TRIGGER) {
        a.phase = 'cross';
        a.velocity = a.dir * (a.kind === 'goat' ? AMBIENT_GOAT_SPEED : AMBIENT_SCOOTER_SPEED);
      }
      if (a.phase === 'cross') {
        a.lateral += a.velocity * dt;
        if (a.kind === 'goat') {
          const stop = a.dir * (ROAD_HALF + AMBIENT_GOAT_STOP_BEYOND);
          if ((a.lateral - stop) * a.dir >= 0) {
            a.lateral = stop;
            a.velocity = 0;
            a.phase = 'done';
          }
        } else if (a.lateral * a.dir >= ROAD_HALF + AMBIENT_SCOOTER_LEAVE) gone = true;
      }
    }
    if (gone) despawn.push(a.id);
    else kept.push(a);
  }
  state.animals = kept;

  const spawn: Spawn[] = [];
  let goats = live(state, 'goat');
  let scooters = live(state, 'scooter');
  for (const e of state.events) {
    if (state.fired[e.id] || e.along < vehicleAlong) continue;
    if (e.along - vehicleAlong > AMBIENT_SPAWN_AHEAD) break;
    if (e.kind === 'goat' ? goats >= AMBIENT_MAX_GOATS : scooters >= AMBIENT_MAX_SCOOTERS) continue;
    if (e.kind === 'goat') goats++;
    else scooters++;
    state.fired[e.id] = true;
    const lateral = e.side * (ROAD_HALF + AMBIENT_EDGE_OFFSET);
    const id = state.nextId++;
    state.animals.push({ id, eventId: e.id, kind: e.kind, phase: 'wait', along: e.along, lateral, dir: e.side === 1 ? -1 : 1, velocity: 0, hitAge: 0 });
    spawn.push({ id, eventId: e.id, kind: e.kind, along: e.along, lateral });
  }
  return { spawn, despawn };
}

export function markHit(state: DirectorState, id: number): void {
  const a = state.animals.find((x) => x.id === id);
  if (!a || a.phase === 'hit') return;
  a.phase = 'hit';
  a.velocity = 0;
  a.hitAge = 0;
}

// Removes every live animal and returns their ids. Events behind and within AMBIENT_REARM_CLEAR ahead stay fired, so a restart never puts an animal on the spot; the rest fire again.
export function rearm(state: DirectorState, vehicleAlong: number): number[] {
  const ids = state.animals.map((a) => a.id);
  state.animals = [];
  for (const e of state.events) state.fired[e.id] = e.along <= vehicleAlong + AMBIENT_REARM_CLEAR;
  return ids;
}
