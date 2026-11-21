import { newWeek, parseWeek, serialiseWeek } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createStorageWeekStore, type WeekStorage } from './storyStore';

function fakeStorage() {
  const data = new Map<string, unknown>();
  const storage: WeekStorage = {
    get: async (key) => data.get(key),
    put: async (key, value) => {
      data.set(key, value);
    },
  };
  return { storage, data };
}

test('a week that was never saved loads as null', async () => {
  expect(await createStorageWeekStore(fakeStorage().storage).load('camel')).toBeNull();
});

test('a saved week loads as the same json, under a key with the noun', async () => {
  const { storage, data } = fakeStorage();
  const store = createStorageWeekStore(storage);
  const json = serialiseWeek({ ...newWeek(), day: 3 });
  await store.save('camel', json);
  expect([...data.keys()]).toEqual(['week:camel']);
  expect(await store.load('camel')).toBe(json);
  expect(parseWeek((await store.load('camel'))!)!.day).toBe(3);
  expect(await store.load('goat')).toBeNull();
});

test('a stored value that is not a string loads as null, so the room starts a new week', async () => {
  const { storage, data } = fakeStorage();
  data.set('week:camel', { day: 1 });
  expect(await createStorageWeekStore(storage).load('camel')).toBeNull();
});

test('a failing storage rejects, for the room to log', async () => {
  const store = createStorageWeekStore({ get: () => Promise.reject(new Error('down')), put: () => Promise.reject(new Error('full')) });
  await expect(store.load('camel')).rejects.toThrow('down');
  await expect(store.save('camel', '{}')).rejects.toThrow('full');
});
