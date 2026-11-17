import { defaultAppearance, type Appearance, type LobbyMessage, type LobbyPlayer } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { mergeAppearance, pickerView } from './characterPicker';

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
  const own = { characterId: 'nandan', glasses: 'round', top: 'suit', hat: 'fez' } as const;
  const view = pickerView(message([player('p1', 'Amal', own)]), 'p1', null)!;
  expect(view.appearance).toEqual(own);
  expect(view.cards[2]!.state).toBe('own');
});

test('P4: no entry for the local player gives no picker', () => {
  expect(pickerView(duo, 'nobody', null)).toBeNull();
});

test('P5: a pending choice shows at once: its card is own and the old one is free', () => {
  const pending: Appearance = { characterId: 'huu', glasses: 'none', top: 'default', hat: 'cap' };
  const view = pickerView(duo, 'p1', pending)!;
  expect(view.appearance).toEqual(pending);
  expect(view.cards.map((card) => card.state)).toEqual(['free', 'taken', 'free', 'free', 'free', 'own']);
  expect(view.pending).toEqual(pending);
});

test('P6: the pending choice is cleared when the echo equals it, and kept while it differs', () => {
  const pending: Appearance = { characterId: 'sounile', glasses: 'round', top: 'default', hat: 'none' };
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

test('P8: a pending choice on a card another player holds shows as own until an error drops it', () => {
  const raced = message([player('p1', 'Amal', defaultAppearance('sounile')), player('p2', 'Badr', defaultAppearance('huu'))]);
  expect(pickerView(raced, 'p1', defaultAppearance('huu'))!.cards[5]!.state).toBe('own');
  expect(pickerView(raced, 'p1', null)!.cards[5]!.state).toBe('taken');
});
