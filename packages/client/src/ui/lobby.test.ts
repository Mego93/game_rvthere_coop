import { defaultAppearance, type LobbyMessage, type LobbyPlayer } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { lobbyView, OSM_ATTRIBUTION, VEHICLE_LABELS } from './lobby';

const player = (playerId: string, name: string, changes: Partial<LobbyPlayer> = {}): LobbyPlayer => ({
  playerId,
  name,
  colour: '#e4572e',
  ready: false,
  connected: true,
  appearance: defaultAppearance('sounile'),
  ...changes,
});

const message = (players: LobbyPlayer[], changes: Partial<LobbyMessage> = {}): LobbyMessage => ({
  type: 'lobby',
  room: 'camel',
  phase: 'lobby',
  players,
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'lodgy',
  timeOfDay: 'midday',
  weather: 'clear',
  ...changes,
});

const trio = [player('p1', 'Amal'), player('p2', 'Badr'), player('p3', 'Cyd')];

test('L17: the admin sees editable settings, Start, Kick buttons for the others and no Ready toggle', () => {
  const view = lobbyView(message(trio), 'p1');
  expect(view.isAdmin).toBe(true);
  expect(view.settingsEditable).toBe(true);
  expect(view.showStart).toBe(true);
  expect(view.showReady).toBe(false);
  expect(view.players.map((entry) => entry.canKick)).toEqual([false, true, true]);
  expect(view.players[0]!.isAdmin).toBe(true);
});

test('L17: a non-admin sees plain settings, a Ready toggle that follows their state, no Start and no Kick', () => {
  const view = lobbyView(message([player('p1', 'Amal'), player('p2', 'Badr', { ready: true })]), 'p2');
  expect(view.isAdmin).toBe(false);
  expect(view.settingsEditable).toBe(false);
  expect(view.showStart).toBe(false);
  expect(view.startEnabled).toBe(false);
  expect(view.showReady).toBe(true);
  expect(view.localReady).toBe(true);
  expect(view.players.every((entry) => !entry.canKick)).toBe(true);
});

test('L17: Start is enabled only when every other connected player is ready', () => {
  expect(lobbyView(message([player('p1', 'Amal')]), 'p1').startEnabled).toBe(true);
  expect(lobbyView(message(trio), 'p1').startEnabled).toBe(false);
  const one = [player('p1', 'Amal'), player('p2', 'Badr', { ready: true }), player('p3', 'Cyd')];
  expect(lobbyView(message(one), 'p1').startEnabled).toBe(false);
  const all = [player('p1', 'Amal'), player('p2', 'Badr', { ready: true }), player('p3', 'Cyd', { ready: true })];
  expect(lobbyView(message(all), 'p1').startEnabled).toBe(true);
});

test('L17: a held player is shown as disconnected and does not block Start', () => {
  const held = [player('p1', 'Amal'), player('p2', 'Badr', { connected: false })];
  const view = lobbyView(message(held), 'p1');
  expect(view.players[1]!.status).toBe('not ready (disconnected)');
  expect(view.players[1]!.connected).toBe(false);
  expect(view.startEnabled).toBe(true);
});

test('P9: the lobby view carries the character name of every player', () => {
  const view = lobbyView(message([player('p1', 'Amal'), player('p2', 'Badr', { appearance: defaultAppearance('huu') })]), 'p1');
  expect(view.players.map((entry) => entry.character)).toEqual(['Sounile', 'Huu']);
});

test('L17: the status of the admin and of a ready player', () => {
  const view = lobbyView(message([player('p1', 'Amal'), player('p2', 'Badr', { ready: true })]), 'p1');
  expect(view.players.map((entry) => entry.status)).toEqual(['admin', 'ready']);
});

test('L17: the settings are carried over, and the vehicle labels are Lodgy and RV', () => {
  const view = lobbyView(message(trio, { courseId: 'segment-demo', vehicleId: 'rv', timeOfDay: 'night', weather: 'rain' }), 'p1');
  expect(view.settings).toEqual({ courseId: 'segment-demo', vehicleId: 'rv', timeOfDay: 'night', weather: 'rain' });
  expect(VEHICLE_LABELS).toEqual({ lodgy: 'Lodgy', rv: 'RV' });
});

test('T13 the lobby view carries a one-line OpenStreetMap credit with a link', () => {
  const view = lobbyView(message([player('p1', 'Amal')]), 'p1');
  expect(view.attribution).toBe(OSM_ATTRIBUTION);
  expect(OSM_ATTRIBUTION.text).toBe('Route data © OpenStreetMap contributors (ODbL)');
  expect(OSM_ATTRIBUTION.href).toBe('https://www.openstreetmap.org/copyright');
  expect(OSM_ATTRIBUTION.text).not.toContain('\n');
});
