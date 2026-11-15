import { CREATE_PER_MINUTE, MAX_CONNECTIONS_PER_ADDRESS, SOCKET_PATH, type Rapier } from '@lodgy/shared';
import { nounCandidates } from '@lodgy/server/room';
import * as RAPIER from '../vendor/rapier3d/rapier.js';
import { allocate, type ClaimResult } from './claim';
import { createGameRoom, type GameRoom as Room } from './room';
import { createWorkerTimer } from './workerTimer';

export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  CREATE_PER_MINUTE?: string;
  MAX_CONNECTIONS_PER_ADDRESS?: string;
}

const CLAIM_PATH = '/claim';
const NOUN = /^[a-z]+\d*$/;

// Reads a positive integer var like main.ts does; a bad value fails the request loudly instead of silently using the default.
function limit(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got "${value}"`);
  return n;
}

export class GameRoom {
  private room: Room<Response> | null = null;

  constructor(
    _state: DurableObjectState,
    private env: Env,
  ) {}

  private game(): Room<Response> {
    return (this.room ??= createGameRoom<Response>({
      rapier: RAPIER as unknown as Rapier,
      clock: () => performance.now() / 1000,
      random: Math.random,
      timer: createWorkerTimer((error, source) => console.error(source, error)),
      onError: (error, source, suppressed) => {
        console.error(source, error);
        if (suppressed > 0) console.error(`(${suppressed} more from ${source} were not printed)`);
      },
      createPair: () => {
        const { 0: client, 1: server } = new WebSocketPair();
        return { client: new Response(null, { status: 101, webSocket: client }), server: server as never };
      },
      limits: {
        perAddress: limit(this.env.MAX_CONNECTIONS_PER_ADDRESS, MAX_CONNECTIONS_PER_ADDRESS, 'MAX_CONNECTIONS_PER_ADDRESS'),
        createPerMinute: limit(this.env.CREATE_PER_MINUTE, CREATE_PER_MINUTE, 'CREATE_PER_MINUTE'),
      },
    }));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CLAIM_PATH) return new Response(this.game().claim());
    const result = this.game().upgrade(url.searchParams.get('noun') ?? '', request.headers.get('CF-Connecting-IP'));
    if (result.accepted) return result.client;
    return new Response(result.status === 429 ? 'Too many connections\n' : result.status === 503 ? 'Room is full\n' : 'Bad request\n', {
      status: result.status,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== SOCKET_PATH) return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Upgrade required\n', { status: 426, headers: { Upgrade: 'websocket' } });
    }
    const object = (noun: string) => env.ROOM.get(env.ROOM.idFromName(noun));
    const noun = url.searchParams.get('noun');
    if (noun !== null) {
      if (!NOUN.test(noun)) return new Response('Bad request\n', { status: 400 });
      return object(noun).fetch(request);
    }
    if (!url.searchParams.has('create')) return new Response('Bad request\n', { status: 400 });
    const claimed = await allocate(nounCandidates(Math.random), async (candidate) => {
      const response = await object(candidate).fetch(new Request(new URL(`${CLAIM_PATH}?noun=${candidate}`, request.url)));
      return (await response.text()) as ClaimResult;
    });
    if (claimed === null) return new Response('No room available\n', { status: 503 });
    const target = new URL(request.url);
    target.searchParams.delete('create');
    target.searchParams.set('noun', claimed);
    return object(claimed).fetch(new Request(target, request));
  },
} satisfies ExportedHandler<Env>;
