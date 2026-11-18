import { describe, expect, test } from 'vitest';
import { CHAT_MAX_LENGTH, CHAT_PHRASES } from './constants';
import { parseClientMessage, parseServerMessage, type ServerMessage } from './protocol';

const chat = (text: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ type: 'chat', text, ...extra });

describe('client chat', () => {
  test('is accepted and trimmed', () => {
    expect(parseClientMessage(chat('  Go go go  '))).toEqual({ type: 'chat', text: 'Go go go' });
  });

  test('120 characters are accepted and 121 are not', () => {
    expect(parseClientMessage(chat('a'.repeat(CHAT_MAX_LENGTH)))).toEqual({ type: 'chat', text: 'a'.repeat(CHAT_MAX_LENGTH) });
    expect(parseClientMessage(chat('a'.repeat(CHAT_MAX_LENGTH + 1)))).toBeNull();
  });

  test('the length is counted by code points', () => {
    expect(parseClientMessage(chat('😀'.repeat(CHAT_MAX_LENGTH)))).not.toBeNull();
    expect(parseClientMessage(chat('😀'.repeat(CHAT_MAX_LENGTH + 1)))).toBeNull();
  });

  test.each([
    ['empty text', chat('')],
    ['whitespace only', chat('   ')],
    ['a newline', chat('a\nb')],
    ['a control character', chat('a\u0007b')],
    ['a tab', chat('a\tb')],
    ['a zero-width joiner', chat('a‍b')],
    ['a number', chat(5)],
    ['no text', JSON.stringify({ type: 'chat' })],
    ['null text', chat(null)],
  ])('with %s is rejected', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  test('extra fields such as a name are dropped', () => {
    expect(parseClientMessage(chat('hi', { name: 'Mallory', playerId: 'p9' }))).toEqual({ type: 'chat', text: 'hi' });
  });
});

describe('server chat', () => {
  test('is accepted', () => {
    const message: ServerMessage = { type: 'chat', id: 1, playerId: 'p1', name: 'Amal', text: 'hi', at: 12 };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  test('accepts the optional replay flag, and rejects a non-boolean one', () => {
    const message = { type: 'chat', id: 1, playerId: 'p1', name: 'Amal', text: 'hi', at: 12 };
    expect(parseServerMessage(JSON.stringify({ ...message, replay: true }))).toEqual({ ...message, replay: true });
    expect(parseServerMessage(JSON.stringify({ ...message, replay: 'yes' }))).toBeNull();
  });

  test.each([
    ['no id', { id: undefined }],
    ['a negative id', { id: -1 }],
    ['a fractional id', { id: 1.5 }],
    ['a text id', { id: '1' }],
    ['a numeric playerId', { playerId: 1 }],
    ['no name', { name: undefined }],
    ['numeric text', { text: 5 }],
    ['a negative at', { at: -1 }],
    ['a fractional at', { at: 1.5 }],
  ])('with %s is rejected', (_label, changes) => {
    const message = { type: 'chat', id: 1, playerId: 'p1', name: 'Amal', text: 'hi', at: 12, ...changes };
    expect(parseServerMessage(JSON.stringify(message))).toBeNull();
  });
});

test('CHAT_PHRASES are the nine quick phrases, frozen and all valid', () => {
  expect([...CHAT_PHRASES]).toEqual(['Ready!', 'Wait for me', 'Go go go', 'Slow down', 'Need fuel', 'Need a repair', 'Use the winch', 'Thanks!', 'Le mal est fait']);
  expect(Object.isFrozen(CHAT_PHRASES)).toBe(true);
  for (const phrase of CHAT_PHRASES) expect(parseClientMessage(chat(phrase))).toEqual({ type: 'chat', text: phrase });
});
