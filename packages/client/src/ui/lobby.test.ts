import { defaultAppearance, type LobbyMessage, type LobbyPlayer } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { WEATHER_SETTINGS } from '@lodgy/shared';
import { CHAIN_LABEL, chainShown, courseLabel, courseOptions, lobbyView, OSM_ATTRIBUTION, VEHICLE_LABELS, WEATHER_LABELS, weatherOptions } from './lobby';

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
  chain: false,
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
  expect(view.settings).toEqual({ courseId: 'segment-demo', vehicleId: 'rv', timeOfDay: 'night', weather: 'rain', chain: false });
  expect(VEHICLE_LABELS).toEqual({ lodgy: 'Lodgy', rv: 'RV' });
});

test('T13 the lobby view carries a one-line OpenStreetMap credit with a link', () => {
  const view = lobbyView(message([player('p1', 'Amal')]), 'p1');
  expect(view.attribution).toBe(OSM_ATTRIBUTION);
  expect(OSM_ATTRIBUTION.text).toBe('Route data © OpenStreetMap contributors (ODbL)');
  expect(OSM_ATTRIBUTION.href).toBe('https://www.openstreetmap.org/copyright');
  expect(OSM_ATTRIBUTION.text).not.toContain('\n');
});

test('L30: the weather select lists Clear, Rain, Sandstorm and Random, in that order, with the setting as value', () => {
  expect(weatherOptions()).toEqual([
    { value: 'clear', text: 'Clear' },
    { value: 'rain', text: 'Rain' },
    { value: 'sandstorm', text: 'Sandstorm' },
    { value: 'random', text: 'Random' },
  ]);
  expect(Object.keys(WEATHER_LABELS).sort()).toEqual([...WEATHER_SETTINGS].sort());
});

test('L31: the lobby view carries the random weather setting', () => {
  expect(lobbyView(message(trio, { weather: 'random' }), 'p1').settings.weather).toBe('random');
});

test('V1: the course select lists the five stages in play order with their labels, then the full route and the rest by id', () => {
  const options = courseOptions();
  expect(options.slice(0, 5).map((option) => option.value)).toEqual(['desert', 'valley', 'mountain', 'city', 'airport-road']);
  expect(options.slice(0, 5).map((option) => option.text)).toEqual(['1 Desert', '2 Bridge and forest', '3 Mountains', '4 City', '5 To the airport']);
  expect(options.find((option) => option.value === 'marrakech')!.text).toBe('Full route');
  // A course with no label shows its id.
  expect(courseLabel('test')).toBe('test');
  expect(courseLabel('no-such-course')).toBe('no-such-course');
  expect(options.every((option) => option.text.length > 0)).toBe(true);
});

test('V1: the chain checkbox shows for a stage only, is admin-only and the setting is carried over', () => {
  expect(CHAIN_LABEL).toBe('Run all five stages');
  for (const id of ['desert', 'valley', 'mountain', 'city', 'airport-road']) expect(chainShown(id), id).toBe(true);
  for (const id of ['marrakech', 'airport', 'segment-demo', 'test']) expect(chainShown(id), id).toBe(false);
  const admin = lobbyView(message(trio, { courseId: 'valley', chain: true }), 'p1');
  expect([admin.showChain, admin.chainEditable, admin.settings.chain]).toEqual([true, true, true]);
  const guest = lobbyView(message(trio, { courseId: 'valley', chain: true }), 'p2');
  expect([guest.showChain, guest.chainEditable, guest.settings.chain]).toEqual([true, false, true]);
  const full = lobbyView(message(trio, { courseId: 'marrakech' }), 'p1');
  expect([full.showChain, full.settings.chain]).toEqual([false, false]);
});
