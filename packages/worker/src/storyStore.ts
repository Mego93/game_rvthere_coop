import type { WeekStore } from '@lodgy/server/room';

// The part of a Durable Object's storage the store uses.
export interface WeekStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

// One Durable Object holds one room, but the key still carries the noun so that a stray noun can never read another week.
export function createStorageWeekStore(storage: WeekStorage): WeekStore {
  const key = (noun: string) => `week:${noun}`;
  return {
    async load(noun) {
      const value = await storage.get(key(noun));
      return typeof value === 'string' ? value : null;
    },
    save: (noun, json) => storage.put(key(noun), json),
  };
}
