import type { BuiltCourse, Rapier, World } from '@lodgy/shared';

// One client's connection, as the room layer sees it. The adapter implements it over a real socket.
// If send or close throws, the room server reports it and drops the connection.
export interface Connection {
  send(data: string): void;
  close(): void;
}

// What the adapter calls when the connection receives a message or closes.
export interface ConnectionHandle {
  message(data: string): void;
  closed(): void;
}

export interface Timer {
  // Calls fn repeatedly, about every `seconds`. Returns a function that stops it.
  every(seconds: number, fn: () => void): () => void;
}

// Everything the room layer needs from outside. Tests pass fakes.
export interface RoomDeps {
  rapier: Rapier;
  // Seconds from any fixed origin; it must never go backwards.
  clock: () => number;
  // A number in [0, 1).
  random: () => number;
  timer: Timer;
  // Told about a failure; `source` is `room:<noun>`, `connection:<noun>` or `connection`, and `suppressed` is 0 from this layer.
  onError?: (error: unknown, source: string, suppressed: number) => void;
}

export interface RoomServerOptions {
  // Tests only: replaces the course of each id listed.
  courses?: Readonly<Record<string, BuiltCourse>>;
  // `create` messages one address may send in 60 s; defaults to CREATE_PER_MINUTE.
  createPerMinute?: number;
}

export interface RoomServer {
  // `address` is the client's address, used to limit room creation per address.
  connect(connection: Connection, address: string): ConnectionHandle;
  roomCount(): number;
  // Tests only: the world of a room, or null while it has none.
  debugWorld(noun: string): World | null;
  // Stops the timer and frees every room.
  stop(): void;
}
