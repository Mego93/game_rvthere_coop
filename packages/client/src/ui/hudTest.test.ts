import { describe, expect, it } from 'vitest';
import { hudTestMode, sampleModel, sampleTouchView } from './hudTest';

describe('?hudtest', () => {
  it('is off unless the flag is present', () => {
    expect(hudTestMode('')).toBeNull();
    expect(hudTestMode('?hq')).toBeNull();
  });

  it('reads the mode, and falls back to the plain HUD for an unknown one', () => {
    expect(hudTestMode('?hudtest')).toBe('hud');
    expect(hudTestMode('?hudtest=menu')).toBe('menu');
    expect(hudTestMode('?hq&hudtest=emote')).toBe('emote');
    expect(hudTestMode('?hudtest=nonsense')).toBe('hud');
  });

  it('samples every HUD element at once', () => {
    for (const touch of [false, true]) {
      const model = sampleModel(touch);
      expect(model.vehicle).not.toBeNull();
      expect(model.ownSeat).not.toBeNull();
      expect(model.prompt).toBeTruthy();
      expect(model.hold).not.toBeNull();
      expect(model.downedSelf).not.toBeNull();
      expect(model.compass.marker).not.toBeNull();
      expect(model.slots.every((slot) => slot.kind !== null)).toBe(true);
    }
    expect(sampleModel(true).prompt).toMatch(/^Act to /);
  });

  it('shows every touch button on foot, and the driving set when driving', () => {
    const foot = sampleTouchView(false);
    expect([foot.useVisible, foot.reelVisible, foot.resetVisible, foot.sprintVisible, foot.fireVisible]).toEqual([true, true, true, true, true]);
    expect(sampleTouchView(true).seated).toBe(true);
  });
});
