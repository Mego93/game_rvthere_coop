import { HELD_SLOT_TIMEOUT, SILENCE_TIMEOUT } from '@lodgy/shared';

export const RECONNECT_WINDOW = HELD_SLOT_TIMEOUT;
export const RECONNECT_DELAYS = [0.5, 1, 2, 4, 8];
export const SOCKET_OPEN_TIMEOUT = 8;
export const SERVER_SILENCE = SILENCE_TIMEOUT;

export type ReconnectState =
  | { kind: 'idle' }
  | { kind: 'joined' }
  | { kind: 'reconnecting'; droppedAt: number; failures: number }
  | { kind: 'gaveUp' };

export type ReconnectEvent = 'joined' | 'dropped' | 'attemptFailed' | 'kicked' | 'refused' | 'left';
export type ReconnectAction = 'none' | 'giveUp' | { connectAt: number };

export const RECONNECT_IDLE: ReconnectState = { kind: 'idle' };

const delayAfter = (failures: number) => RECONNECT_DELAYS[Math.min(failures, RECONNECT_DELAYS.length - 1)]!;

// Pure: `now` and the returned `connectAt` are in seconds.
export function reconnectStep(
  state: ReconnectState,
  event: ReconnectEvent,
  now: number,
): { state: ReconnectState; action: ReconnectAction } {
  switch (event) {
    case 'joined':
      return { state: { kind: 'joined' }, action: 'none' };
    case 'kicked':
    case 'refused':
    case 'left':
      return { state: { kind: 'gaveUp' }, action: 'giveUp' };
    case 'dropped':
      if (state.kind !== 'joined') return { state, action: 'none' };
      return {
        state: { kind: 'reconnecting', droppedAt: now, failures: 0 },
        action: { connectAt: now + delayAfter(0) },
      };
    case 'attemptFailed': {
      if (state.kind !== 'reconnecting') return { state, action: 'none' };
      const failures = state.failures + 1;
      const connectAt = now + delayAfter(failures);
      if (connectAt > state.droppedAt + RECONNECT_WINDOW) return { state: { kind: 'gaveUp' }, action: 'giveUp' };
      return { state: { ...state, failures }, action: { connectAt } };
    }
  }
}

export type ResumeAction = 'none' | 'autoJoin' | 'scheduleAttempt' | 'beginReconnect';

// What a page restored from the back/forward cache must do, given what it still holds.
export function resumeAction(page: {
  autoJoining: boolean;
  inRoom: boolean;
  hasSocket: boolean;
  hasAttempt: boolean;
  hasAttemptTimer: boolean;
  reconnecting: boolean;
}): ResumeAction {
  if (page.autoJoining && !page.hasSocket) return 'autoJoin';
  if (page.reconnecting) return !page.hasAttempt && !page.hasAttemptTimer ? 'scheduleAttempt' : 'none';
  if (page.inRoom && !page.hasSocket && !page.hasAttempt) return 'beginReconnect';
  return 'none';
}
