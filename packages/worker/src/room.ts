import { MAX_CONNECTIONS_PER_ADDRESS, MAX_CONNECTIONS_PER_ROOM, type Rapier } from '@lodgy/shared';
import { createReporter, createRoomServer, isValidNoun, type RoomServer, type WeekStore } from '@lodgy/server/room';
import { clientAddress } from './address';
import { createAdmission, exceedsMessageLimit } from './admission';
import { createClaim, type ClaimResult } from './claim';
import type { PausableTimer } from './workerTimer';

// The server side of a WebSocketPair, as far as the room uses it.
export interface ServerSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message' | 'close' | 'error', listener: (event: { data?: unknown }) => void): void;
}

export interface GameRoomDeps<Client> {
  rapier: Rapier;
  clock: () => number;
  random: () => number;
  timer: PausableTimer;
  onError: (error: unknown, source: string, suppressed: number) => void;
  // A WebSocketPair in the Worker; fakes in tests.
  createPair: () => { client: Client; server: ServerSocket };
  limits?: { perRoom?: number; perAddress?: number; createPerMinute?: number };
  // Where story mode keeps the week; the Durable Object's storage in the Worker, memory when absent.
  weekStore?: WeekStore;
}

export type UpgradeResult<Client> = { accepted: true; client: Client } | { accepted: false; status: 400 | 429 | 503 };

export interface GameRoom<Client> {
  // `addressHeader` is the value of CF-Connecting-IP, or null.
  // `create`: the Worker forwarded a create, which is the connect that uses up the claim.
  upgrade(noun: string, addressHeader: string | null, create?: boolean): UpgradeResult<Client>;
  claim(): ClaimResult;
  connections(): number;
  roomCount(): number;
}

export function createGameRoom<Client>(deps: GameRoomDeps<Client>): GameRoom<Client> {
  const report = createReporter(deps.onError, deps.clock);
  const admission = createAdmission({
    perRoom: deps.limits?.perRoom ?? MAX_CONNECTIONS_PER_ROOM,
    perAddress: deps.limits?.perAddress ?? MAX_CONNECTIONS_PER_ADDRESS,
  });
  const claim = createClaim(deps.clock);
  let server: RoomServer | null = null;

  const roomCount = () => server?.roomCount() ?? 0;
  // No connection and no room: stop the timers so the Object can be evicted.
  const pauseIfIdle = () => {
    if (admission.count() === 0 && roomCount() === 0) deps.timer.pause();
  };
  const timer: PausableTimer = {
    ...deps.timer,
    every: (seconds, fn) =>
      deps.timer.every(seconds, () => {
        try {
          fn();
        } finally {
          pauseIfIdle();
        }
      }),
  };

  return {
    upgrade(noun, addressHeader, create = false) {
      if (!isValidNoun(noun)) return { accepted: false, status: 400 };
      const address = clientAddress(addressHeader);
      const admitted = admission.admit(address);
      if (admitted !== 'ok') return { accepted: false, status: admitted === 'full' ? 503 : 429 };

      const { client, server: socket } = deps.createPair();
      let closed = false;
      let handle: ReturnType<RoomServer['connect']> | null = null;
      // Whatever the path (close event, error, our own close), the count drops once.
      const finish = () => {
        if (closed) return;
        closed = true;
        admission.release(address);
        try {
          handle?.closed();
        } catch (error) {
          report('socket:close', error);
        }
        pauseIfIdle();
      };
      const drop = (code: number, reason: string) => {
        try {
          socket.close(code, reason);
        } catch (error) {
          report('socket:close', error);
        }
        finish();
      };

      try {
        socket.accept();
        server ??= createRoomServer(
          { rapier: deps.rapier, clock: deps.clock, random: deps.random, timer, onError: (error, source) => report(source, error) },
          { fixedNoun: noun, createPerMinute: deps.limits?.createPerMinute, weekStore: deps.weekStore },
        );
        deps.timer.resume();
        handle = server.connect(
          {
            send: (data) => socket.send(data),
            // A dead peer never delivers a close event, so the slot is freed here.
            close: () => drop(1000, ''),
          },
          address,
        );
      } catch (error) {
        report('upgrade', error);
        drop(1011, 'error');
        return { accepted: false, status: 503 };
      }
      if (create) claim.release();

      socket.addEventListener('message', (event) => {
        if (closed) return;
        if (typeof event.data !== 'string') return drop(1003, 'text only');
        if (exceedsMessageLimit(event.data)) return drop(1009, 'too large');
        try {
          handle!.message(event.data);
        } catch (error) {
          report('socket:message', error);
          drop(1011, 'error');
        }
      });
      socket.addEventListener('close', finish);
      socket.addEventListener('error', finish);
      return { accepted: true, client };
    },
    claim: () => claim.tryClaim(admission.count() > 0 || roomCount() > 0),
    connections: admission.count,
    roomCount,
  };
}
