import { parseClientMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { autoReloadAllowed, createMemoryStore, lastAutoReload, markAutoReload, saveName, savedName, saveRejoin, sessionToken, takeRejoin } from './session';

const countUp = (bytes: Uint8Array) => bytes.forEach((_, index) => (bytes[index] = index * 17));

test('makes a token from 16 random bytes and keeps it', () => {
  const store = createMemoryStore();
  const token = sessionToken(store, countUp);
  expect(token).toBe('00112233445566778899aabbccddeeff');
  expect(sessionToken(store, () => {
    throw new Error('must not ask for random bytes again');
  })).toBe(token);
});

test('the token is one the server accepts', () => {
  const token = sessionToken(createMemoryStore(), countUp);
  expect(parseClientMessage(JSON.stringify({ type: 'create', name: 'Amal', token }))).not.toBeNull();
});

test('different stores get different tokens', () => {
  const a = sessionToken(createMemoryStore(), (bytes) => bytes.fill(1));
  const b = sessionToken(createMemoryStore(), (bytes) => bytes.fill(2));
  expect(a).not.toBe(b);
});

test('remembers the last name used', () => {
  const store = createMemoryStore();
  expect(savedName(store)).toBe('');
  saveName(store, 'Amal');
  expect(savedName(store)).toBe('Amal');
});

test('a stored token the server would refuse is replaced', () => {
  const store = createMemoryStore();
  for (const bad of ['short', 'has spaces in it, which is not allowed', 'x'.repeat(65)]) {
    store.setItem('lodgy.token', bad);
    expect(sessionToken(store, countUp)).toBe('00112233445566778899aabbccddeeff');
    expect(store.getItem('lodgy.token')).toBe('00112233445566778899aabbccddeeff');
  }
});

test('a store that refuses writes still gives a token, and saving a name does not throw', () => {
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  expect(sessionToken(refusing, countUp)).toBe('00112233445566778899aabbccddeeff');
  expect(() => saveName(refusing, 'Amal')).not.toThrow();
});

test('S1: a saved rejoin is taken once, with the name', () => {
  const store = createMemoryStore();
  saveRejoin(store, { room: 'camel', name: 'Badr', at: 5 });
  expect(takeRejoin(store, 'camel')).toEqual({ name: 'Badr' });
  expect(takeRejoin(store, 'camel')).toBeNull();
});

test('S2: a rejoin for another room, or from a page with no room, returns null and is cleared', () => {
  const store = createMemoryStore();
  saveRejoin(store, { room: 'camel', name: 'Badr', at: 5 });
  expect(takeRejoin(store, 'tent')).toBeNull();
  expect(takeRejoin(store, 'camel')).toBeNull();
  saveRejoin(store, { room: 'camel', name: 'Badr', at: 5 });
  expect(takeRejoin(store, null)).toBeNull();
  expect(store.getItem('lodgy.rejoin')).toBe('');
});

test('S3: malformed values return null', () => {
  for (const bad of ['{', 'null', '[]', '{"room":"camel"}', '{"room":1,"name":"A"}', '{"room":"camel","name":""}']) {
    const store = createMemoryStore();
    store.setItem('lodgy.rejoin', bad);
    expect(takeRejoin(store, 'camel')).toBeNull();
  }
});

test('S4: the reload time survives taking the rejoin', () => {
  const store = createMemoryStore();
  expect(lastAutoReload(store)).toBeNull();
  markAutoReload(store, 1234);
  saveRejoin(store, { room: 'camel', name: 'Badr', at: 1234 });
  takeRejoin(store, 'camel');
  expect(lastAutoReload(store)).toBe(1234);
});

test('the reload guard allows a first reload, blocks a quick second, and treats a mark from the future as stale', () => {
  const store = createMemoryStore();
  expect(autoReloadAllowed(store, 1000, 10_000)).toBe(true);
  markAutoReload(store, 1000);
  expect(autoReloadAllowed(store, 5000, 10_000)).toBe(false);
  expect(autoReloadAllowed(store, 11_000, 10_000)).toBe(true);
  expect(autoReloadAllowed(store, 500, 10_000)).toBe(true);
});
