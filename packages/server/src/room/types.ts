import type { Rapier } from '@lodgy/shared';

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
  // Told about a connection or a room that failed; the server carries on without it. `source` is `room:<noun>`, or `connection` outside any room. The room layer does not rate-limit, so `suppressed` is 0 from here.
  onError?: (error: unknown, source: string, suppressed: number) => void;
}

export interface RoomServerOptions {
  // Until the lobby exists (step 11), every room runs this course with this vehicle.
  courseId?: string;
  vehicleId?: string;
  // `create` messages one address may send in 60 s; defaults to CREATE_PER_MINUTE.
  createPerMinute?: number;
}

export interface RoomServer {
  // `address` is the client's address, used to limit room creation per address.
  connect(connection: Connection, address: string): ConnectionHandle;
  roomCount(): number;
  // Stops the timer and frees every room.
  stop(): void;
}
