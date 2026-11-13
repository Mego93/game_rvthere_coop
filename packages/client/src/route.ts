import { SOCKET_PATH, cleanRoom } from '@lodgy/shared';

// The room named by the page address: "/camel" gives "camel". The home page and anything else give null.
export function roomFromPath(pathname: string): string | null {
  return cleanRoom(pathname.replace(/^\/+|\/+$/g, ''));
}

// The WebSocket address on the server that served the page.
export function socketUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${SOCKET_PATH}`;
}
