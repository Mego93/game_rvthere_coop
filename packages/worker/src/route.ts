import { SOCKET_PATH } from '@lodgy/shared';
import { isValidNoun, nounCandidates } from '@lodgy/server/room';
import { allocate, type ClaimResult } from './claim';

export const CLAIM_PATH = '/claim';
// Set by the Worker alone on a forwarded create; a client's own copy is dropped.
export const CREATE_HEADER = 'x-lodgy-create';

export interface RouteEnv {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const text = (body: string, status: number, headers?: Record<string, string>) => new Response(`${body}\n`, { status, headers });

export async function route(request: Request, env: RouteEnv, random: () => number = Math.random): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== SOCKET_PATH) return env.ASSETS.fetch(request);
  if (request.headers.get('Upgrade') !== 'websocket') return text('Upgrade required', 426, { Upgrade: 'websocket' });
  const object = (noun: string) => env.ROOM.get(env.ROOM.idFromName(noun));
  const forward = (noun: string, create: boolean) => {
    const target = new URL(request.url);
    target.searchParams.delete('create');
    target.searchParams.set('noun', noun);
    const headers = new Headers(request.headers);
    headers.delete(CREATE_HEADER);
    if (create) headers.set(CREATE_HEADER, '1');
    return object(noun).fetch(new Request(target, { headers, method: request.method }));
  };

  const noun = url.searchParams.get('noun');
  if (noun !== null) return isValidNoun(noun) ? forward(noun, false) : text('Bad request', 400);
  if (!url.searchParams.has('create')) return text('Bad request', 400);

  try {
    const claimed = await allocate(
      () => nounCandidates(random).next().value as string,
      async (candidate) => {
        const response = await object(candidate).fetch(new Request(new URL(`${CLAIM_PATH}?noun=${candidate}`, request.url)));
        if (!response.ok) throw new Error(`claim of ${candidate} answered ${response.status}`);
        return (await response.text()) as ClaimResult;
      },
    );
    return claimed === null ? text('No room available', 503) : await forward(claimed, true);
  } catch (error) {
    console.error('create', error);
    return text('Server error', 500);
  }
}
