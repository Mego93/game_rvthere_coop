import { expect, test } from 'vitest';
import { PLAYER_COLOURS, PLAYER_COLOUR_PATTERN } from './constants';
import {
  ERROR_REASONS,
  NEUTRAL_INPUT,
  cleanName,
  cleanRoom,
  cleanToken,
  neutralInput,
  parseClientMessage,
  parseServerMessage,
  sanitiseInput,
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
const onFoot = {
  playerId: 'p1',
  pos: { x: 1, y: 0, z: 2 },
  yaw: 0.5,
  seat: null,
  hands: null,
  ground: null,
  walk: { x: 1, z: -2 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: true,
};
const seated = { ...onFoot, playerId: 'p2', seat: 'driver' };
const onVehicle = { ...onFoot, playerId: 'p3', ground: { bodyId: 'vehicle', localPos: { x: 0, y: 1, z: 0 } } };
const snapshot = { type: 'snapshot', tick: 30, ackSeq: 7, full: false, vehicle, players: [onFoot] };
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
  const newer = { ...snapshot, extra: 1, players: [{ ...onFoot, health: 3 }] };
  expect(parseServerMessage(JSON.stringify(newer))).toEqual(newer);
});

test('parseServerMessage accepts players on foot, seated and on the vehicle, and keeps their unknown fields', () => {
  const message = { ...snapshot, players: [onFoot, seated, onVehicle, { ...onFoot, playerId: 'p4', hands: [] }] };
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  expect(parseServerMessage(JSON.stringify({ ...snapshot, players: [] }))).not.toBeNull();
});

const withPlayer = (changes: Record<string, unknown>) => JSON.stringify({ ...snapshot, players: [{ ...onFoot, ...changes }] });

test.each([
  ['no players', JSON.stringify({ ...snapshot, players: undefined })],
  ['players that are not a list', JSON.stringify({ ...snapshot, players: { p1: onFoot } })],
  ['players that are null', JSON.stringify({ ...snapshot, players: null })],
  ['a player that is not an object', JSON.stringify({ ...snapshot, players: ['p1'] })],
  ['a player that is null', JSON.stringify({ ...snapshot, players: [null] })],
  ['a player that is an array', JSON.stringify({ ...snapshot, players: [[]] })],
  ['one bad player among good ones', JSON.stringify({ ...snapshot, players: [onFoot, { ...seated, yaw: 'x' }] })],
  ['a player without an id', withPlayer({ playerId: undefined })],
  ['a player whose id is a number', withPlayer({ playerId: 1 })],
  ['a player without a position', withPlayer({ pos: undefined })],
  ['a player whose position lacks z', withPlayer({ pos: { x: 1, y: 0 } })],
  ['a player whose position is too large to be finite', withPlayer({}).replace('"x":1,"y":0', '"x":1e999,"y":0')],
  ['a player whose position is null', withPlayer({ pos: null })],
  ['a player without a yaw', withPlayer({ yaw: undefined })],
  ['a player whose yaw is text', withPlayer({ yaw: '0.5' })],
  ['a player whose yaw is too large to be finite', withPlayer({}).replace('"yaw":0.5', '"yaw":1e999')],
  ['a player without a seat field', withPlayer({ seat: undefined })],
  ['a player whose seat is a number', withPlayer({ seat: 0 })],
  ['a player whose seat is a boolean', withPlayer({ seat: false })],
  ['a player without a ground field', withPlayer({ ground: undefined })],
  ['a player whose ground is text', withPlayer({ ground: 'vehicle' })],
  ['a player whose ground is an array', withPlayer({ ground: [] })],
  ['a player whose ground lacks a body id', withPlayer({ ground: { localPos: { x: 0, y: 0, z: 0 } } })],
  ['a player whose ground body id is a number', withPlayer({ ground: { bodyId: 1, localPos: { x: 0, y: 0, z: 0 } } })],
  ['a player whose ground lacks a local position', withPlayer({ ground: { bodyId: 'vehicle' } })],
  ['a player whose ground position lacks y', withPlayer({ ground: { bodyId: 'vehicle', localPos: { x: 0, z: 0 } } })],
  ['a player whose ground position is null', withPlayer({ ground: { bodyId: 'vehicle', localPos: null } })],
  ['a player without walk', withPlayer({ walk: undefined })],
  ['a player whose walk lacks z', withPlayer({ walk: { x: 1 } })],
  ['a player whose walk is text', withPlayer({ walk: '1' })],
  ['a player whose walk x is too large to be finite', withPlayer({}).replace('"walk":{"x":1', '"walk":{"x":1e999')],
  ['a player without carry', withPlayer({ carry: undefined })],
  ['a player whose carry lacks x', withPlayer({ carry: { z: 0 } })],
  ['a player whose carry is null', withPlayer({ carry: null })],
  ['a player whose carry z is too large to be finite', withPlayer({}).replace('"carry":{"x":0,"z":0}', '"carry":{"x":0,"z":1e999}')],
  ['a player without vy', withPlayer({ vy: undefined })],
  ['a player whose vy is text', withPlayer({ vy: '1' })],
  ['a player whose vy is too large to be finite', withPlayer({}).replace('"vy":0', '"vy":1e999')],
  ['a player without grounded', withPlayer({ grounded: undefined })],
  ['a player whose grounded is a number', withPlayer({ grounded: 1 })],
  ['a player whose grounded is text', withPlayer({ grounded: 'true' })],
])('parseServerMessage rejects a snapshot with %s', (_label, raw) => {
  expect(parseServerMessage(raw)).toBeNull();
});

test.each(['#a05cdc', '#e4572e', '#000000'])('parseServerMessage accepts the lobby colour %s', (colour) => {
  const message = { ...lobby, players: [{ ...lobby.players[0], colour }] };
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
});

test.each(['red', '#fff', '#GGGGGG', '#A05CDC', 'url(x)', '', '#a05cdc;', ' #a05cdc', '#a05cdc00', 5])(
  'parseServerMessage rejects the lobby colour %j',
  (colour) => {
    const message = { ...lobby, players: [{ ...lobby.players[0], colour }] };
    expect(parseServerMessage(JSON.stringify(message))).toBeNull();
  },
);

test.each([
  ['playerId', 5],
  ['name', 5],
  ['colour', 5],
  ['ready', 'yes'],
  ['connected', 1],
  ['playerId', null],
  ['name', null],
  ['ready', null],
  ['connected', null],
])('parseServerMessage rejects a lobby player whose %s is %j', (field, value) => {
  const message = { ...lobby, players: [{ ...lobby.players[0], [field]: value }] };
  expect(parseServerMessage(JSON.stringify(message))).toBeNull();
});

test.each([
  ['room', 5],
  ['phase', 5],
  ['adminId', 5],
  ['courseId', 5],
  ['vehicleId', 5],
  ['players', null],
  ['room', undefined],
  ['courseId', undefined],
  ['vehicleId', undefined],
  ['phase', undefined],
  ['players', undefined],
])('parseServerMessage rejects a lobby whose %s is %j', (field, value) => {
  expect(parseServerMessage(JSON.stringify({ ...lobby, [field]: value }))).toBeNull();
});

test.each(['moveX', 'moveY', 'yaw', 'pitch'])('rejects an input whose %s is too large to be finite', (field) => {
  expect(parseClientMessage(input({}).replace(`"${field}":0`, `"${field}":1e999`))).toBeNull();
  expect(parseClientMessage(input({}).replace(`"${field}":0`, `"${field}":-1e999`))).toBeNull();
});

test('rejects an input whose seq is too large to be finite', () => {
  expect(parseClientMessage(input({}).replace('"seq":1', '"seq":1e999'))).toBeNull();
});

test.each(['moveX', 'moveY', 'yaw', 'pitch', 'seq', 'reel', 'slot'])('rejects an input whose %s is text', (field) => {
  expect(parseClientMessage(input({ [field]: '0' }))).toBeNull();
  expect(parseClientMessage(input({ [field]: '' }))).toBeNull();
});

test.each([
  ['reel', -2],
  ['reel', 2],
  ['reel', 0.5],
  ['slot', -1],
  ['slot', 3],
  ['slot', 1.5],
])('rejects an input whose %s is %j', (field, value) => {
  expect(parseClientMessage(input({ [field]: value }))).toBeNull();
});

test('clamps the axes and the pitch beyond their limits and leaves the limits themselves alone', () => {
  expect(parseClientMessage(input({ moveX: 1.0001, moveY: -1.0001 }))).toMatchObject({ moveX: 1, moveY: -1 });
  expect(parseClientMessage(input({ moveX: 1, moveY: -1, pitch: Math.PI / 2 }))).toMatchObject({
    moveX: 1,
    moveY: -1,
    pitch: Math.PI / 2,
  });
  expect(parseClientMessage(input({ pitch: -Math.PI / 2 }))).toMatchObject({ pitch: -Math.PI / 2 });
  expect(parseClientMessage(input({ pitch: -100 }))).toMatchObject({ pitch: -Math.PI / 2 });
});

test('wraps the yaw into (-PI, PI] and keeps PI itself', () => {
  expect(parseClientMessage(input({ yaw: Math.PI }))).toMatchObject({ yaw: Math.PI });
  expect((parseClientMessage(input({ yaw: -Math.PI })) as PlayerInput).yaw).toBeCloseTo(Math.PI, 9);
  expect((parseClientMessage(input({ yaw: -3 * Math.PI })) as PlayerInput).yaw).toBeCloseTo(Math.PI, 9);
  expect((parseClientMessage(input({ yaw: 2 * Math.PI + 0.25 })) as PlayerInput).yaw).toBeCloseTo(0.25, 9);
  expect((parseClientMessage(input({ yaw: -0.25 })) as PlayerInput).yaw).toBe(-0.25);
});

test('accepts the largest values of reel and slot and the smallest of both', () => {
  expect(parseClientMessage(input({ reel: -1, slot: 0 }))).toMatchObject({ reel: -1, slot: 0 });
  expect(parseClientMessage(input({ reel: 1, slot: 2 }))).toMatchObject({ reel: 1, slot: 2 });
});

test('accepts names of 1 and 16 characters and rejects 0, 17 and only spaces', () => {
  const create = (name: string) => parseClientMessage(JSON.stringify({ type: 'create', name, token: TOKEN }));
  expect(create('a')).toMatchObject({ name: 'a' });
  expect(create('a'.repeat(16))).toMatchObject({ name: 'a'.repeat(16) });
  expect(create('')).toBeNull();
  expect(create('a'.repeat(17))).toBeNull();
  expect(create('                ')).toBeNull();
  expect(cleanName('   ')).toBeNull();
});

test('accepts a room noun of 24 characters and rejects 25', () => {
  const join = (room: string) => parseClientMessage(JSON.stringify({ type: 'join', room, name: 'Amal', token: TOKEN }));
  expect(join('a'.repeat(24))).toMatchObject({ room: 'a'.repeat(24) });
  expect(join('a'.repeat(25))).toBeNull();
  expect(cleanRoom('a'.repeat(24))).toBe('a'.repeat(24));
  expect(cleanRoom('a'.repeat(25))).toBeNull();
});

test('a __proto__ or constructor field does not reach the parsed message or Object.prototype', () => {
  const raws = [
    '{"type":"input","seq":1,"moveX":0,"moveY":0,"yaw":0,"pitch":0,"jump":false,"interact":false,"use":false,"reel":0,"slot":0,"drop":false,"__proto__":{"polluted":true},"constructor":{"polluted":true}}',
    `{"type":"create","name":"Amal","token":"${TOKEN}","__proto__":{"polluted":true},"constructor":"x"}`,
    `{"type":"join","room":"camel","name":"Amal","token":"${TOKEN}","__proto__":{"polluted":true},"constructor":"x"}`,
  ];
  for (const raw of raws) {
    const message = parseClientMessage(raw);
    expect(message).not.toBeNull();
    expect(Object.keys(message as object)).not.toContain('__proto__');
    expect(Object.keys(message as object)).not.toContain('constructor');
    expect(Object.getPrototypeOf(message)).toBe(Object.prototype);
    expect((message as Record<string, unknown>).polluted).toBeUndefined();
  }
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test('every colour the server hands out passes the colour check', () => {
  expect(PLAYER_COLOURS.every((colour) => PLAYER_COLOUR_PATTERN.test(colour))).toBe(true);
});

test('sanitiseInput clamps the axes and pitch and wraps the yaw, leaving the other fields', () => {
  const result = sanitiseInput({ ...NEUTRAL_INPUT, moveX: 3, moveY: -9, pitch: 5, yaw: 3 * Math.PI + 0.5, jump: true, slot: 2 });
  expect(result).toEqual({ ...NEUTRAL_INPUT, moveX: 1, moveY: -1, pitch: Math.PI / 2, yaw: expect.closeTo(-Math.PI + 0.5, 9), jump: true, slot: 2 });
  expect(sanitiseInput({ ...NEUTRAL_INPUT, pitch: -5 }).pitch).toBe(-Math.PI / 2);
  expect(sanitiseInput({ ...NEUTRAL_INPUT, yaw: -Math.PI }).yaw).toBeCloseTo(Math.PI, 12);
  expect(sanitiseInput({ ...NEUTRAL_INPUT, yaw: Math.PI }).yaw).toBe(Math.PI);
});

test('sanitiseInput does not change its argument', () => {
  const raw = { ...NEUTRAL_INPUT, moveX: 3 };
  sanitiseInput(raw);
  expect(raw.moveX).toBe(3);
});

test('parseClientMessage gives the sanitised fields of the raw input', () => {
  const fields = { ...NEUTRAL_INPUT, moveX: 2, moveY: -2, yaw: 7, pitch: -4, reel: 1 as const };
  const { type, seq, ...parsed } = parseClientMessage(input(fields)) as PlayerInput & { type: string };
  expect(parsed).toEqual(sanitiseInput(fields));
});

test('parseServerMessage keeps unknown fields on a player entry', () => {
  const raw = JSON.stringify({ ...snapshot, players: [{ ...onFoot, extra: 5 }] });
  expect(parseServerMessage(raw)).toEqual({ ...snapshot, players: [{ ...onFoot, extra: 5 }] });
});
