import type { ClientMessage, Rapier, ServerMessage } from '@lodgy/shared';
import type { ConnectionHandle, RoomDeps, RoomServer } from './types';

// Fakes for tests of the room layer: a clock and timer moved by hand, and connections that record what they are sent.

export interface FakeDeps {
  deps: RoomDeps;
  // Moves the clock forward, running every timer callback that falls due on the way.
  advance(seconds: number): void;
  // Moves the clock forward without running any timer callback, as if the process had stalled.
  stall(seconds: number): void;
  // The values the random source returns next; it returns 0 once they run out.
  randomValues: number[];
}

export function createFakeDeps(rapier: Rapier): FakeDeps {
  let now = 0;
  const timers: { period: number; fn: () => void; origin: number; fired: number }[] = [];
  const randomValues: number[] = [];
  // Due times are origin + n × period, never a running sum, so they do not drift.
  const nextDue = () => {
    let best: (typeof timers)[number] | undefined;
    for (const timer of timers) {
      const due = timer.origin + (timer.fired + 1) * timer.period;
      if (!best || due < best.origin + (best.fired + 1) * best.period) best = timer;
    }
    return best;
  };
  return {
    deps: {
      rapier,
      clock: () => now,
      random: () => randomValues.shift() ?? 0,
      timer: {
        every(seconds, fn) {
          const timer = { period: seconds, fn, origin: now, fired: 0 };
          timers.push(timer);
          return () => {
            const index = timers.indexOf(timer);
            if (index !== -1) timers.splice(index, 1);
          };
        },
      },
    },
    advance(seconds) {
      const target = now + seconds;
      for (let timer = nextDue(); timer; timer = nextDue()) {
        const due = timer.origin + (timer.fired + 1) * timer.period;
        if (due > target + 1e-9) break;
        now = Math.max(now, due);
        timer.fired += 1;
        timer.fn();
      }
      now = target;
    },
    stall(seconds) {
      now += seconds;
      // Callbacks missed during a stall are not made up afterwards.
      for (const timer of timers) timer.fired = Math.floor((now - timer.origin) / timer.period + 1e-9);
    },
    randomValues,
  };
}

export interface FakeClient {
  // Every message the server has sent this client, oldest first.
  received: ServerMessage[];
  // True once the server has closed the connection.
  closedByServer: boolean;
  send(message: ClientMessage): void;
  sendRaw(data: string): void;
  // Closes the connection from the client's side.
  close(): void;
  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[];
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>;
}

export function connectFakeClient(server: RoomServer, address = 'test'): FakeClient {
  const received: ServerMessage[] = [];
  let handle: ConnectionHandle | null = null;
  const client: FakeClient = {
    received,
    closedByServer: false,
    send: (message) => handle?.message(JSON.stringify(message)),
    sendRaw: (data) => handle?.message(data),
    close: () => handle?.closed(),
    ofType: <T extends ServerMessage['type']>(type: T) =>
      received.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type),
    last<T extends ServerMessage['type']>(type: T) {
      const matches = client.ofType(type);
      const message = matches[matches.length - 1];
      if (!message) throw new Error(`No ${type} message received`);
      return message;
    },
  };
  handle = server.connect(
    {
      send: (data) => received.push(JSON.parse(data) as ServerMessage),
      close: () => {
        client.closedByServer = true;
      },
    },
    address,
  );
  return client;
}
