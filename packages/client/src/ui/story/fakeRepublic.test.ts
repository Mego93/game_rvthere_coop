import { FAKE_REPUBLIC_OUTCOMES } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { CHART_POINTS, FAKE_REPUBLIC_CHART_SECONDS, FAKE_STOCKS, chartEnd, chartSeries, chartShown, outcomeText } from './fakeRepublic';

describe('Fake Republic chart', () => {
  it('offers three fake stocks', () => {
    expect(FAKE_STOCKS).toHaveLength(3);
    expect(new Set(FAKE_STOCKS.map((stock) => stock.ticker)).size).toBe(3);
  });

  it('ends exactly at the outcome level, higher for a bigger payout', () => {
    const ends = FAKE_REPUBLIC_OUTCOMES.map((outcome) => chartSeries(1, outcome).at(-1));
    expect(ends).toEqual(FAKE_REPUBLIC_OUTCOMES.map(chartEnd));
    expect([...ends].sort((a, b) => a! - b!)).toEqual(ends);
  });

  it('stays inside the chart, has a fixed number of points and repeats for the same pick and outcome', () => {
    for (const pick of [0, 1, 2] as const) {
      for (const outcome of FAKE_REPUBLIC_OUTCOMES) {
        const series = chartSeries(pick, outcome);
        expect(series).toHaveLength(CHART_POINTS);
        for (const value of series) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(chartSeries(pick, outcome)).toEqual(series);
      }
    }
    expect(chartSeries(0, 300)).not.toEqual(chartSeries(1, 300));
  });

  it('draws the whole chart over three seconds', () => {
    expect(FAKE_REPUBLIC_CHART_SECONDS).toBe(3);
    expect(chartShown(0)).toBe(0);
    expect(chartShown(1.5)).toBe(CHART_POINTS / 2);
    expect(chartShown(3)).toBe(CHART_POINTS);
    expect(chartShown(10)).toBe(CHART_POINTS);
  });

  it('says what was won, and that nothing is lost on a zero', () => {
    expect(outcomeText(600)).toContain('600');
    expect(outcomeText(0)).toContain('Nothing lost');
  });
});
