import { expect, test, vi } from 'vitest';
import { CREATE_HEADER, route, type RouteEnv } from './route';

const upgrade = { Upgrade: 'websocket' };

function fakeEnv(claims: (noun: string) => Response = () => new Response('free')) {
  const seen: { noun: string; url: string; headers: Headers }[] = [];
  const env = {
    ASSETS: { fetch: async () => new Response('asset') },
    ROOM: {
      idFromName: (noun: string) => noun,
      get: (noun: string) => ({
        fetch: async (request: Request) => {
          seen.push({ noun, url: request.url, headers: request.headers });
          if (new URL(request.url).pathname === '/claim') return claims(noun);
          return new Response('routed:' + noun);
        },
      }),
    },
  } as unknown as RouteEnv;
  return { env, seen };
}

const req = (path: string, headers: Record<string, string> = {}) => new Request('https://x.test' + path, { headers });

test('anything but the socket path goes to the assets', async () => {
  const { env } = fakeEnv();
  expect(await (await route(req('/almond'), env)).text()).toBe('asset');
});

test('the socket path without an upgrade is 426', async () => {
  const { env } = fakeEnv();
  const response = await route(req('/ws'), env);
  expect(response.status).toBe(426);
  expect(response.headers.get('Upgrade')).toBe('websocket');
});

test('a bare /ws, a bad noun and a reserved or long noun are 400', async () => {
  const { env, seen } = fakeEnv();
  for (const query of ['', '?noun=Bad!', '?noun=assets', '?noun=' + 'a'.repeat(33)]) {
    expect((await route(req('/ws' + query, upgrade), env)).status, query).toBe(400);
  }
  expect(seen).toEqual([]);
});

test('a join goes to the Object of its noun, without the create header even if the client sent one', async () => {
  const { env, seen } = fakeEnv();
  expect(await (await route(req('/ws?noun=camel', { ...upgrade, [CREATE_HEADER]: '1' }), env)).text()).toBe('routed:camel');
  expect(seen[0]!.noun).toBe('camel');
  expect(seen[0]!.headers.get(CREATE_HEADER)).toBeNull();
  expect(seen[0]!.headers.get('Upgrade')).toBe('websocket');
});

test('a create claims a noun, then forwards the upgrade there with ?noun= and the create header', async () => {
  const taken = new Set(['tagine']);
  const { env, seen } = fakeEnv((noun) => new Response(taken.has(noun) ? 'taken' : 'free'));
  const draws = [0, 0.02];
  const response = await route(req('/ws?create=1', upgrade), env, () => draws.shift() ?? 0);
  expect(await response.text()).toBe('routed:camel');
  expect(seen.map((s) => s.noun)).toEqual(['tagine', 'camel', 'camel']);
});

test('a create retries on taken, and answers 503 after 20 failures', async () => {
  const draws = [0, 0, 0.5];
  let i = 0;
  const { env, seen } = fakeEnv((noun) => new Response(seen.filter((s) => s.url.includes('/claim')).length < 3 ? 'taken' : 'free'));
  const ok = await route(req('/ws?create=1', upgrade), env, () => draws[i++] ?? 0);
  expect(await ok.text()).toMatch(/^routed:/);
  const last = seen[seen.length - 1]!;
  expect(new URL(last.url).searchParams.get('noun')).toBe(last.noun);
  expect(new URL(last.url).searchParams.has('create')).toBe(false);
  expect(last.headers.get(CREATE_HEADER)).toBe('1');

  const full = fakeEnv(() => new Response('taken'));
  expect((await route(req('/ws?create=1', upgrade), full.env)).status).toBe(503);
  expect(full.seen).toHaveLength(20);
});

test('a failing claim is an error, not a taken noun', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { env, seen } = fakeEnv(() => new Response('boom', { status: 500 }));
  expect((await route(req('/ws?create=1', upgrade), env)).status).toBe(500);
  expect(seen).toHaveLength(1);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
