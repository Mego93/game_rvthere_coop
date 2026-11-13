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
