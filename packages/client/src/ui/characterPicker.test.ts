import { defaultAppearance, type Appearance, type LobbyMessage, type LobbyPlayer } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createPickerState, mergeAppearance, pickerView } from './characterPicker';

const player = (playerId: string, name: string, appearance: Appearance, connected = true): LobbyPlayer => ({
  playerId,
  name,
  colour: '#e4572e',
  ready: false,
  connected,
  appearance,
});

const message = (players: LobbyPlayer[]): LobbyMessage => ({
  type: 'lobby',
  room: 'camel',
  phase: 'lobby',
  players,
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'lodgy',
  timeOfDay: 'midday',
  weather: 'clear',
});

const duo = message([player('p1', 'Amal', defaultAppearance('sounile')), player('p2', 'Badr', defaultAppearance('rafael'))]);

test('P1: six cards in character order; own, taken with the holder, the rest free', () => {
  const view = pickerView(duo, 'p1', null)!;
  expect(view.cards.map((card) => card.characterId)).toEqual(['sounile', 'rafael', 'nandan', 'alexander', 'luiz', 'huu']);
  expect(view.cards.map((card) => card.state)).toEqual(['own', 'taken', 'free', 'free', 'free', 'free']);
  expect(view.cards[0]!.name).toBe('Sounile');
  expect(view.cards[1]!.holderName).toBe('Badr');
  expect(view.cards[2]!.holderName).toBeNull();
  expect(view.cards[1]!.away).toBe(false);
});

test('P2: a held (disconnected) player still holds the card, shown as away', () => {
  const held = message([player('p1', 'Amal', defaultAppearance('sounile')), player('p2', 'Badr', defaultAppearance('luiz'), false)]);
  const card = pickerView(held, 'p1', null)!.cards[4]!;
  expect(card.state).toBe('taken');
  expect(card.away).toBe(true);
  expect(card.holderName).toBe('Badr');
});

test('P3: the option rows carry the own current values', () => {
  const own = { characterId: 'nandan', glasses: 'round', top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' } as const;
  const view = pickerView(message([player('p1', 'Amal', own)]), 'p1', null)!;
  expect(view.appearance).toEqual(own);
  expect(view.cards[2]!.state).toBe('own');
});

test('P4: no entry for the local player gives no picker', () => {
  expect(pickerView(duo, 'nobody', null)).toBeNull();
});

test('P5: a pending choice shows at once: its card is own and the old one is free', () => {
  const pending: Appearance = { characterId: 'huu', glasses: 'none', top: 'default', hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' };
  const view = pickerView(duo, 'p1', pending)!;
  expect(view.appearance).toEqual(pending);
  expect(view.cards.map((card) => card.state)).toEqual(['free', 'taken', 'free', 'free', 'free', 'own']);
  expect(view.pending).toEqual(pending);
});

test('P6: the pending choice is cleared when the echo equals it, and kept while it differs', () => {
  const pending: Appearance = { characterId: 'sounile', glasses: 'round', top: 'default', hat: 'none', skin: 'default', eyes: 'default', smile: 'default' };
  expect(pickerView(duo, 'p1', pending)!.pending).toEqual(pending);
  const echoed = message([player('p1', 'Amal', pending), player('p2', 'Badr', defaultAppearance('rafael'))]);
  const view = pickerView(echoed, 'p1', pending)!;
  expect(view.pending).toBeNull();
  expect(view.appearance).toEqual(pending);
});

test('P7: mergeAppearance returns the server value and no pending when none is pending', () => {
  const server = defaultAppearance('luiz');
  expect(mergeAppearance(server, null)).toEqual({ appearance: server, pending: null });
});

test('P8: a pending choice on a card another player holds still shows as own, and as taken once nothing is pending', () => {
  const raced = message([player('p1', 'Amal', defaultAppearance('sounile')), player('p2', 'Badr', defaultAppearance('huu'))]);
  expect(pickerView(raced, 'p1', defaultAppearance('huu'))!.cards[5]!.state).toBe('own');
  expect(pickerView(raced, 'p1', null)!.cards[5]!.state).toBe('taken');
});

const lobbyOf = (a: Appearance, b: Appearance) => message([player('p1', 'Amal', a), player('p2', 'Badr', b)]);

test('P9: mergeAppearance keeps a differing pending look and clears an equal one', () => {
  const server = defaultAppearance('sounile');
  const pending = { ...server, hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' } as const;
  expect(mergeAppearance(server, pending)).toEqual({ appearance: pending, pending });
  expect(mergeAppearance(server, { ...server })).toEqual({ appearance: server, pending: null });
});

test('P10: a tap on a free card gives one full look keeping the other choices', () => {
  const state = createPickerState();
  const own = { characterId: 'sounile', glasses: 'round', top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' } as const;
  const sent = state.choose(lobbyOf(own, defaultAppearance('rafael')), 'p1', { characterId: 'huu' });
  expect(sent).toEqual({ characterId: 'huu', glasses: 'round', top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' });
});

test('P11: a tap on a taken card, on the own card or on the current option sends nothing', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  expect(state.choose(lobby, 'p1', { characterId: 'rafael' })).toBeNull();
  expect(state.choose(lobby, 'p1', { characterId: 'sounile' })).toBeNull();
  expect(state.choose(lobby, 'p1', { hat: 'none', skin: 'default', eyes: 'default', smile: 'default' })).toBeNull();
  expect(state.choose(lobby, 'nobody', { hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' })).toBeNull();
});

test('P12: two quick taps before an echo: the second carries the first change', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  state.choose(lobby, 'p1', { characterId: 'luiz' });
  expect(state.choose(lobby, 'p1', { hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' })).toEqual({ characterId: 'luiz', glasses: 'default', top: 'default', hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' });
});

test('P13: a matching echo clears pending', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  const next = state.choose(lobby, 'p1', { hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' })!;
  expect(state.view(lobby, 'p1')!.pending).toEqual(next);
  expect(state.view(lobbyOf(next, defaultAppearance('rafael')), 'p1')!.pending).toBeNull();
  expect(state.view(lobby, 'p1')!.appearance).toEqual(defaultAppearance('sounile'));
});

test('P14: character_taken and bad_phase drop pending and set the note, also with nothing pending', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  state.choose(lobby, 'p1', { characterId: 'huu' });
  expect(state.error('character_taken', 'taken')).toBe(true);
  expect(state.note).toBe('taken');
  expect(state.view(lobby, 'p1')!.appearance).toEqual(defaultAppearance('sounile'));
  expect(state.error('bad_phase', 'later')).toBe(true);
  expect(state.note).toBe('later');
});

test('P15: other errors leave pending and the note alone', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  state.choose(lobby, 'p1', { characterId: 'huu' });
  expect(state.error('not_admin', 'no')).toBe(false);
  expect(state.error(undefined, 'no')).toBe(false);
  expect(state.note).toBe('');
  expect(state.view(lobby, 'p1')!.appearance.characterId).toBe('huu');
});

test('P16: a new choice clears the note and reset clears everything', () => {
  const state = createPickerState();
  const lobby = lobbyOf(defaultAppearance('sounile'), defaultAppearance('rafael'));
  state.error('character_taken', 'taken');
  state.choose(lobby, 'p1', { hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' });
  expect(state.note).toBe('');
  state.reset();
  expect(state.view(lobby, 'p1')!.pending).toBeNull();
});
