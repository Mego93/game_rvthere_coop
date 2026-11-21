import type { ResultsMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { mergeSettings } from './lobby';
import { resultsView, RUN_RESULTS_NAME } from './results';

const message = (changes: Partial<ResultsMessage> = {}): ResultsMessage => ({
  type: 'results',
  courseId: 'test',
  vehicleId: 'lodgy',
  timeOfDay: 'midday',
  weather: 'clear',
  elapsed: 90,
  restarts: 1,
  respawns: 2,
  wallet: 3,
  coinsCollected: 4,
  coinsTotal: 5,
  finalTime: 125.04,
  stars: [true, false, true],
  assisted: false,
  ...changes,
});

test('L18: shows every field', () => {
  expect(resultsView(message(), true).lines).toEqual([
    'Final time 2:05.0',
    'Vehicle Lodgy',
    'Course test, midday, Clear',
    'Restarts 1, respawns 2',
    'Coins 3 kept, 4/5 collected',
    'Stars ★☆★',
  ]);
});

test('L18: the weather line shows the room setting by its label, Random included', () => {
  expect(resultsView(message({ weather: 'random' }), true).lines).toContain('Course test, midday, Random');
  expect(resultsView(message({ weather: 'sandstorm' }), true).lines).toContain('Course test, midday, Sandstorm');
});

test('L18: the vehicle label, the raw id fallback, the assisted line and the campaign total', () => {
  expect(resultsView(message({ vehicleId: 'rv' }), false).lines).toContain('Vehicle RV');
  expect(resultsView(message({ vehicleId: 'tank' }), false).lines).toContain('Vehicle tank');
  expect(resultsView(message(), false).lines).not.toContain('assisted');
  expect(resultsView(message({ assisted: true, stars: [false, false, false] }), false).lines).toContain('assisted');
  expect(resultsView(message({ campaignTotal: 301.5 }), false).lines).toContain('Campaign total 5:01.5');
  expect(resultsView(message(), false).lines.join('\n')).not.toContain('Campaign');
});

test('L18: a non-admin sees "Waiting for the admin", the admin does not; an inherited key is not a label', () => {
  expect(resultsView(message(), false).lines.at(-1)).toBe('Waiting for the admin');
  expect(resultsView(message(), true).lines).not.toContain('Waiting for the admin');
  expect(resultsView(message({ vehicleId: 'constructor' }), true).lines).toContain('Vehicle constructor');
});

test('L18: seconds below ten are padded', () => {
  expect(resultsView(message({ finalTime: 65.0 }), false).lines[0]).toBe('Final time 1:05.0');
});

const TWO = ['test', 'segment-demo'];

test('L18: Next only for the admin and a course that is not the last; Back to lobby for the admin', () => {
  expect(resultsView(message({ courseId: 'test' }), true, TWO)).toMatchObject({ showNext: true, showLobby: true });
  expect(resultsView(message({ courseId: 'segment-demo' }), true, TWO)).toMatchObject({ showNext: false, showLobby: true });
  expect(resultsView(message({ courseId: 'elsewhere' }), true, TWO)).toMatchObject({ showNext: false, showLobby: true });
  expect(resultsView(message({ courseId: 'test' }), false, TWO)).toMatchObject({ showNext: false, showLobby: false });
  // The default campaign is the five stages; marrakech is outside it.
  expect(resultsView(message({ courseId: 'desert' }), true)).toMatchObject({ showNext: true, showLobby: true });
  expect(resultsView(message({ courseId: 'airport-road' }), true)).toMatchObject({ showNext: false, showLobby: true });
  expect(resultsView(message({ courseId: 'marrakech' }), true)).toMatchObject({ showNext: false, showLobby: true });
});

const server = { courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'race' } as const;

test('mergeSettings: an unconfirmed local change survives an echo that lacks it', () => {
  const local = { ...server, vehicleId: 'rv', weather: 'rain' } as const;
  const merged = mergeSettings(local, { vehicleId: 'rv', weather: 'rain' }, { ...server, vehicleId: 'rv' });
  expect(merged.settings).toEqual(local);
  expect(merged.pending).toEqual({ weather: 'rain' });
});

test('mergeSettings: a confirmed change is dropped and the server wins', () => {
  const merged = mergeSettings({ ...server, weather: 'rain' }, { weather: 'rain' }, { ...server, weather: 'rain' });
  expect(merged).toEqual({ settings: { ...server, weather: 'rain' }, pending: {} });
});

test('mergeSettings: with nothing pending the server wins', () => {
  expect(mergeSettings({ ...server, weather: 'rain' }, {}, server).settings).toEqual(server);
});

test('C9: resultsView takes the campaign: one course shows no Next, two courses show it on the first', () => {
  expect(resultsView(message({ courseId: 'test' }), true, ['test'])).toMatchObject({ showNext: false, showLobby: true });
  expect(resultsView(message({ courseId: 'test' }), true, ['test', 'other'])).toMatchObject({ showNext: true });
  expect(resultsView(message({ courseId: 'other' }), true, ['test', 'other'])).toMatchObject({ showNext: false });
});

test('R-chain: the results of a chained run are "Five stages", with one time and no Next, and are not looked up as a course', () => {
  const run = message({ courseId: 'run', finalTime: 905.5, campaignTotal: 905.5 });
  const view = resultsView(run, true);
  expect(RUN_RESULTS_NAME).toBe('Five stages');
  expect(view.lines).toContain('Course Five stages, midday, Clear');
  expect(view.lines.join('\n')).not.toContain('Campaign total');
  expect(view.lines[0]).toBe('Final time 15:05.5');
  expect(view).toMatchObject({ showNext: false, showLobby: true });
  // Even a campaign list that names it cannot give it a Next.
  expect(resultsView(run, true, ['run', 'desert']).showNext).toBe(false);
});

test('V1: a single stage shows its label without the number', () => {
  expect(resultsView(message({ courseId: 'valley' }), true).lines).toContain('Course Bridge and forest, midday, Clear');
});
