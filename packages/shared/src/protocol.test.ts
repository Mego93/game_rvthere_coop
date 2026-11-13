import { expect, test } from 'vitest';
import {
  ERROR_REASONS,
  NEUTRAL_INPUT,
  cleanName,
  cleanRoom,
  cleanToken,
  neutralInput,
  parseClientMessage,
  parseServerMessage,
  type PlayerInput,
  type ServerMessage,
} from './protocol';

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

test('cleanToken accepts what parseClientMessage accepts as a token', () => {
  expect(cleanToken('abcdefghijklmnop')).toBe('abcdefghijklmnop');
  expect(cleanToken('abcdefghijklmno')).toBeNull();
  expect(cleanToken('abcdefghijklmnop!')).toBeNull();
  expect(cleanToken(null)).toBeNull();
});

const vehicle = {
  pos: { x: 1, y: 2, z: 3 },
  rot: { x: 0, y: 0, z: 0, w: 1 },
  linvel: { x: 0, y: 0, z: -4 },
  throttle: 1,
  steer: 0,
};
const snapshot = { type: 'snapshot', tick: 30, ackSeq: 7, full: false, vehicle };
const lobby = {
  type: 'lobby',
  room: 'camel',
  phase: 'playing',
  players: [{ playerId: 'p1', name: 'Amal', colour: '#e4572e', ready: false, connected: true }],
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'lodgy',
};

test.each<ServerMessage>([
  { type: 'ping' },
  { type: 'welcome', playerId: 'p1', room: 'camel' },
  { type: 'error', reason: 'room_full' },
  lobby as ServerMessage,
  { ...lobby, players: [], adminId: null } as ServerMessage,
  snapshot as ServerMessage,
  { ...snapshot, tick: 0, ackSeq: 0, full: true } as ServerMessage,
])('parseServerMessage accepts %j', (message) => {
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
});

test.each([
  ['text that is not JSON', 'not json'],
  ['null', 'null'],
  ['an array', '[]'],
  ['a number', '5'],
  ['no type', '{}'],
  ['an unknown type', '{"type":"teleport"}'],
  ['a welcome without a room', '{"type":"welcome","playerId":"p1"}'],
  ['an error without a reason', '{"type":"error"}'],
  ['a lobby whose players are not a list', JSON.stringify({ ...lobby, players: 'Amal' })],
  ['a lobby player without a name', JSON.stringify({ ...lobby, players: [{ playerId: 'p1' }] })],
  ['a lobby with an unknown phase', JSON.stringify({ ...lobby, phase: 'paused' })],
  ['a lobby whose admin is a number', JSON.stringify({ ...lobby, adminId: 1 })],
  ['a snapshot without a vehicle', JSON.stringify({ ...snapshot, vehicle: undefined })],
  ['a snapshot whose tick is text', JSON.stringify({ ...snapshot, tick: '30' })],
  ['a snapshot whose tick is null', JSON.stringify({ ...snapshot, tick: null })],
  ['a snapshot whose tick is negative', JSON.stringify({ ...snapshot, tick: -1 })],
  ['a snapshot whose tick is not whole', JSON.stringify({ ...snapshot, tick: 1.5 })],
  ['a snapshot whose tick is too large to be finite', JSON.stringify(snapshot).replace('"tick":30', '"tick":1e999')],
  ['a snapshot whose ackSeq is missing', JSON.stringify({ ...snapshot, ackSeq: undefined })],
  ['a snapshot whose full is not a boolean', JSON.stringify({ ...snapshot, full: 1 })],
  ['a snapshot whose position lacks z', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, pos: { x: 1, y: 2 } } })],
  ['a snapshot whose rotation lacks w', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, rot: { x: 0, y: 0, z: 0 } } })],
  ['a snapshot whose velocity is null', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, linvel: null } })],
  ['a snapshot whose throttle is text', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, throttle: 'full' } })],
])('parseServerMessage rejects %s', (_label, raw) => {
  expect(parseServerMessage(raw)).toBeNull();
});

test('parseServerMessage accepts every error reason the server can send', () => {
  for (const reason of ERROR_REASONS) {
    expect(parseServerMessage(JSON.stringify({ type: 'error', reason }))).toEqual({ type: 'error', reason });
  }
});

test('parseServerMessage shows a reason it does not know as a general refusal', () => {
  expect(parseServerMessage('{"type":"error","reason":"kicked"}')).toEqual({ type: 'error', reason: 'bad_message' });
});

test('parseServerMessage keeps fields it does not know, so a newer server can add to a message', () => {
  const newer = { ...snapshot, players: [{ playerId: 'p1' }] };
  expect(parseServerMessage(JSON.stringify(newer))).toEqual(newer);
});
