import { expect, test } from 'vitest';
import { newPlayerIds, readyChanged, type LobbyPlayerView } from './lobby';

const card = (playerId: string, changes: Partial<LobbyPlayerView> = {}): LobbyPlayerView => ({
  playerId,
  name: playerId,
  colour: '#e4572e',
  character: 'Sounile',
  isAdmin: false,
  connected: true,
  status: 'not ready',
  canKick: false,
  ...changes,
});

test('newPlayerIds: every card is new when there is no previous view', () => {
  expect(newPlayerIds(null, [card('a'), card('b')])).toEqual(['a', 'b']);
});

test('newPlayerIds: only ids absent from the previous view, in order', () => {
  expect(newPlayerIds([card('a'), card('c')], [card('a'), card('b'), card('c'), card('d')])).toEqual(['b', 'd']);
});

test('newPlayerIds: an unchanged list and a shrinking list have no new ids', () => {
  expect(newPlayerIds([card('a'), card('b')], [card('a'), card('b')])).toEqual([]);
  expect(newPlayerIds([card('a'), card('b')], [card('b')])).toEqual([]);
});

test('readyChanged: no previous view means no pulse', () => {
  expect(readyChanged(null, [card('a')])).toEqual([]);
});

test('readyChanged: only players present in both whose status changed', () => {
  const previous = [card('a'), card('b'), card('c')];
  const next = [card('a', { status: 'ready' }), card('b'), card('d', { status: 'ready' })];
  expect(readyChanged(previous, next)).toEqual(['a']);
});

test('readyChanged: a connection change is not a ready change', () => {
  expect(readyChanged([card('a')], [card('a', { status: 'not ready (disconnected)', connected: false })])).toEqual([]);
  expect(readyChanged([card('a', { connected: false, status: 'not ready (disconnected)' })], [card('a')])).toEqual([]);
});
