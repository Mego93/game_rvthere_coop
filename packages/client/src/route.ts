import { cleanRoom } from '@lodgy/shared';

// The room named by the page address: "/camel" gives "camel". The home page and anything else give null.
export function roomFromPath(pathname: string): string | null {
  return cleanRoom(pathname.replace(/^\/+|\/+$/g, ''));
}
