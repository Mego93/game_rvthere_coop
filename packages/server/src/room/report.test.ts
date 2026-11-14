import { REPORT_INTERVAL } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createReporter } from './report';

function setup() {
  let now = 0;
  const reports: { error: unknown; source: string; suppressed: number }[] = [];
  const report = createReporter((error, source, suppressed) => reports.push({ error, source, suppressed }), () => now);
  return { report, reports, at: (time: number) => (now = time) };
}

test('a source that fails on every tick reports once per interval, with the count it suppressed', () => {
  const { report, reports, at } = setup();
  // Every half second for 25 s, which is exact in binary.
  for (let time = 0; time <= 25; time += 0.5) {
    at(time);
    report('timer', new Error(`tick ${time}`));
  }
  expect(reports.map(({ suppressed }) => suppressed)).toEqual([0, REPORT_INTERVAL * 2 - 1, REPORT_INTERVAL * 2 - 1]);
  expect(reports.every(({ source }) => source === 'timer')).toBe(true);
  expect((reports[1]!.error as Error).message).toBe('tick 10');
});

test('the interval is a boundary: just under it is suppressed, the interval itself reports', () => {
  const { report, reports, at } = setup();
  report('timer', 'first');
  at(REPORT_INTERVAL - 0.01);
  report('timer', 'early');
  expect(reports).toHaveLength(1);
  at(REPORT_INTERVAL);
  report('timer', 'due');
  expect(reports.map(({ error, suppressed }) => [error, suppressed])).toEqual([
    ['first', 0],
    ['due', 1],
  ]);
});

test('distinct sources are independent', () => {
  const { report, reports, at } = setup();
  report('timer', 'a');
  at(0.5);
  report('static', 'b');
  report('timer', 'c');
  report('room:amal', 'd');
  expect(reports.map(({ source, suppressed }) => [source, suppressed])).toEqual([
    ['timer', 0],
    ['static', 0],
    ['room:amal', 0],
  ]);
});
