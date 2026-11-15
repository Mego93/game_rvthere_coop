import { describe, expect, test } from 'vitest';
import { ITEM_KINDS, PLAYER_COLOURS, PLAYER_COLOUR_PATTERN } from './constants';
import {
  ERROR_REASONS,
  EVENT_KINDS,
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

test('S14: accepts a buy message for each item kind', () => {
  for (const item of Object.keys(ITEM_KINDS)) {
    expect(parseClientMessage(JSON.stringify({ type: 'buy', item }))).toEqual({ type: 'buy', item });
  }
});

test.each([
  ['an unknown item', { type: 'buy', item: 'sword' }],
  ['an inherited key as the item', { type: 'buy', item: 'toString' }],
  ['__proto__ as the item', { type: 'buy', item: '__proto__' }],
  ['a missing item', { type: 'buy' }],
  ['a number as the item', { type: 'buy', item: 1 }],
])('S14: rejects a buy message with %s', (_label, message) => {
  expect(parseClientMessage(JSON.stringify(message))).toBeNull();
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

test('(T9) an input keeps reset when present and leaves it absent when not', () => {
  expect(parseClientMessage(input({ reset: true }))).toEqual({ type: 'input', ...INPUT, reset: true });
  expect(parseClientMessage(input({ reset: false }))).toEqual({ type: 'input', ...INPUT, reset: false });
  const absent = parseClientMessage(input({})) as PlayerInput;
  expect('reset' in absent).toBe(false);
});

test.each([['a number', 1], ['text', 'true'], ['null', null]])('(T9) rejects an input whose reset is %s', (_label, reset) => {
  expect(parseClientMessage(input({ reset }))).toBeNull();
});

test('(T9) the neutral input has no reset', () => {
  expect('reset' in NEUTRAL_INPUT).toBe(false);
  expect('reset' in neutralInput({ ...NEUTRAL_INPUT, reset: true })).toBe(false);
});

test.each(['sprint', 'crouch'] as const)('(T6) an input keeps %s when present and leaves it absent when not', (key) => {
  expect(parseClientMessage(input({ [key]: true }))).toEqual({ type: 'input', ...INPUT, [key]: true });
  expect(parseClientMessage(input({ [key]: false }))).toEqual({ type: 'input', ...INPUT, [key]: false });
  const absent = parseClientMessage(input({})) as PlayerInput;
  expect(key in absent).toBe(false);
  expect(key in NEUTRAL_INPUT).toBe(false);
  expect(key in neutralInput({ ...NEUTRAL_INPUT, [key]: true })).toBe(false);
});

test.each([
  ['sprint', 1],
  ['sprint', 'true'],
  ['sprint', null],
  ['crouch', 1],
  ['crouch', 'true'],
  ['crouch', null],
])('(T6) rejects an input whose %s is %j', (key, value) => {
  expect(parseClientMessage(input({ [key]: value }))).toBeNull();
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
  fuel: 1,
  health: 1,
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
  inventory: [null, 'jerrycan', null],
  slot: 1,
  hold: null,
  health: 100,
  downed: null,
};
const seated = { ...onFoot, playerId: 'p2', seat: 'driver' };
const onVehicle = { ...onFoot, playerId: 'p3', ground: { bodyId: 'vehicle', localPos: { x: 0, y: 1, z: 0 } } };
const crate = { id: 'crate-1', kind: 'crate', pos: { x: 1, y: 0.3, z: 2 }, rot: { x: 0, y: 0, z: 0, w: 1 } };
const cable = { state: 'attached', holderId: null, anchorId: 'anchor-1', hookPos: { x: 1, y: 0.5, z: -20 }, length: 12.5, reel: 1 };
const snapshot = { type: 'snapshot', tick: 30, ackSeq: 7, full: false, vehicle, players: [onFoot], props: [crate], cable, elapsed: 0.5, checkpoint: 0, checkpointCount: 2, restarts: 0, respawns: 0, won: false, coinsLeft: ['coin-1'], wallet: 0, coinsCollected: 1, coinsTotal: 2, assisted: false };
const lobby = {
  type: 'lobby',
  room: 'camel',
  phase: 'playing',
  players: [{ playerId: 'p1', name: 'Amal', colour: '#e4572e', ready: false, connected: true }],
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'lodgy',
  timeOfDay: 'midday',
  weather: 'clear',
};

test.each<ServerMessage>([
  { type: 'ping' },
  { type: 'welcome', playerId: 'p1', room: 'camel' },
  { type: 'error', reason: 'room_full' },
  lobby as ServerMessage,
  { ...lobby, players: [], adminId: null } as ServerMessage,
  snapshot as ServerMessage,
  { ...snapshot, tick: 0, ackSeq: 0, full: true } as ServerMessage,
  { ...snapshot, players: [{ ...onFoot, stance: 'crouch' }] } as ServerMessage,
  { ...snapshot, players: [{ ...onFoot, stance: 'slide', slide: { ticks: 30, cooldown: 0, air: 0, dirX: 0.6, dirZ: -0.8 } }] } as ServerMessage,
  { ...snapshot, players: [{ ...onFoot, slide: { ticks: 0, cooldown: 40, air: 0, dirX: 0, dirZ: 0 } }] } as ServerMessage,
  { ...snapshot, players: [{ ...onFoot, stance: 'roll' }] } as ServerMessage,
  { ...snapshot, vehicle: { ...vehicle, resetReady: true } } as ServerMessage,
  { ...snapshot, elapsed: 61.5, checkpoint: 1, restarts: 2, respawns: 3, won: true } as ServerMessage,
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
  ['a snapshot without assisted', JSON.stringify({ ...snapshot, assisted: undefined })],
  ['a snapshot whose assisted is text', JSON.stringify({ ...snapshot, assisted: 'no' })],
  ['a snapshot without a vehicle', JSON.stringify({ ...snapshot, vehicle: undefined })],
  ['a snapshot whose tick is text', JSON.stringify({ ...snapshot, tick: '30' })],
  ['a snapshot whose tick is null', JSON.stringify({ ...snapshot, tick: null })],
  ['a snapshot whose tick is negative', JSON.stringify({ ...snapshot, tick: -1 })],
  ['a snapshot whose tick is not whole', JSON.stringify({ ...snapshot, tick: 1.5 })],
  ['a snapshot whose tick is too large to be finite', JSON.stringify(snapshot).replace('"tick":30', '"tick":1e999')],
  ['a snapshot without a cable', JSON.stringify({ ...snapshot, cable: undefined })],
  ['a snapshot whose cable is null', JSON.stringify({ ...snapshot, cable: null })],
  ['a cable with an unknown state', JSON.stringify({ ...snapshot, cable: { ...cable, state: 'tangled' } })],
  ['a cable whose holderId is a number', JSON.stringify({ ...snapshot, cable: { ...cable, holderId: 3 } })],
  ['a cable whose holderId is missing', JSON.stringify({ ...snapshot, cable: { ...cable, holderId: undefined } })],
  ['a cable whose anchorId is a number', JSON.stringify({ ...snapshot, cable: { ...cable, anchorId: 3 } })],
  ['a cable whose hookPos lacks z', JSON.stringify({ ...snapshot, cable: { ...cable, hookPos: { x: 1, y: 2 } } })],
  ['a cable whose length is text', JSON.stringify({ ...snapshot, cable: { ...cable, length: '12' } })],
  ['a cable whose length is not finite', JSON.stringify(snapshot).replace('"length":12.5', '"length":1e999')],
  ['a cable whose reel is 2', JSON.stringify({ ...snapshot, cable: { ...cable, reel: 2 } })],
  ['a snapshot without elapsed', JSON.stringify({ ...snapshot, elapsed: undefined })],
  ['a snapshot whose elapsed is negative', JSON.stringify({ ...snapshot, elapsed: -0.1 })],
  ['a snapshot whose elapsed is text', JSON.stringify({ ...snapshot, elapsed: '1' })],
  ['a snapshot whose elapsed is not finite', JSON.stringify(snapshot).replace('"elapsed":0.5', '"elapsed":1e999')],
  ['a snapshot whose checkpoint is negative', JSON.stringify({ ...snapshot, checkpoint: -1 })],
  ['a snapshot whose checkpoint is not whole', JSON.stringify({ ...snapshot, checkpoint: 0.5 })],
  ['a snapshot without checkpointCount', JSON.stringify({ ...snapshot, checkpointCount: undefined })],
  ['a snapshot whose restarts is text', JSON.stringify({ ...snapshot, restarts: '1' })],
  ['a snapshot whose respawns is negative', JSON.stringify({ ...snapshot, respawns: -1 })],
  ['a snapshot whose coinsLeft is not an array', JSON.stringify({ ...snapshot, coinsLeft: 'coin-1' })],
  ['a snapshot whose coinsLeft holds a number', JSON.stringify({ ...snapshot, coinsLeft: [1] })],
  ['a snapshot with more coinsLeft than coinsTotal', JSON.stringify({ ...snapshot, coinsLeft: ['a', 'b', 'c'] })],
  ['a snapshot whose wallet is negative', JSON.stringify({ ...snapshot, wallet: -1 })],
  ['a snapshot whose coinsTotal is text', JSON.stringify({ ...snapshot, coinsTotal: '2' })],
  ['a snapshot whose coinsCollected exceeds coinsTotal', JSON.stringify({ ...snapshot, coinsCollected: 3 })],
  ['a snapshot without won', JSON.stringify({ ...snapshot, won: undefined })],
  ['a snapshot whose won is a number', JSON.stringify({ ...snapshot, won: 1 })],
  ['a snapshot whose ackSeq is missing', JSON.stringify({ ...snapshot, ackSeq: undefined })],
  ['a snapshot whose full is not a boolean', JSON.stringify({ ...snapshot, full: 1 })],
  ['a snapshot whose position lacks z', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, pos: { x: 1, y: 2 } } })],
  ['a snapshot whose rotation lacks w', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, rot: { x: 0, y: 0, z: 0 } } })],
  ['a snapshot whose velocity is null', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, linvel: null } })],
  ['a vehicle without fuel', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, fuel: undefined } })],
  ['a vehicle whose fuel is text', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, fuel: '1' } })],
  ['a vehicle whose health is too large to be finite', JSON.stringify(snapshot).replace('"health":1', '"health":1e999')],
  ['a player whose stance is a number', JSON.stringify({ ...snapshot, players: [{ ...onFoot, stance: 1 }] })],
  ['a player whose slide is text', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: 'on' }] })],
  ['a player whose slide ticks are negative', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: { ticks: -1, cooldown: 0, air: 0, dirX: 0, dirZ: 0 } }] })],
  ['a player whose slide ticks are not whole', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: { ticks: 1.5, cooldown: 0, air: 0, dirX: 0, dirZ: 0 } }] })],
  ['a player whose slide cooldown is missing', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: { ticks: 1, air: 0, dirX: 0, dirZ: 0 } }] })],
  ['a player whose slide air is negative', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: { ticks: 1, cooldown: 0, air: -1, dirX: 0, dirZ: 0 } }] })],
  ['a player whose slide direction is not finite', JSON.stringify({ ...snapshot, players: [{ ...onFoot, slide: { ticks: 1, cooldown: 0, air: 0, dirX: 1e999, dirZ: 0 } }] })],
  ['a player without health', JSON.stringify({ ...snapshot, players: [{ ...onFoot, health: undefined }] })],
  ['a player whose health is negative', JSON.stringify({ ...snapshot, players: [{ ...onFoot, health: -1 }] })],
  ['a player whose health is over 100', JSON.stringify({ ...snapshot, players: [{ ...onFoot, health: 101 }] })],
  ['a player whose health is NaN', JSON.stringify({ ...snapshot, players: [{ ...onFoot, health: Number.NaN }] })],
  ['a player whose health is text', JSON.stringify({ ...snapshot, players: [{ ...onFoot, health: '100' }] })],
  ['a player without downed', JSON.stringify({ ...snapshot, players: [{ ...onFoot, downed: undefined }] })],
  ['a player whose downed is negative', JSON.stringify({ ...snapshot, players: [{ ...onFoot, downed: -1 }] })],
  ['a player whose downed is text', JSON.stringify({ ...snapshot, players: [{ ...onFoot, downed: '30' }] })],
  ['a player whose downed is too large to be finite', JSON.stringify({ ...snapshot, players: [{ ...onFoot, downed: 1 }] }).replace('"downed":1', '"downed":1e999')],
  ['a vehicle whose resetReady is text', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, resetReady: 'yes' } })],
  ['a snapshot whose throttle is text', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, throttle: 'full' } })],
])('parseServerMessage rejects %s', (_label, raw) => {
  expect(parseServerMessage(raw)).toBeNull();
});

test('C1: parseServerMessage accepts a downed player and fractional health', () => {
  const downed = { ...onFoot, health: 0, downed: 29.5 };
  const hurt = { ...onFoot, playerId: 'p2', health: 12.5 };
  const parsed = parseServerMessage(JSON.stringify({ ...snapshot, players: [downed, hurt] }));
  expect(parsed).toMatchObject({ type: 'snapshot', players: [{ health: 0, downed: 29.5 }, { health: 12.5, downed: null }] });
});

test('parseServerMessage accepts every error reason the server can send', () => {
  for (const reason of ERROR_REASONS) {
    expect(parseServerMessage(JSON.stringify({ type: 'error', reason }))).toEqual({ type: 'error', reason });
  }
});

test('S14: cannot_buy is an error reason the page can receive', () => {
  expect(parseServerMessage('{"type":"error","reason":"cannot_buy"}')).toEqual({ type: 'error', reason: 'cannot_buy' });
});

test('parseServerMessage shows a reason it does not know as a general refusal', () => {
  expect(parseServerMessage('{"type":"error","reason":"banned"}')).toEqual({ type: 'error', reason: 'bad_message' });
});

test('parseServerMessage keeps fields it does not know, so a newer server can add to a message', () => {
  const newer = { ...snapshot, extra: 1, players: [{ ...onFoot, health: 3 }] };
  expect(parseServerMessage(JSON.stringify(newer))).toEqual(newer);
});

test('parseServerMessage accepts players on foot, seated and on the vehicle, and keeps their unknown fields', () => {
  const message = { ...snapshot, players: [onFoot, seated, onVehicle, { ...onFoot, playerId: 'p4', hands: 'crate-1' }] };
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  expect(parseServerMessage(JSON.stringify({ ...snapshot, players: [] }))).not.toBeNull();
});

test('parseServerMessage accepts every cable state with null or text ids', () => {
  for (const state of ['stowed', 'held', 'ground', 'attached']) {
    const message = { ...snapshot, cable: { ...cable, state, holderId: 'p1', anchorId: null, reel: -1 } };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  }
});

test('parseServerMessage accepts an inventory of kinds and a hold in progress', () => {
  const holding = { ...onFoot, inventory: ['jerrycan', 'toolbox', 'newer-kind'], hold: { action: 'useItem', targetId: 'vehicle', progress: 0.4 } };
  const message = { ...snapshot, players: [holding] };
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
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
  ['a player without an inventory', withPlayer({ inventory: undefined })],
  ['an inventory that is not a list', withPlayer({ inventory: 'jerrycan' })],
  ['an inventory of two', withPlayer({ inventory: [null, null] })],
  ['an inventory of four', withPlayer({ inventory: [null, null, null, null] })],
  ['an inventory with a number in it', withPlayer({ inventory: [null, 3, null] })],
  ['a player without a slot', withPlayer({ slot: undefined })],
  ['a player whose slot is 3', withPlayer({ slot: 3 })],
  ['a player whose slot is -1', withPlayer({ slot: -1 })],
  ['a player whose slot is text', withPlayer({ slot: '1' })],
  ['a player without a hold field', withPlayer({ hold: undefined })],
  ['a hold that is a string', withPlayer({ hold: 'useItem' })],
  ['a hold without an action', withPlayer({ hold: { targetId: 'vehicle', progress: 0.5 } })],
  ['a hold without a target', withPlayer({ hold: { action: 'useItem', progress: 0.5 } })],
  ['a hold whose progress is text', withPlayer({ hold: { action: 'useItem', targetId: 'vehicle', progress: '0.5' } })],
  ['a hold whose progress is not finite', withPlayer({ hold: { action: 'useItem', targetId: 'vehicle', progress: 0.5 } }).replace('"progress":0.5', '"progress":1e999')],
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
  ['a player without a hands field', withPlayer({ hands: undefined })],
  ['a player whose hands is a number', withPlayer({ hands: 3 })],
  ['a player whose hands is an array', withPlayer({ hands: [] })],
  ['no props', JSON.stringify({ ...snapshot, props: undefined })],
  ['props that are not a list', JSON.stringify({ ...snapshot, props: { crate } })],
  ['a prop that is null', JSON.stringify({ ...snapshot, props: [null] })],
  ['a prop without an id', JSON.stringify({ ...snapshot, props: [{ ...crate, id: undefined }] })],
  ['a prop whose kind is a number', JSON.stringify({ ...snapshot, props: [{ ...crate, kind: 1 }] })],
  ['a prop whose position lacks z', JSON.stringify({ ...snapshot, props: [{ ...crate, pos: { x: 0, y: 0 } }] })],
  ['a prop whose rotation lacks w', JSON.stringify({ ...snapshot, props: [{ ...crate, rot: { x: 0, y: 0, z: 0 } }] })],
  ['one bad prop among good ones', JSON.stringify({ ...snapshot, props: [crate, { ...crate, id: 5 }] })],
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
  ['timeOfDay', 'noon'],
  ['weather', 'fog'],
  ['timeOfDay', undefined],
  ['weather', undefined],
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

test('parseServerMessage keeps unknown fields on a prop entry and accepts an empty list', () => {
  const message = { ...snapshot, props: [{ ...crate, spin: 2 }] };
  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  expect(parseServerMessage(JSON.stringify({ ...snapshot, props: [] }))).not.toBeNull();
});

describe('L16: lobby messages', () => {
  const COURSE = 'segment-demo';
  const configure = { type: 'configure', courseId: COURSE, vehicleId: 'rv', timeOfDay: 'night', weather: 'sandstorm' };
  const parse = (message: unknown) => parseClientMessage(JSON.stringify(message));

  test.each<unknown>([
    { type: 'ready', ready: true },
    { type: 'ready', ready: false },
    configure,
    { type: 'kick', playerId: 'p2' },
    { type: 'start' },
    { type: 'restartCheckpoint' },
    { type: 'restartCourse' },
    { type: 'adminTool', tool: 'skipCheckpoint' },
    { type: 'adminTool', tool: 'refill' },
    { type: 'toLobby' },
    { type: 'next' },
  ])('parseClientMessage accepts %j', (message) => {
    expect(parse(message)).toEqual(message);
  });

  test.each<unknown>([
    { type: 'ready' },
    { type: 'ready', ready: 'yes' },
    { ...configure, courseId: 'nowhere' },
    { ...configure, courseId: 5 },
    { ...configure, vehicleId: 'tank' },
    { ...configure, timeOfDay: 'noon' },
    { ...configure, weather: 'fog' },
    { ...configure, weather: undefined },
    { type: 'kick' },
    { type: 'kick', playerId: 5 },
    { type: 'kick', playerId: '' },
    { type: 'adminTool' },
    { type: 'adminTool', tool: 'godmode' },
  ])('parseClientMessage rejects %j', (message) => {
    expect(parse(message)).toBeNull();
  });

  const results = {
    type: 'results',
    courseId: 'test',
    vehicleId: 'lodgy',
    timeOfDay: 'midday',
    weather: 'clear',
    elapsed: 61.5,
    restarts: 1,
    respawns: 0,
    wallet: 2,
    coinsCollected: 3,
    coinsTotal: 4,
    finalTime: 111.5,
    stars: [false, true, false],
    assisted: false,
  };

  test.each<unknown>([results, { ...results, campaignTotal: 250.5 }, { ...results, assisted: true, stars: [false, false, false] }])(
    'parseServerMessage accepts the results %j',
    (message) => {
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
    },
  );

  test.each<[string, unknown]>([
    ['courseId', 5],
    ['vehicleId', undefined],
    ['timeOfDay', 'noon'],
    ['weather', undefined],
    ['elapsed', -1],
    ['elapsed', 'x'],
    ['restarts', 1.5],
    ['respawns', -1],
    ['wallet', null],
    ['coinsCollected', 5],
    ['coinsTotal', 'x'],
    ['finalTime', -2],
    ['stars', [true, true]],
    ['stars', [true, true, 1]],
    ['stars', 'all'],
    ['assisted', undefined],
    ['assisted', 1],
    ['campaignTotal', 'x'],
    ['campaignTotal', null],
  ])('parseServerMessage rejects results whose %s is %j', (field, value) => {
    expect(parseServerMessage(JSON.stringify({ ...results, [field]: value }))).toBeNull();
  });

  test('results with a non-finite time is rejected', () => {
    expect(parseServerMessage(JSON.stringify(results).replace('"finalTime":111.5', '"finalTime":1e999'))).toBeNull();
  });
});

describe('L14: the name rule', () => {
  const create = (name: string) => parseClientMessage(JSON.stringify({ type: 'create', name, token: TOKEN }));
  const join = (name: string) => parseClientMessage(JSON.stringify({ type: 'join', room: 'camel', name, token: TOKEN }));

  test.each(['a\u0000b', 'a\nb', 'a\u200bb', 'a\u2028b', 'a\u2029b', 'a\ue000b', 'a\u0378b'])('create and join refuse %j', (name) => {
    expect(create(name)).toBeNull();
    expect(join(name)).toBeNull();
    expect(cleanName(name)).toBeNull();
  });

  test('a name of only a space is trimmed away', () => {
    expect(cleanName(' ')).toBeNull();
  });

  test.each(['Amal', 'Ünal'])('create and join accept %s', (name) => {
    expect(create(name)).toMatchObject({ name });
    expect(join(name)).toMatchObject({ name });
  });
});

describe('E1: the event message', () => {
  const parse = (value: unknown) => parseServerMessage(JSON.stringify(value));

  test.each(EVENT_KINDS)('parses kind %s', (kind) => {
    const message = { type: 'event', kind, tick: 12, playerId: 'p1', pos: { x: 1, y: 2, z: 3 } };
    expect(parse(message)).toEqual(message);
  });

  test('accepts a missing playerId and a missing pos', () => {
    expect(parse({ type: 'event', kind: 'checkpoint', tick: 0 })).toEqual({ type: 'event', kind: 'checkpoint', tick: 0 });
  });

  test.each([
    ['an unknown kind', { type: 'event', kind: 'explosion', tick: 1 }],
    ['a missing kind', { type: 'event', tick: 1 }],
    ['a missing tick', { type: 'event', kind: 'hurt' }],
    ['a negative tick', { type: 'event', kind: 'hurt', tick: -1 }],
    ['a fractional tick', { type: 'event', kind: 'hurt', tick: 1.5 }],
    ['a pos that is not a vec3', { type: 'event', kind: 'hurt', tick: 1, pos: { x: 1, y: 2 } }],
    ['a pos with text', { type: 'event', kind: 'hurt', tick: 1, pos: { x: 1, y: 2, z: '3' } }],
    ['a pos that is a number', { type: 'event', kind: 'hurt', tick: 1, pos: 5 }],
    ['a playerId that is a number', { type: 'event', kind: 'hurt', tick: 1, playerId: 7 }],
  ])('rejects %s', (_label, message) => {
    expect(parse(message)).toBeNull();
  });
});
