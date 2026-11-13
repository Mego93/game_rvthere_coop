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

// The token that identifies this tab to the server. It is made once and kept in the given store.
export function sessionToken(store: KeyValueStore, fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const existing = store.getItem(TOKEN_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  store.setItem(TOKEN_KEY, token);
  return token;
}

export const savedName = (store: KeyValueStore): string => store.getItem(NAME_KEY) ?? '';

export const saveName = (store: KeyValueStore, name: string): void => store.setItem(NAME_KEY, name);
