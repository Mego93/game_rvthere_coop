import { CHARACTER_IDS, GOLF_BALLS_EACH, GOLF_RINGS, STORY_PRICES, golfResults, newWeek, type GolfSnapshot } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { ballsLeftText, golfStandings, landText, scoreboard, turnText } from './golfView';

type Scores = GolfSnapshot['scores'];

describe('turnText and ballsLeftText', () => {
  it('names the player on turn, and says "Your turn!" to him', () => {
    expect(turnText('rafael', 'rafael')).toBe('Your turn!');
    expect(turnText('rafael', 'luiz')).toBe("Rafael's turn");
    expect(turnText('rafael', null)).toBe("Rafael's turn");
  });

  it('says nothing when nobody has a turn', () => {
    expect(turnText(null, 'luiz')).toBe('');
  });

  it('counts the local player\'s balls left from the six each, and shows none for a spectator', () => {
    expect(ballsLeftText({ luiz: [10, 0, 20] }, 'luiz')).toBe('Balls left: 3');
    expect(ballsLeftText({ luiz: [] }, 'luiz')).toBe(`Balls left: ${GOLF_BALLS_EACH}`);
    expect(ballsLeftText({ luiz: [1, 1, 1, 1, 1, 1] }, 'luiz')).toBe('Balls left: 0');
    expect(ballsLeftText({ luiz: [] }, 'huu')).toBe('');
    expect(ballsLeftText({ luiz: [] }, null)).toBe('');
  });
});

describe('scoreboard', () => {
  it('lists the friends in character order with their balls, totals and balls left, ranked by total', () => {
    const scores: Scores = { luiz: [50, 0, 20], sounile: [15, 15], huu: [] };
    const rows = scoreboard(scores, 'sounile');
    expect(rows.map((row) => row.id)).toEqual(CHARACTER_IDS.filter((id) => id in scores));
    const luiz = rows.find((row) => row.id === 'luiz')!;
    expect(luiz).toMatchObject({ name: 'Luiz', total: 70, balls: [50, 0, 20, null, null, null], left: 3, rank: 1, onTurn: false });
    expect(rows.find((row) => row.id === 'sounile')).toMatchObject({ total: 30, rank: 2, onTurn: true, left: 4 });
    expect(rows.find((row) => row.id === 'huu')).toMatchObject({ total: 0, rank: 3, left: 6, balls: [null, null, null, null, null, null] });
  });

  it('gives tied totals the same rank', () => {
    const rows = scoreboard({ luiz: [10], huu: [10], nandan: [5] }, null);
    expect(rows.find((row) => row.id === 'luiz')!.rank).toBe(1);
    expect(rows.find((row) => row.id === 'huu')!.rank).toBe(1);
    expect(rows.find((row) => row.id === 'nandan')!.rank).toBe(3);
  });
});

describe('landText', () => {
  it('names the ring and the points', () => {
    expect(landText('blue', 25)).toEqual({ text: 'Blue ring +25', tone: 'hit' });
  });

  it('calls a doubled landing a bullseye and the jackpot a jackpot', () => {
    const green = GOLF_RINGS.find((ring) => ring.id === 'green')!;
    expect(landText('green', 2 * green.points)).toEqual({ text: 'Bullseye! Green ring +40', tone: 'bull' });
    expect(landText('jackpot', 150)).toEqual({ text: 'JACKPOT! +150', tone: 'jackpot' });
    expect(landText('jackpot', 300)).toEqual({ text: 'JACKPOT bullseye! +300', tone: 'jackpot' });
  });

  it('calls no ring a miss', () => {
    expect(landText(null, 0)).toEqual({ text: 'Missed', tone: 'miss' });
  });
});

describe('golfStandings', () => {
  it('names the best, the worst who pays coffee for everyone, and the team bonus', () => {
    const standings = golfStandings({ luiz: [100, 50], huu: [20, 0], nandan: [40, 40] });
    expect(standings.best).toEqual(['luiz']);
    expect(standings.worst).toBe('huu');
    expect(standings.coffeeTotal).toBe(3 * STORY_PRICES.coffee);
    // Mean 83.33 / 20 rounds to 4.
    expect(standings.team).toBe(4);
    expect(standings.lines).toEqual([
      'Best: Luiz with 150, +15 happiness',
      `Worst: Huu with 20 pays coffee for everyone (${3 * STORY_PRICES.coffee} dh)`,
      'Team bonus: +4 happiness for everyone',
    ]);
  });

  it('caps the team bonus at 10 happiness', () => {
    expect(golfStandings({ luiz: [300, 300, 300], huu: [300, 300, 300] }).team).toBe(10);
  });

  it('alone, or in a tie for the top, has no best and no worst, only the team bonus', () => {
    const alone = golfStandings({ luiz: [200, 200] });
    expect(alone.best).toEqual([]);
    expect(alone.worst).toBeNull();
    expect(alone.lines).toEqual([`Team bonus: +${alone.team} happiness for everyone`]);
    const tied = golfStandings({ luiz: [10], huu: [10] });
    expect(tied.best).toEqual([]);
    expect(tied.worst).toBeNull();
  });

  it('shares the best between friends tied at the top, and the worst of a tie at the bottom is the first in character order', () => {
    const standings = golfStandings({ huu: [90], luiz: [90], sounile: [10], nandan: [10] });
    expect(standings.best).toEqual(['luiz', 'huu']);
    expect(standings.worst).toBe('sounile');
    expect(standings.lines[0]).toBe('Best: Luiz and Huu with 90, +15 happiness');
  });

  it('agrees with the server: the best gain 15, the worst pays, everyone gets the team bonus', () => {
    const cases: Scores[] = [
      { luiz: [100, 50], huu: [20, 0], nandan: [40, 40] },
      { luiz: [200, 200] },
      { huu: [90], luiz: [90], sounile: [10], nandan: [10] },
      { rafael: [0, 0, 0], alexander: [300, 150], huu: [10] },
    ];
    for (const scores of cases) {
      const ids = CHARACTER_IDS.filter((id) => id in scores);
      const week = newWeek();
      for (const id of ids) {
        week.friends[id].happiness = 40;
        week.friends[id].cash = 1000;
      }
      const state = { order: [...ids], left: Object.fromEntries(ids.map((id) => [id, 0])), scores, turn: null };
      const after = golfResults(state, week);
      const standings = golfStandings(scores);
      for (const id of ids) {
        const gain = after.friends[id].happiness - 40;
        expect(gain, `${id} happiness`).toBe(standings.team + (standings.best.includes(id) ? 15 : 0));
        const paid = 1000 - after.friends[id].cash;
        expect(paid, `${id} coffee`).toBe(standings.worst === id ? standings.coffeeTotal : 0);
      }
    }
  });
});
