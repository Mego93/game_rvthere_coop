import { describe, expect, it } from 'vitest';
import { GOLF_RESULTS_SECONDS, resultsRows } from './golfHud';
import { golfStandings } from './golfView';

describe('resultsRows', () => {
  it('ranks the friends by total and marks the best and the worst', () => {
    const rows = resultsRows(golfStandings({ huu: [20, 0], luiz: [100, 50], nandan: [40, 40] }));
    expect(rows).toEqual([
      { rank: 1, name: 'Luiz', total: 150, mark: 'best' },
      { rank: 2, name: 'Nandan', total: 80, mark: '' },
      { rank: 3, name: 'Huu', total: 20, mark: 'worst' },
    ]);
  });

  it('marks nobody when the game has no best and no worst', () => {
    expect(resultsRows(golfStandings({ luiz: [10, 10] })).map((row) => row.mark)).toEqual(['']);
    expect(resultsRows(golfStandings({ luiz: [10], huu: [10] })).map((row) => row.mark)).toEqual(['', '']);
  });

  it('stays long enough to read over the villa', () => {
    expect(GOLF_RESULTS_SECONDS).toBeGreaterThanOrEqual(8);
  });
});
