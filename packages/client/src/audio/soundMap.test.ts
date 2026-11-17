import { EVENT_KINDS, type EventMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { SOUND_FILES, isMuteKey, soundFor } from './soundMap';

const POS = { x: 1, y: 2, z: 3 };
const event = (kind: EventMessage['kind'], extra: Partial<EventMessage> = {}) => ({ kind, ...extra });

test('E4: every row of the table maps to its sound', () => {
  const expected: Record<string, string | null> = {
    impact: 'impact',
    checkpoint: 'checkpoint',
    vehicleLost: 'vehicleLost',
    pickup: 'pickup',
    buy: 'purchase',
    use: 'use',
    hookAttach: 'hookAttach',
    hookDetach: 'hookAttach',
    coin: 'coin',
    hurt: 'hurt',
    downed: 'downed',
    revive: 'revive',
    respawn: null,
    goatHit: null,
    scooterHit: null,
  };
  for (const kind of EVENT_KINDS) expect(soundFor(event(kind, { pos: POS, playerId: 'other' }), 'me')?.kind ?? null, kind).toBe(expected[kind]);
});

test('E4: a remote event with a position is positional; a local one or one without a position is not', () => {
  expect(soundFor(event('hurt', { pos: POS, playerId: 'other' }), 'me')).toEqual({ kind: 'hurt', positional: true });
  expect(soundFor(event('hurt', { pos: POS, playerId: 'me' }), 'me')).toEqual({ kind: 'hurt', positional: false });
  expect(soundFor(event('impact', { pos: POS }), 'me')).toEqual({ kind: 'impact', positional: true });
  expect(soundFor(event('hurt', { playerId: 'other' }), 'me')).toEqual({ kind: 'hurt', positional: false });
});

test('E4: coin and purchase are never positional', () => {
  expect(soundFor(event('coin', { pos: POS, playerId: 'other' }), 'me')?.positional).toBe(false);
  expect(soundFor(event('buy', { pos: POS, playerId: 'other' }), 'me')?.positional).toBe(false);
});

test('every sound has a file path under /sounds/', () => {
  for (const url of Object.values(SOUND_FILES)) expect(url).toMatch(/^\/sounds\/[A-Za-z]+\.(mp3|wav)$/);
});

test('R10: M toggles mute unless typing or a modifier is held', () => {
  const key = { code: 'KeyM', repeat: false, ctrlKey: false, metaKey: false, altKey: false };
  expect(isMuteKey(key, 'BODY')).toBe(true);
  expect(isMuteKey(key, null)).toBe(true);
  for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) expect(isMuteKey(key, tag)).toBe(false);
  expect(isMuteKey({ ...key, ctrlKey: true }, 'BODY')).toBe(false);
  expect(isMuteKey({ ...key, metaKey: true }, 'BODY')).toBe(false);
  expect(isMuteKey({ ...key, altKey: true }, 'BODY')).toBe(false);
  expect(isMuteKey({ ...key, repeat: true }, 'BODY')).toBe(false);
  expect(isMuteKey({ ...key, code: 'KeyN' }, 'BODY')).toBe(false);
});
