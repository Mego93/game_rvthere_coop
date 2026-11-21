import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type CharacterId } from '../characters';
import { TAJINE_HEAL } from '../constants';
import { COFFEE_FAST, FAKE_REPUBLIC_OUTCOMES, STORY_BANK_START, STORY_PRICES } from './constants';
import { buy, complain, eat, endDay, fakeRepublic, goalDone, loseDay, newWeek, parseWeek, phoneBuy, sayPhrase, serialiseWeek, speedFactor, stepNeeds, vibecodeTick, withdraw, type Week } from './week';

const ALL = CHARACTER_IDS;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const run = (week: Week, seconds: number, present: readonly CharacterId[] = ALL, activity = {}): Week => {
  let w = week;
  for (let i = 0; i < seconds; i += 1) w = { ...stepNeeds(w, 1, present, activity), clock: w.clock + 1 };
  return w;
};
const withCash = (week: Week, id: CharacterId, cash: number): Week => {
  const w = clone(week);
  w.friends[id].cash = cash;
  return w;
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe('W3 newWeek', () => {
  it('starts day 1 with every friend at the start values', () => {
    const w = newWeek();
    expect(w.version).toBe(1);
    expect(w.day).toBe(1);
    expect(w.clock).toBe(0);
    for (const id of ALL) {
      const f = w.friends[id];
      expect([f.health, f.food, f.happiness, f.tiredness]).toEqual([100, 80, 70, 10]);
      expect(f.cash).toBe(0);
      expect(f.bank).toBe(STORY_BANK_START);
      expect(f.items).toEqual([]);
    }
    expect(w.morning?.day).toBe(1);
  });
});

describe('W4 stepNeeds', () => {
  it('applies the rates over 60 s', () => {
    const w = run(newWeek(), 60, ['luiz']);
    const f = w.friends.luiz;
    expect(f.food).toBeCloseTo(74, 6);
    expect(f.tiredness).toBeCloseTo(13.6, 6);
    expect(f.health).toBe(100);
  });

  it('exerting doubles the tiredness rise', () => {
    const w = run(newWeek(), 60, ['luiz'], { luiz: 'exerting' });
    expect(w.friends.luiz.tiredness).toBeCloseTo(17.2, 6);
  });

  it('freezes absent friends', () => {
    const w = run(newWeek(), 120, ['luiz']);
    expect(w.friends.huu).toEqual(newWeek().friends.huu);
  });

  it('hunger costs health below 25', () => {
    const start = newWeek();
    start.friends.luiz.food = 24;
    const w = stepNeeds(start, 10, ['luiz'], {});
    expect(w.friends.luiz.health).toBeCloseTo(98, 6);
    expect(w.friends.luiz.food).toBeCloseTo(23, 6);
  });

  it('Rafael gets hungry 1.5x faster and his anger rises only below 30 food, then falls', () => {
    const start = newWeek();
    expect(run(start, 10, ['rafael']).friends.rafael.food).toBeCloseTo(78.5, 6);
    start.friends.rafael.food = 29.9;
    const angry = run(start, 10, ['rafael']).friends.rafael;
    expect(angry.anger).toBeCloseTo(10, 6);
    const calm = { ...angry, food: 90 };
    const w = clone(start);
    w.friends.rafael = calm;
    expect(stepNeeds(w, 2, ['rafael'], {}).friends.rafael.anger).toBeCloseTo(6, 6);
    expect(stepNeeds(w, 100, ['rafael'], {}).friends.rafael.anger).toBe(0);
    start.friends.rafael.anger = 99;
    start.friends.rafael.food = 10;
    expect(stepNeeds(start, 10, ['rafael'], {}).friends.rafael.anger).toBe(100);
  });

  it('Alexander loses happiness outside the spend window, not inside', () => {
    expect(run(newWeek(), 100, ['alexander']).friends.alexander.happiness).toBe(70);
    const w = run(newWeek(), 141, ['alexander']);
    expect(w.friends.alexander.happiness).toBeCloseTo(70 - 20 / 20, 6);
    const spent = { ...ok(phoneBuy({ ...w }, 'alexander', 'tcgPack')).week };
    const h = spent.friends.alexander.happiness;
    expect(stepNeeds(spent, 10, ['alexander'], {}).friends.alexander.happiness).toBe(h);
  });

  it('Huu loses happiness 90 s after his last phrase', () => {
    expect(run(newWeek(), 80, ['huu']).friends.huu.happiness).toBe(70);
    const w = run(newWeek(), 101, ['huu']);
    expect(w.friends.huu.happiness).toBeCloseTo(70 - 10 / 20, 6);
    const said = ok(sayPhrase(w, 'huu', w.clock)).week;
    expect(stepNeeds(said, 10, ['huu'], {}).friends.huu.happiness).toBe(said.friends.huu.happiness);
  });

  it('Sounile code bar falls 1/6 per s, costs health at 0, and a vibecode tick refills 25', () => {
    const w = run(newWeek(), 60, ['sounile']);
    expect(w.friends.sounile.code).toBeCloseTo(90, 6);
    expect(vibecodeTick(w, 'sounile').friends.sounile.code).toBeCloseTo(100, 6);
    const empty = newWeek();
    empty.friends.sounile.code = 0;
    expect(stepNeeds(empty, 10, ['sounile'], {}).friends.sounile.health).toBeCloseTo(98, 6);
  });

  it('coffee is fast for 60 s, then slow for 30 s, for anyone', () => {
    let w = withCash(newWeek(), 'huu', 100);
    w = ok(buy(w, 'huu', 'coffee')).week;
    w = ok(eat(w, 'huu', 'coffee')).week;
    expect(speedFactor(w.friends.huu)).toBe(COFFEE_FAST.factor);
    w = run(w, 59, ['huu']);
    expect(speedFactor(w.friends.huu)).toBe(COFFEE_FAST.factor);
    w = run(w, 2, ['huu']);
    expect(speedFactor(w.friends.huu)).toBe(COFFEE_FAST.slowFactor);
    w = run(w, 30, ['huu']);
    expect(speedFactor(w.friends.huu)).toBe(1);
  });

  it('tiredness above 80 slows walking', () => {
    const w = newWeek();
    w.friends.luiz.tiredness = 81;
    expect(speedFactor(w.friends.luiz)).toBeCloseTo(0.85, 6);
  });

  it('does not mutate its input', () => {
    const w = newWeek();
    const before = serialiseWeek(w);
    stepNeeds(w, 10, ALL, {});
    expect(serialiseWeek(w)).toBe(before);
  });
});

describe('W5 interactions', () => {
  it('buy takes cash, adds the item, and refuses when short', () => {
    expect(buy(newWeek(), 'luiz', 'tajine')).toEqual({ ok: false, reason: 'not_enough_cash' });
    const w = ok(buy(withCash(newWeek(), 'luiz', 100), 'luiz', 'tajine')).week;
    expect(w.friends.luiz.cash).toBe(100 - STORY_PRICES.tajine);
    expect(w.friends.luiz.items).toEqual(['tajine']);
    expect(buy(w, 'luiz', 'pizza')).toEqual({ ok: false, reason: 'not_for_sale' });
  });

  it('eat consumes the item and applies the effects; a tajine heals', () => {
    let w = withCash(newWeek(), 'luiz', 200);
    w.friends.luiz.health = 30;
    w.friends.luiz.food = 10;
    w = ok(buy(w, 'luiz', 'tajine')).week;
    w = ok(eat(w, 'luiz', 'tajine')).week;
    expect(w.friends.luiz.health).toBe(30 + TAJINE_HEAL);
    expect(w.friends.luiz.food).toBeGreaterThan(10);
    expect(w.friends.luiz.items).toEqual([]);
    expect(eat(w, 'luiz', 'tajine')).toEqual({ ok: false, reason: 'not_carried' });
  });

  it('Nandan eats only pizza, free from the chef; nobody else eats pizza', () => {
    const w = newWeek();
    w.friends.nandan.food = 10;
    expect(ok(eat(w, 'nandan', 'pizza')).week.friends.nandan.food).toBeGreaterThan(10);
    expect(eat(w, 'luiz', 'pizza')).toEqual({ ok: false, reason: 'wrong_food' });
    const rich = withCash(w, 'nandan', 100);
    expect(eat(ok(buy(rich, 'nandan', 'water')).week, 'nandan', 'water')).toEqual({ ok: false, reason: 'wrong_food' });
  });

  it('withdraw moves bank to cash and refuses beyond the bank', () => {
    const w = ok(withdraw(newWeek(), 'huu', 500)).week;
    expect([w.friends.huu.cash, w.friends.huu.bank]).toEqual([500, 1500]);
    expect(withdraw(w, 'huu', 1501)).toEqual({ ok: false, reason: 'not_enough_bank' });
    expect(withdraw(w, 'huu', 0)).toEqual({ ok: false, reason: 'bad_amount' });
    expect(withdraw(w, 'huu', 1.5)).toEqual({ ok: false, reason: 'bad_amount' });
  });

  it('phoneBuy is Alexander only, paid from the bank, sets lastSpend and refuses when short', () => {
    expect(phoneBuy(newWeek(), 'huu', 'shirt')).toEqual({ ok: false, reason: 'not_alexander' });
    const start = { ...newWeek(), clock: 77 };
    const w = ok(phoneBuy(start, 'alexander', 'shirt')).week;
    expect(w.friends.alexander.bank).toBe(1400);
    expect(w.friends.alexander.lastSpend).toBe(77);
    expect(phoneBuy(w, 'alexander', 'suit')).toEqual({ ok: false, reason: 'not_enough_bank' });
  });

  it('sayPhrase sets lastPhrase', () => {
    expect(ok(sayPhrase(newWeek(), 'huu', 12)).week.friends.huu.lastPhrase).toBe(12);
  });

  it('complain is Luiz only, adds 2 happiness, and refuses within 20 s', () => {
    expect(complain(newWeek(), 'huu', 0)).toEqual({ ok: false, reason: 'not_luiz' });
    const w = ok(complain(newWeek(), 'luiz', 5)).week;
    expect(w.friends.luiz.happiness).toBe(72);
    expect(complain(w, 'luiz', 24.9)).toEqual({ ok: false, reason: 'cooldown' });
    expect(ok(complain(w, 'luiz', 25)).week.friends.luiz.happiness).toBe(74);
  });

  it('vibecodeTick gives happiness +5 and tiredness +4', () => {
    const f = vibecodeTick(newWeek(), 'luiz').friends.luiz;
    expect([f.happiness, f.tiredness]).toEqual([75, 14]);
  });

  it('Fake Republic: refused unless under 200, once per day, weighted and never negative', () => {
    const rich = newWeek();
    expect(fakeRepublic(rich, 'luiz', 0, () => 0)).toEqual({ ok: false, reason: 'not_poor' });
    const poor = newWeek();
    poor.friends.luiz.bank = 150;
    poor.friends.luiz.cash = 49;
    const draw = (roll: number) => ok(fakeRepublic(poor, 'luiz', 1, () => roll));
    expect(draw(0).outcome).toBe(0);
    expect(draw(0.2499).outcome).toBe(0);
    expect(draw(0.25).outcome).toBe(300);
    expect(draw(0.6).outcome).toBe(600);
    expect(draw(0.85).outcome).toBe(1000);
    expect(draw(0.9999).outcome).toBe(1000);
    const played = draw(0.3);
    expect(played.week.friends.luiz.bank).toBe(450);
    expect(played.week.friends.luiz.fakeRepublicDay).toBe(1);
    expect(fakeRepublic(played.week, 'luiz', 0, () => 0.9)).toEqual({ ok: false, reason: 'already_played' });
    const poorAgain = clone(played.week);
    poorAgain.friends.luiz.bank = 10;
    poorAgain.day = 2;
    expect(fakeRepublic(poorAgain, 'luiz', 0, () => 0).ok).toBe(true);
  });

  it('Fake Republic outcome frequencies follow the weights and the pick does not matter', () => {
    const poor = newWeek();
    poor.friends.luiz.bank = 0;
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const counts = new Map<number, number>();
    for (let i = 0; i < 20000; i += 1) {
      const r = ok(fakeRepublic(poor, 'luiz', (i % 3) as 0 | 1 | 2, rand));
      counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
      expect(r.week.friends.luiz.bank).toBeGreaterThanOrEqual(0);
    }
    const weights = [0.25, 0.35, 0.25, 0.15];
    FAKE_REPUBLIC_OUTCOMES.forEach((o, i) => expect((counts.get(o) ?? 0) / 20000).toBeCloseTo(weights[i]!, 1));
  });

  it('goalDone marks a pending goal done once and cheers the present friends', () => {
    const w = newWeek();
    w.goals = [{ id: 'eat', status: 'pending' }];
    const done = goalDone(w, 'eat', ['luiz']);
    expect(done.goals[0]!.status).toBe('done');
    expect(done.friends.luiz.happiness).toBe(75);
    expect(done.friends.huu.happiness).toBe(70);
    expect(goalDone(done, 'eat', ['luiz']).friends.luiz.happiness).toBe(75);
  });
});

describe('W6 endDay and W7 loseDay', () => {
  it('endDay costs present friends 10 happiness per missed goal, resets tiredness and moves on', () => {
    let w = run(newWeek(), 100, ['luiz', 'huu']);
    w.goals = [{ id: 'a', status: 'pending' }];
    const next = endDay(w, ['a', 'b'], ['luiz']);
    expect(next.day).toBe(2);
    expect(next.clock).toBe(0);
    expect(next.finishedDays).toEqual([1]);
    expect(next.goals).toEqual([]);
    expect(next.friends.luiz.happiness).toBe(50);
    expect(next.friends.luiz.tiredness).toBe(10);
    expect(next.friends.huu.tiredness).toBeCloseTo(16, 6);
    expect(next.friends.huu.happiness).toBeLessThan(71);
    expect(next.morning?.day).toBe(2);
    expect(next.morning?.morning).toBeNull();
    expect(next.morning?.friends.luiz.happiness).toBe(50);
  });

  it('endDay without present applies to everyone and clamps happiness at 0', () => {
    const next = endDay(newWeek(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    for (const id of ALL) expect(next.friends[id].happiness).toBe(0);
  });

  it('loseDay returns this morning, keeps finished days and can be lost again', () => {
    const day2 = endDay(newWeek(), []);
    const played = run(withCash(day2, 'luiz', 5), 200);
    const lost = loseDay(played);
    expect(lost.day).toBe(2);
    expect(lost.clock).toBe(0);
    expect(lost.finishedDays).toEqual([1]);
    expect(lost.friends.luiz.cash).toBe(0);
    expect(lost.friends.luiz.food).toBe(80);
    expect(loseDay(run(lost, 50)).friends.luiz.food).toBe(80);
  });
});

describe('W8 serialise and parse', () => {
  it('round trips a played week', () => {
    let w = endDay(run(newWeek(), 90), ['x']);
    w = ok(withdraw(w, 'luiz', 100)).week;
    w = ok(buy(w, 'luiz', 'treedent')).week;
    w.goals = [{ id: 'eat', status: 'skipped' }];
    expect(parseWeek(serialiseWeek(w))).toEqual(w);
    expect(parseWeek(serialiseWeek(newWeek()))).toEqual(newWeek());
  });

  it('gives null for corrupt storage: bad json, wrong version, malformed values', () => {
    const good = JSON.parse(serialiseWeek(newWeek()));
    const mutate = (fn: (w: any) => void) => {
      const w = clone(good);
      fn(w);
      return JSON.stringify(w);
    };
    expect(parseWeek('')).toBeNull();
    expect(parseWeek('{not json')).toBeNull();
    expect(parseWeek('null')).toBeNull();
    expect(parseWeek('[]')).toBeNull();
    expect(parseWeek('"x"')).toBeNull();
    expect(parseWeek(mutate((w) => (w.version = 2)))).toBeNull();
    expect(parseWeek(mutate((w) => delete w.version))).toBeNull();
    expect(parseWeek(mutate((w) => delete w.friends.huu))).toBeNull();
    expect(parseWeek(mutate((w) => (w.friends.huu.health = 'lots')))).toBeNull();
    expect(parseWeek(mutate((w) => (w.friends.huu.items = ['bomb'])))).toBeNull();
    expect(parseWeek(mutate((w) => (w.friends.huu.caffeine = null)))).toBeNull();
    expect(parseWeek(mutate((w) => (w.goals = [{ id: 'a', status: 'nope' }])))).toBeNull();
    expect(parseWeek(mutate((w) => (w.day = 1.5)))).toBeNull();
    expect(parseWeek(mutate((w) => (w.morning.version = 9)))).toBeNull();
    expect(parseWeek(mutate((w) => (w.morning.morning = clone(w.morning))))).toBeNull();
  });
});
