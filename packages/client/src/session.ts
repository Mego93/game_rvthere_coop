import { cleanName, cleanRoom, cleanToken } from '@lodgy/shared';

const TOKEN_KEY = 'lodgy.token';
const NAME_KEY = 'lodgy.name';

// The part of the Web Storage interface this module uses.
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Used when the browser refuses access to storage, as some private modes do.
export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

// Storage can refuse a write (it is full, or a private mode forbids it); the value is then not remembered.
function remember(store: KeyValueStore, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    return;
  }
}

// The token that identifies this tab to the server. It is made once and kept in the given store.
export function sessionToken(store: KeyValueStore, fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  // A stored value the server would refuse is replaced; with it, this tab could never join a room.
  const existing = cleanToken(store.getItem(TOKEN_KEY));
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  remember(store, TOKEN_KEY, token);
  return token;
}

export const savedName = (store: KeyValueStore): string => store.getItem(NAME_KEY) ?? '';

export const saveName = (store: KeyValueStore, name: string): void => remember(store, NAME_KEY, name);

const MUTED_KEY = 'lodgy.muted';

export const savedMuted = (store: KeyValueStore): boolean => store.getItem(MUTED_KEY) === '1';

export const saveMuted = (store: KeyValueStore, muted: boolean): void => remember(store, MUTED_KEY, muted ? '1' : '0');

const REJOIN_KEY = 'lodgy.rejoin';
const RELOADED_KEY = 'lodgy.reloadedAt';

export const saveRejoin = (store: KeyValueStore, rejoin: { room: string; name: string; playerId: string; at: number }): void =>
  remember(store, REJOIN_KEY, JSON.stringify(rejoin));

// Reads the saved rejoin and clears it, so a failed rejoin is not tried again on the next load.
export function takeRejoin(store: KeyValueStore, room: string | null): { name: string; playerId: string } | null {
  const raw = store.getItem(REJOIN_KEY);
  if (!raw) return null;
  remember(store, REJOIN_KEY, '');
  try {
    const value = JSON.parse(raw) as { room?: unknown; name?: unknown; playerId?: unknown };
    if (typeof value.room !== 'string' || typeof value.name !== 'string' || typeof value.playerId !== 'string' || value.playerId === '') return null;
    if (room === null || cleanRoom(value.room) !== room) return null;
    const name = cleanName(value.name);
    return name ? { name, playerId: value.playerId } : null;
  } catch {
    return null;
  }
}

export function lastAutoReload(store: KeyValueStore): number | null {
  const value = Number(store.getItem(RELOADED_KEY));
  return store.getItem(RELOADED_KEY) !== null && Number.isFinite(value) ? value : null;
}

// A mark from the future (the clock went backwards) is stale.
export function autoReloadAllowed(store: KeyValueStore, at: number, guard: number): boolean {
  const last = lastAutoReload(store);
  return last === null || at < last || at - last >= guard;
}

export const markAutoReload = (store: KeyValueStore, at: number): void => remember(store, RELOADED_KEY, String(at));
