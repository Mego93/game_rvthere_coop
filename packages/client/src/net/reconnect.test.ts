import { describe, expect, it } from 'vitest';
import { HELD_SLOT_TIMEOUT, SILENCE_TIMEOUT } from '@lodgy/shared';
import {
  RECONNECT_DELAYS,
  RECONNECT_IDLE,
  RECONNECT_WINDOW,
  SERVER_SILENCE,
  reconnectStep,
  resumeAction,
  type ReconnectState,
} from './reconnect';

const joined: ReconnectState = { kind: 'joined' };

describe('reconnectStep', () => {
  it('derives its constants from shared', () => {
    expect(RECONNECT_WINDOW).toBe(HELD_SLOT_TIMEOUT);
    expect(SERVER_SILENCE).toBe(SILENCE_TIMEOUT);
  });

  it('joined from any state goes to joined', () => {
    for (const s of [RECONNECT_IDLE, joined, { kind: 'gaveUp' } as const]) {
      expect(reconnectStep(s, 'joined', 5)).toEqual({ state: joined, action: 'none' });
    }
  });

  it('schedules the first attempt after the first delay when dropped while joined', () => {
    const r = reconnectStep(joined, 'dropped', 10);
    expect(r.state).toEqual({ kind: 'reconnecting', droppedAt: 10, failures: 0 });
    expect(r.action).toEqual({ connectAt: 10.5 });
  });

  it('ignores a drop outside joined', () => {
    expect(reconnectStep(RECONNECT_IDLE, 'dropped', 1).action).toBe('none');
    const rec = reconnectStep(joined, 'dropped', 1).state;
    expect(reconnectStep(rec, 'dropped', 2)).toEqual({ state: rec, action: 'none' });
  });

  it('walks the delays and repeats the last', () => {
    let state = reconnectStep(joined, 'dropped', 0).state;
    const gaps: number[] = [];
    let now = 0;
    for (let i = 0; i < 4; i++) {
      const r = reconnectStep(state, 'attemptFailed', now);
      expect(typeof r.action).toBe('object');
      gaps.push((r.action as { connectAt: number }).connectAt - now);
      state = r.state;
    }
    expect(gaps).toEqual([1, 2, 4, 8]);
    const r = reconnectStep(state, 'attemptFailed', 0);
    expect(r.action).toEqual({ connectAt: RECONNECT_DELAYS[4] });
    const again = reconnectStep(r.state, 'attemptFailed', 0);
    expect(again.action).toEqual({ connectAt: RECONNECT_DELAYS[4] });
  });

  it('still attempts at exactly the window and gives up after it', () => {
    const rec = reconnectStep(joined, 'dropped', 100).state;
    const atBoundary = reconnectStep(rec, 'attemptFailed', 100 + RECONNECT_WINDOW - RECONNECT_DELAYS[1]!);
    expect(atBoundary.action).toEqual({ connectAt: 100 + RECONNECT_WINDOW });
    const past = reconnectStep(rec, 'attemptFailed', 100 + RECONNECT_WINDOW - RECONNECT_DELAYS[1]! + 0.01);
    expect(past.action).toBe('giveUp');
    expect(past.state).toEqual({ kind: 'gaveUp' });
  });

  it('gives up at once on kicked, refused and left from any state', () => {
    const rec = reconnectStep(joined, 'dropped', 0).state;
    for (const s of [RECONNECT_IDLE, joined, rec]) {
      for (const e of ['kicked', 'refused', 'left'] as const) {
        expect(reconnectStep(s, e, 3)).toEqual({ state: { kind: 'gaveUp' }, action: 'giveUp' });
      }
    }
  });

  it('a join after reconnecting resets', () => {
    const rec = reconnectStep(reconnectStep(joined, 'dropped', 0).state, 'attemptFailed', 1).state;
    const back = reconnectStep(rec, 'joined', 2).state;
    expect(reconnectStep(back, 'dropped', 50).state).toEqual({ kind: 'reconnecting', droppedAt: 50, failures: 0 });
  });
});

describe('resumeAction', () => {
  const base = { autoJoining: false, inRoom: false, hasSocket: false, hasAttempt: false, hasAttemptTimer: false, reconnecting: false };
  it('rejoins an auto-join that never sent', () => {
    expect(resumeAction({ ...base, autoJoining: true })).toBe('autoJoin');
    expect(resumeAction({ ...base, autoJoining: true, hasSocket: true })).toBe('none');
  });
  it('restarts a reconnect that has neither attempt nor timer', () => {
    expect(resumeAction({ ...base, reconnecting: true, inRoom: false })).toBe('scheduleAttempt');
    expect(resumeAction({ ...base, reconnecting: true, hasAttempt: true })).toBe('none');
    expect(resumeAction({ ...base, reconnecting: true, hasAttemptTimer: true })).toBe('none');
  });
  it('starts reconnecting when joined but the socket is gone', () => {
    expect(resumeAction({ ...base, inRoom: true })).toBe('beginReconnect');
    expect(resumeAction({ ...base, inRoom: true, hasSocket: true })).toBe('none');
    expect(resumeAction(base)).toBe('none');
  });
});
