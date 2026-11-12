import type { Rapier } from '@lodgy/shared';

// One client's connection, as the room layer sees it. The adapter implements it over a real socket.
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
}

export interface RoomServerOptions {
  // Until the lobby exists (step 11), every room runs this course with this vehicle.
  courseId?: string;
  vehicleId?: string;
}

export interface RoomServer {
  connect(connection: Connection): ConnectionHandle;
  roomCount(): number;
  // Stops the timer and frees every room.
  stop(): void;
}
