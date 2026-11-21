import type { WeekStore } from './types';

export function createMemoryWeekStore(): WeekStore {
  const weeks = new Map<string, string>();
  return {
    load: async (noun) => weeks.get(noun) ?? null,
    save: async (noun, json) => {
      weeks.set(noun, json);
    },
  };
}
