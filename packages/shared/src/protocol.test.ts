import { expect, test } from 'vitest';
import { NEUTRAL_INPUT, cleanName, cleanRoom, neutralInput, parseClientMessage, type PlayerInput } from './protocol';

const TOKEN = 'abcdefghijklmnop';
const INPUT: PlayerInput = { ...NEUTRAL_INPUT, seq: 1 };
const input = (changes: Record<string, unknown>) => JSON.stringify({ type: 'input', ...INPUT, ...changes });

test('accepts a create message and trims the name', () => {
  expect(parseClientMessage(JSON.stringify({ type: 'create', name: '  Amal ', token: TOKEN }))).toEqual({
    type: 'create',
    name: 'Amal',
    token: TOKEN,
  });
});

test('accepts a join message and lower-cases the room', () => {
  expect(parseClientMessage(JSON.stringify({ type: 'join', room: 'Camel', name: 'Amal', token: TOKEN }))).toEqual({
    type: 'join',
    room: 'camel',
    name: 'Amal',
    token: TOKEN,
  });
});

test('accepts pong', () => {
  expect(parseClientMessage('{"type":"pong"}')).toEqual({ type: 'pong' });
});

test.each([
  ['not JSON', 'nope'],
  ['a JSON array', '[]'],
  ['a JSON string', '"create"'],
  ['null', 'null'],
  ['an unknown type', '{"type":"dance"}'],
  ['a missing type', '{"name":"Amal"}'],
  ['an empty name', JSON.stringify({ type: 'create', name: '   ', token: TOKEN })],
  ['a 17-character name', JSON.stringify({ type: 'create', name: 'a'.repeat(17), token: TOKEN })],
  ['a name that is not a string', JSON.stringify({ type: 'create', name: 7, token: TOKEN })],
  ['a short token', JSON.stringify({ type: 'create', name: 'Amal', token: 'short' })],
  ['a token with a space', JSON.stringify({ type: 'create', name: 'Amal', token: 'abcdefgh ijklmnop' })],
  ['a room with a slash', JSON.stringify({ type: 'join', room: 'a/b', name: 'Amal', token: TOKEN })],
  ['an empty room', JSON.stringify({ type: 'join', room: '', name: 'Amal', token: TOKEN })],
])('rejects %s', (_label, raw) => {
  expect(parseClientMessage(raw)).toBeNull();
});

test('accepts an input and keeps its fields', () => {
  const raw = input({ seq: 42, moveX: 0.5, moveY: -0.25, jump: true, reel: -1, slot: 2 });
  expect(parseClientMessage(raw)).toEqual({
    type: 'input',
    ...INPUT,
    seq: 42,
    moveX: 0.5,
    moveY: -0.25,
    jump: true,
    reel: -1,
    slot: 2,
  });
});

test('clamps the axes and the pitch, and wraps the yaw', () => {
  const message = parseClientMessage(input({ moveX: 3, moveY: -9, pitch: 5, yaw: 3 * Math.PI + 0.5 }));
  expect(message).toMatchObject({ moveX: 1, moveY: -1, pitch: Math.PI / 2 });
  expect((message as PlayerInput).yaw).toBeCloseTo(-Math.PI + 0.5, 9);
});

test.each([
  ['a seq of 0', { seq: 0 }],
  ['a fractional seq', { seq: 1.5 }],
  ['a string seq', { seq: '1' }],
  ['a null axis (how JSON carries NaN)', { moveY: null }],
  ['a string axis', { moveX: '1' }],
  ['a number for a button', { jump: 1 }],
  ['a reel of 2', { reel: 2 }],
  ['a slot of 3', { slot: 3 }],
  ['a missing field', { drop: undefined }],
])('rejects an input with %s', (_label, changes) => {
  expect(parseClientMessage(input(changes))).toBeNull();
});

test('rejects an input whose number is too large to be finite', () => {
  expect(parseClientMessage(input({}).replace('"moveY":0', '"moveY":1e999'))).toBeNull();
});

test('cleanName and cleanRoom return null for bad values', () => {
  expect(cleanName(' Amal ')).toBe('Amal');
  expect(cleanName('')).toBeNull();
  expect(cleanRoom(' Tagine ')).toBe('tagine');
  expect(cleanRoom('tag ine')).toBeNull();
  expect(cleanRoom('constructor.')).toBeNull();
});

test('a neutral input releases everything but keeps the aim and the slot', () => {
  const last = { ...NEUTRAL_INPUT, moveY: 1, jump: true, yaw: 1.2, pitch: -0.3, slot: 2 as const, reel: 1 as const };
  expect(neutralInput(last)).toEqual({ ...NEUTRAL_INPUT, yaw: 1.2, pitch: -0.3, slot: 2 });
});

test('the shared neutral input cannot be modified', () => {
  expect(() => {
    (NEUTRAL_INPUT as { moveX: number }).moveX = 1;
  }).toThrow(TypeError);
});
