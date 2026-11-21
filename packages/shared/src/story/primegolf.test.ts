import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../characters';
import { STORY_PRICES } from './constants';
import { GOLF_BALLS_EACH, GOLF_BEST_HAPPINESS, GOLF_RINGS, golfResults, golfTurn, recordBall, scoreLanding, skipFriend, startGolf } from './primegolf';
import { newWeek, type Week } from './week';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ring = (id: string) => GOLF_RINGS.find((r) => r.id === id)!;
const FRIENDS: CharacterId[] = ['sounile', 'nandan', 'huu'];

const withFriend = (week: Week, id: CharacterId, patch: Partial<{ cash: number; happiness: number }>): Week => {
  const w = clone(week);
  Object.assign(w.friends[id], patch);
  return w;
};

// Plays every ball of every friend, `points(id, n)` giving the n-th ball's points.
const play = (ids: CharacterId[], points: (id: CharacterId, n: number) => number) => {
  let state = startGolf(ids);
  const count: Partial<Record<CharacterId, number>> = {};
  for (let turn = golfTurn(state); turn !== null; turn = golfTurn(state)) {
    const n = count[turn] ?? 0;
    count[turn] = n + 1;
    state = recordBall(state, turn, points(turn, n));
  }
  return state;
};

describe('G1 turn order', () => {
  it('rotates in the given order, one ball each, 6 balls each', () => {
    let state = startGolf(['sounile', 'nandan']);
    const seen: CharacterId[] = [];
    for (let turn = golfTurn(state); turn !== null; turn = golfTurn(state)) {
      seen.push(turn);
      state = recordBall(state, turn, 0);
    }
    expect(seen).toHaveLength(2 * GOLF_BALLS_EACH);
    expect(seen.slice(0, 4)).toEqual(['sounile', 'nandan', 'sounile', 'nandan']);
    expect(golfTurn(state)).toBeNull();
  });

  it('puts the friends in character order whatever order they are passed in', () => {
    expect(golfTurn(startGolf(['huu', 'rafael', 'sounile']))).toBe('sounile');
    expect(startGolf(['huu', 'rafael', 'sounile']).order).toEqual(['sounile', 'rafael', 'huu']);
  });

  it('keeps the scores per friend and does not touch the old state', () => {
    const a = startGolf(['sounile', 'nandan']);
    const b = recordBall(a, 'sounile', 25);
    expect(b.scores.sounile).toEqual([25]);
    expect(a.scores.sounile).toEqual([]);
    expect(golfTurn(b)).toBe('nandan');
  });

  it('has no turn with nobody present', () => {
    expect(golfTurn(startGolf([]))).toBeNull();
  });

  it('ignores a ball from a friend who is not on turn', () => {
    const a = startGolf(['sounile', 'nandan']);
    expect(recordBall(a, 'nandan', 10)).toEqual(a);
  });
});

describe('G2 scoreLanding', () => {
  it('scores a landing inside each ring', () => {
    for (const r of GOLF_RINGS.filter((x) => x.id !== 'jackpot')) {
      const at = { x: r.x + r.radius * 0.6, z: r.z };
      expect(scoreLanding(at, GOLF_RINGS)).toEqual({ ring: r.id, points: r.points });
    }
  });

  it('doubles within a third of the radius of the centre, edge included', () => {
    const g = ring('green');
    expect(scoreLanding({ x: g.x, z: g.z }, GOLF_RINGS)).toEqual({ ring: 'green', points: 40 });
    expect(scoreLanding({ x: g.x + g.radius / 3, z: g.z }, GOLF_RINGS)).toEqual({ ring: 'green', points: 40 });
    expect(scoreLanding({ x: g.x + g.radius / 3 + 0.01, z: g.z }, GOLF_RINGS)).toEqual({ ring: 'green', points: 20 });
  });

  it('counts the ring edge as inside and just past it as a miss', () => {
    const y = ring('yellow');
    expect(scoreLanding({ x: y.x, z: y.z + y.radius }, GOLF_RINGS)).toEqual({ ring: 'yellow', points: 15 });
    expect(scoreLanding({ x: y.x, z: y.z + y.radius + 0.01 }, GOLF_RINGS)).toEqual({ ring: null, points: 0 });
  });

  it('scores the jackpot on the centre line, doubled at its centre', () => {
    const j = ring('jackpot');
    expect(j.x).toBe(0);
    expect(scoreLanding({ x: 1.5, z: j.z }, GOLF_RINGS)).toEqual({ ring: 'jackpot', points: 150 });
    expect(scoreLanding({ x: 0, z: j.z }, GOLF_RINGS)).toEqual({ ring: 'jackpot', points: 300 });
  });

  it('scores a miss as nothing', () => {
    expect(scoreLanding({ x: 0, z: -35 }, GOLF_RINGS)).toEqual({ ring: null, points: 0 });
    expect(scoreLanding({ x: 0, z: 5 }, GOLF_RINGS)).toEqual({ ring: null, points: 0 });
  });

  it('has the rings of the plan, alternating sides', () => {
    expect(GOLF_RINGS.map((r) => [r.id, -r.z, r.radius, r.points])).toEqual([
      ['red', 20, 6, 10],
      ['yellow', 50, 6, 15],
      ['green', 80, 6, 20],
      ['blue', 110, 6.5, 25],
      ['purple', 140, 6.5, 30],
      ['orange', 170, 7, 40],
      ['white', 200, 7, 50],
      ['jackpot', 215, 2, 150],
    ]);
    const sides = GOLF_RINGS.filter((r) => r.id !== 'jackpot').map((r) => r.x);
    expect(sides).toEqual([12, -12, 12, -12, 12, -12, 12]);
  });
});

describe('G3 skipFriend', () => {
  it('drops a friend remaining balls and keeps the score', () => {
    let state = startGolf(['sounile', 'nandan']);
    state = recordBall(state, 'sounile', 20);
    state = skipFriend(state, 'nandan');
    expect(state.scores.nandan).toEqual([]);
    expect(golfTurn(state)).toBe('sounile');
    state = recordBall(state, 'sounile', 10);
    expect(golfTurn(state)).toBe('sounile');
  });

  it('moves the turn on when the friend on turn is skipped', () => {
    let state = startGolf(['sounile', 'nandan', 'huu']);
    state = skipFriend(state, 'sounile');
    expect(golfTurn(state)).toBe('nandan');
  });

  it('keeps the score of a friend who leaves mid-game', () => {
    let state = startGolf(['sounile', 'nandan']);
    state = recordBall(state, 'sounile', 30);
    state = recordBall(state, 'nandan', 5);
    state = skipFriend(state, 'sounile');
    expect(state.scores.sounile).toEqual([30]);
    expect(golfTurn(state)).toBe('nandan');
  });

  it('ends the game when the last friend is skipped', () => {
    let state = startGolf(['sounile']);
    state = skipFriend(state, 'sounile');
    expect(golfTurn(state)).toBeNull();
  });
});

describe('G4 golfResults', () => {
  const week = newWeek();

  it('gives the best player the happiness bonus and everyone the team bonus', () => {
    const state = play(FRIENDS, (id) => (id === 'huu' ? 50 : 10));
    const w = golfResults(state, week);
    // team total 300 + 60 + 60, average 140, 140 / 20 = 7
    expect(w.friends.huu.happiness).toBe(week.friends.huu.happiness + GOLF_BEST_HAPPINESS + 7);
    expect(w.friends.nandan.happiness).toBe(week.friends.nandan.happiness + 7);
  });

  it('makes the worst player pay a coffee for each present friend', () => {
    const state = play(FRIENDS, (id) => (id === 'huu' ? 50 : id === 'nandan' ? 20 : 10));
    const before = withFriend(withFriend(week, 'sounile', { cash: 100 }), 'nandan', { cash: 100 });
    const w = golfResults(state, before);
    expect(w.friends.sounile.cash).toBe(100 - STORY_PRICES.coffee * 3);
    expect(w.friends.nandan.cash).toBe(100);
  });

  it('clamps the payment at his cash and never goes below zero', () => {
    const state = play(FRIENDS, (id) => (id === 'huu' ? 50 : id === 'nandan' ? 20 : 10));
    expect(golfResults(state, withFriend(week, 'sounile', { cash: 20 })).friends.sounile.cash).toBe(0);
    expect(golfResults(state, withFriend(week, 'sounile', { cash: 0 })).friends.sounile.cash).toBe(0);
  });

  it('gives every present friend the team bonus, rounded and capped at 10', () => {
    const none = golfResults(play(['sounile', 'nandan'], () => 0), week);
    expect(none.friends.sounile).toEqual(week.friends.sounile);
    const mid = golfResults(play(['sounile', 'nandan'], () => 20), week);
    // total 120 each, average 120, 120 / 20 = 6; a tie has no best and no worst
    expect(mid.friends.sounile.happiness).toBe(week.friends.sounile.happiness + 6);
    expect(mid.friends.nandan.happiness).toBe(week.friends.nandan.happiness + 6);
    const high = golfResults(play(['sounile', 'nandan'], () => 150), week);
    expect(high.friends.sounile.happiness).toBe(week.friends.sounile.happiness + 10);
  });

  it('leaves absent friends alone', () => {
    const w = golfResults(play(['sounile', 'nandan'], (id) => (id === 'sounile' ? 40 : 10)), week);
    expect(w.friends.huu).toEqual(week.friends.huu);
  });

  it('gives a single player only the team bonus', () => {
    const w = golfResults(play(['sounile'], () => 40), withFriend(week, 'sounile', { cash: 100 }));
    // 240 / 20 = 12, capped at 10
    expect(w.friends.sounile.happiness).toBe(week.friends.sounile.happiness + 10);
    expect(w.friends.sounile.cash).toBe(100);
  });

  it('clamps happiness at 100 and does not touch the input week', () => {
    const state = play(['sounile', 'nandan'], (id) => (id === 'sounile' ? 50 : 10));
    const high = withFriend(week, 'sounile', { happiness: 95 });
    const frozen = clone(high);
    expect(golfResults(state, high).friends.sounile.happiness).toBe(100);
    expect(high).toEqual(frozen);
  });

  it('counts a skipped friend with the score he had', () => {
    let state = startGolf(['sounile', 'nandan']);
    state = recordBall(state, 'sounile', 50);
    state = recordBall(state, 'nandan', 10);
    state = skipFriend(state, 'nandan');
    while (golfTurn(state) !== null) state = recordBall(state, 'sounile', 50);
    const w = golfResults(state, withFriend(week, 'nandan', { cash: 100 }));
    expect(w.friends.nandan.cash).toBe(100 - STORY_PRICES.coffee * 2);
    expect(w.friends.sounile.happiness).toBeGreaterThan(week.friends.sounile.happiness + GOLF_BEST_HAPPINESS);
  });
});
