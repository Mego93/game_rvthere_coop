import { parseClientMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createMemoryStore, saveName, savedName, sessionToken } from './session';

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
