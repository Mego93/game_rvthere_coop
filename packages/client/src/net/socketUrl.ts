import { SOCKET_PATH } from '@lodgy/shared';

export type SocketIntent = { create: true } | { noun: string } | null;

const NOUN = /^[a-z]+\d*$/;

// The WebSocket address on the server that served the page; the query tells a per-room host which room the socket is for.
export function socketUrl(location: { protocol: string; host: string }, intent: SocketIntent): string {
  const base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${SOCKET_PATH}`;
  if (intent && 'create' in intent) return `${base}?create=1`;
  if (intent && NOUN.test(intent.noun)) return `${base}?noun=${intent.noun}`;
  return base;
}
