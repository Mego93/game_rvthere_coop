import { FAKE_REPUBLIC_OUTCOMES } from '@lodgy/shared';

// The three fake stocks the friend picks from; the pick changes only the chart shown.
export const FAKE_STOCKS = [
  { ticker: 'SHRA', name: 'Sahara Solar' },
  { ticker: 'CMLC', name: 'Camel Coin' },
  { ticker: 'TJNE', name: 'Tajine Tech' },
] as const;

export const FAKE_REPUBLIC_CHART_SECONDS = 3;
export const CHART_POINTS = 30;

// Where the chart ends, as a fraction of its height: the outcome's share of the biggest payout, kept off the very edges.
export function chartEnd(outcome: number): number {
  const top = Math.max(...FAKE_REPUBLIC_OUTCOMES);
  return 0.08 + 0.84 * Math.min(1, Math.max(0, outcome / top));
}

function lcg(seed: number): () => number {
  let state = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// The chart's price points, 0 to 1 from the bottom: a wobbling line that starts mid-height and ends exactly at the outcome.
export function chartSeries(pick: 0 | 1 | 2, outcome: number, points = CHART_POINTS): number[] {
  const random = lcg(pick * 7919 + Math.round(outcome) + 1);
  const end = chartEnd(outcome);
  const start = 0.4 + 0.2 * random();
  const phase = random() * Math.PI * 2;
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const eased = t * t * (3 - 2 * t);
    const wobble = Math.sin(t * Math.PI) * (0.16 * Math.sin(t * 11 + phase) + 0.08 * (random() - 0.5));
    series.push(Math.min(1, Math.max(0, start + (end - start) * eased + wobble)));
  }
  series[points - 1] = end;
  return series;
}

// How many of the chart's points are drawn `seconds` after it started.
export const chartShown = (seconds: number, points = CHART_POINTS): number => Math.max(0, Math.min(points, Math.ceil((seconds / FAKE_REPUBLIC_CHART_SECONDS) * points)));

export const outcomeText = (outcome: number): string => (outcome > 0 ? `You won ${outcome} dh! It is in your bank.` : 'The market was cruel. Nothing lost, nothing won.');
