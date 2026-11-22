import { RACE_SLOW_HAPPINESS } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { RACE_RESULT_SECONDS, raceClock, raceHudView, raceResultView, targetClock } from './raceView';

describe('raceClock and targetClock', () => {
  it('shows minutes, seconds and tenths, flooring so the display never runs ahead', () => {
    expect(raceClock(0)).toBe('0:00.0');
    expect(raceClock(9.96)).toBe('0:09.9');
    expect(raceClock(83.4)).toBe('1:23.4');
    expect(raceClock(160)).toBe('2:40.0');
    expect(raceClock(600.05)).toBe('10:00.0');
  });

  it('shows the target in whole minutes and seconds', () => {
    expect(targetClock(160)).toBe('2:40');
    expect(targetClock(165)).toBe('2:45');
    expect(targetClock(600)).toBe('10:00');
    expect(targetClock(59.9)).toBe('0:59');
  });

  it('shows nothing odd for a bad time', () => {
    expect(raceClock(-3)).toBe('0:00.0');
    expect(raceClock(Number.NaN)).toBe('0:00.0');
  });
});

describe('raceHudView', () => {
  it('has the big timer, the target line and the medal the pace would earn', () => {
    expect(raceHudView(83.4, 160)).toEqual({ timer: '1:23.4', target: 'Gold under 2:40', pace: 'gold' });
  });

  it('turns to silver at the target and to bronze at 1.25 times it', () => {
    expect(raceHudView(159.9, 160).pace).toBe('gold');
    expect(raceHudView(160, 160).pace).toBe('silver');
    expect(raceHudView(199.9, 160).pace).toBe('silver');
    expect(raceHudView(200, 160).pace).toBe('bronze');
  });

  it('has a timer of 0:00.0 before the first snapshot', () => {
    expect(raceHudView(0, 160).timer).toBe('0:00.0');
  });
});

describe('raceResultView', () => {
  it('names the medal, the time, the target and the happiness change for a gold', () => {
    expect(raceResultView({ time: 151.4, target: 160, medal: 'gold' })).toEqual({
      medal: 'gold',
      title: 'Gold medal',
      time: 'Your time 2:31.4',
      target: 'Gold under 2:40',
      happiness: 'Happiness +10',
    });
  });

  it('gives silver 5 and bronze nothing', () => {
    expect(raceResultView({ time: 170, target: 160, medal: 'silver' })).toMatchObject({ title: 'Silver medal', happiness: 'Happiness +5' });
    expect(raceResultView({ time: 250, target: 160, medal: 'bronze' })).toMatchObject({ title: 'Bronze medal', happiness: 'Happiness unchanged' });
  });

  it('shows the loss for a time over twice the target', () => {
    const slow = raceResultView({ time: 330, target: 160, medal: 'bronze' });
    expect(RACE_SLOW_HAPPINESS).toBe(-5);
    expect(slow.happiness).toBe('Happiness -5');
    expect(slow.medal).toBe('bronze');
  });

  it('stays up for 8 seconds', () => {
    expect(RACE_RESULT_SECONDS).toBe(8);
  });
});
