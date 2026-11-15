import { CREATE_PER_MINUTE, MAX_CONNECTIONS_PER_ADDRESS, type Rapier } from '@lodgy/shared';
import { isValidNoun } from '@lodgy/server/room';
import * as RAPIER from '../vendor/rapier3d/rapier.js';
import { CLAIM_PATH, CREATE_HEADER, route } from './route';
import { createGameRoom, type GameRoom as Room } from './room';
import { createWorkerTimer } from './workerTimer';

export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  CREATE_PER_MINUTE?: string;
  MAX_CONNECTIONS_PER_ADDRESS?: string;
}

// Reads a positive integer var like main.ts does; a bad value fails the request loudly instead of silently using the default.
function limit(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got "${value}"`);
  return n;
}

export class GameRoom {
  private room: Room<Response> | null = null;

  private limits: { perAddress: number; createPerMinute: number } | null = null;
  private limitsError: unknown = null;

  constructor(_state: DurableObjectState, env: Env) {
    try {
      this.limits = {
        perAddress: limit(env.MAX_CONNECTIONS_PER_ADDRESS, MAX_CONNECTIONS_PER_ADDRESS, 'MAX_CONNECTIONS_PER_ADDRESS'),
        createPerMinute: limit(env.CREATE_PER_MINUTE, CREATE_PER_MINUTE, 'CREATE_PER_MINUTE'),
      };
    } catch (error) {
      this.limitsError = error;
    }
  }

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
      limits: this.limits!,
    }));
  }

  async fetch(request: Request): Promise<Response> {
    if (this.limits === null) {
      console.error('bad environment', this.limitsError);
      return new Response('Server misconfigured\n', { status: 500 });
    }
    const url = new URL(request.url);
    const noun = url.searchParams.get('noun') ?? '';
    if (!isValidNoun(noun)) return new Response('Bad request\n', { status: 400 });
    if (url.pathname === CLAIM_PATH) return new Response(this.game().claim());
    const result = this.game().upgrade(noun, request.headers.get('CF-Connecting-IP'), request.headers.get(CREATE_HEADER) === '1');
    if (result.accepted) return result.client;
    return new Response(result.status === 429 ? 'Too many connections\n' : result.status === 503 ? 'Room is full\n' : 'Bad request\n', {
      status: result.status,
    });
  }
}

export default {
  fetch: (request: Request, env: Env) => route(request, env),
} satisfies ExportedHandler<Env>;
