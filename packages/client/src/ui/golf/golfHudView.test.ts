import { GOLF_BALLS_EACH, type GolfSnapshot } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { canShoot, golfHudView } from './golfHudView';
import { IDLE_SHOT, type ShotState } from './shot';

const golf = (patch: Partial<GolfSnapshot> = {}): GolfSnapshot => ({ turn: 'luiz', ball: null, scores: { luiz: [10, 20], huu: [50] }, ...patch });
const base = { local: 'luiz' as const, shot: IDLE_SHOT, boardShown: false, pop: null, touch: false };

describe('canShoot', () => {
  it('is true only for the player on turn while no ball is in play', () => {
    expect(canShoot(golf(), 'luiz')).toBe(true);
    expect(canShoot(golf(), 'huu')).toBe(false);
    expect(canShoot(golf({ ball: { x: 0, y: 3, z: -20 } }), 'luiz')).toBe(false);
    expect(canShoot(golf({ turn: null }), 'luiz')).toBe(false);
    expect(canShoot(golf(), null)).toBe(false);
  });
});

describe('golfHudView', () => {
  it('shows the turn, the local balls left and the meter on your turn', () => {
    const view = golfHudView({ golf: golf(), ...base });
    expect(view.turn).toBe('Your turn!');
    expect(view.balls).toBe(`Balls left: ${GOLF_BALLS_EACH - 2}`);
    expect(view.yourTurn).toBe(true);
    expect(view.meter.shown).toBe(true);
    expect(view.meter.hint).toContain('hold');
  });

  it('shows another player\'s turn without a meter', () => {
    const view = golfHudView({ golf: golf({ turn: 'huu' }), ...base });
    expect(view.turn).toBe("Huu's turn");
    expect(view.meter.shown).toBe(false);
    expect(view.yourTurn).toBe(false);
  });

  it('words the hint for touch, and for each phase of the shot', () => {
    expect(golfHudView({ golf: golf(), ...base, touch: true }).meter.hint).toContain('Shoot');
    const charging: ShotState = { ...IDLE_SHOT, phase: 'charging', power: 0.6, clock: 0.5, down: true };
    const view = golfHudView({ golf: golf(), ...base, shot: charging });
    expect(view.meter.power).toBe(0.6);
    expect(view.meter.marker).toBeNull();
    expect(view.meter.hint.toLowerCase()).toContain('release');
    const curve: ShotState = { ...IDLE_SHOT, phase: 'curve', power: 0.8, marker: -0.4, clock: 0.6 };
    const swept = golfHudView({ golf: golf(), ...base, shot: curve });
    expect(swept.meter.marker).toBe(-0.4);
    expect(swept.meter.power).toBe(0.8);
    expect(swept.meter.hint.toLowerCase()).toContain('tap');
  });

  it('hides the meter once the ball is out and while the shot is being sent', () => {
    expect(golfHudView({ golf: golf({ ball: { x: 0, y: 4, z: -40 } }), ...base }).meter.shown).toBe(false);
    expect(golfHudView({ golf: golf(), ...base, shot: { ...IDLE_SHOT, phase: 'sent', power: 0.5 } }).meter.hint).toBe('');
  });

  it('adds the scoreboard and the landing popup only when asked', () => {
    expect(golfHudView({ golf: golf(), ...base }).board).toBeNull();
    const view = golfHudView({ golf: golf(), ...base, boardShown: true, pop: { text: 'Red ring +10', tone: 'hit' } });
    expect(view.board!.map((row) => row.id)).toEqual(['luiz', 'huu']);
    expect(view.board!.find((row) => row.id === 'huu')!.total).toBe(50);
    expect(view.pop).toEqual({ text: 'Red ring +10', tone: 'hit' });
  });

  it('is empty of turn text when nobody has a ball left, and a spectator has no ball count', () => {
    expect(golfHudView({ golf: golf({ turn: null }), ...base }).turn).toBe('');
    expect(golfHudView({ golf: golf(), ...base, local: 'nandan' }).balls).toBe('');
  });
});
