import { SOCKET_PATH, type Rapier } from '@lodgy/shared';
import * as RAPIER from '../vendor/rapier3d/rapier.js';
import { createGameRoom, type GameRoom as Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  CREATE_PER_MINUTE?: string;
  MAX_CONNECTIONS_PER_ADDRESS?: string;
}

const GATE_NOUN = 'gate';

export class GameRoom {
  private room: Room | null = null;

  async fetch(request: Request): Promise<Response> {
    this.room ??= createGameRoom({
      rapier: RAPIER as unknown as Rapier,
      clock: () => performance.now() / 1000,
      random: Math.random,
      timer: {
        every(seconds, fn) {
          const id = setInterval(fn, seconds * 1000);
          return () => clearInterval(id);
        },
      },
      onError: (error, source) => console.error(source, error),
    });
    return this.room.upgrade(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== SOCKET_PATH) return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Upgrade required\n', { status: 426, headers: { Upgrade: 'websocket' } });
    }
    // `?create=1` goes to the 'gate' Object until Task 3 allocates a noun (R6); a bare /ws is refused.
    const noun = url.searchParams.get('noun') ?? (url.searchParams.has('create') ? GATE_NOUN : null);
    if (noun === null || !/^[a-z]+\d*$/.test(noun)) return new Response('Bad request\n', { status: 400 });
    return env.ROOM.get(env.ROOM.idFromName(noun)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
