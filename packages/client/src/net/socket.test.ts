import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@lodgy/shared';
import { openSocket, type SocketDeps, type WebSocketLike } from './socket';
import { SERVER_SILENCE, SOCKET_OPEN_TIMEOUT } from './reconnect';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined | 'none' = 'none';
  private listeners: Record<string, ((e: any) => void)[]> = {};
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
  }
  addEventListener(type: 'open' | 'message' | 'close', fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  message(data: string) {
    this.emit('message', { data });
  }
}

function setup() {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sockets: FakeSocket[] = [];
  const deps: SocketDeps = {
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id),
  };
  const advance = (seconds: number) => {
    const end = t + seconds * 1000;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = end;
  };
  const events: string[] = [];
  const closes: { code: number; byPage: boolean }[] = [];
  const messages: ServerMessage[] = [];
  const sock = openSocket(
    'ws://x',
    {
      onOpen: () => events.push('open'),
      onMessage: (m) => messages.push(m),
      onClose: (info) => closes.push(info),
    },
    deps,
  );
  return { sock, native: sockets[0]!, advance, events, closes, messages };
}

const ping = '{"type":"ping"}';

describe('openSocket', () => {
  it('reports the native close code with byPage false, once', () => {
    const { native, closes } = setup();
    native.open();
    native.emit('close', { code: 1001 });
    native.emit('close', { code: 1006 });
    expect(closes).toEqual([{ code: 1001, byPage: false }]);
  });

  it('close() reports 1000 byPage synchronously, once, and ignores later native events', () => {
    const { sock, native, closes, events, messages, advance } = setup();
    native.open();
    sock.close();
    expect(closes).toEqual([{ code: 1000, byPage: true }]);
    native.emit('close', { code: 1000 });
    native.open();
    native.message(ping);
    native.message('{"type":"nonsense"}');
    sock.close();
    advance(60);
    expect(closes).toHaveLength(1);
    expect(events).toEqual(['open']);
    expect(messages).toEqual([]);
  });

  it('answers pings and does not pass them on', () => {
    const { native, messages } = setup();
    native.open();
    native.message(ping);
    expect(native.sent).toEqual(['{"type":"pong"}']);
    expect(messages).toEqual([]);
  });

  it('times out an open that never happens with 4000, once, synchronously', () => {
    const { native, advance, closes, events } = setup();
    advance(SOCKET_OPEN_TIMEOUT - 0.1);
    expect(closes).toEqual([]);
    advance(0.2);
    expect(closes).toEqual([{ code: 4000, byPage: false }]);
    expect(native.closedWith).not.toBe('none');
    native.emit('close', { code: 1006 });
    native.open();
    advance(60);
    expect(closes).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('does not time out once open', () => {
    const { native, advance, closes } = setup();
    advance(SOCKET_OPEN_TIMEOUT - 1);
    native.open();
    native.message(ping);
    advance(SOCKET_OPEN_TIMEOUT);
    expect(closes.find((c) => c.code === 4000)).toBeUndefined();
  });

  it('reports server silence with 4001 and ignores later events', () => {
    const { native, advance, closes } = setup();
    native.open();
    advance(SERVER_SILENCE - 0.1);
    expect(closes).toEqual([]);
    advance(0.2);
    expect(closes).toEqual([{ code: 4001, byPage: false }]);
    native.message(ping);
    native.emit('close', { code: 1006 });
    advance(60);
    expect(closes).toHaveLength(1);
  });

  it('resets the silence timer on a ping, past 6 s in total', () => {
    const { native, advance, closes } = setup();
    native.open();
    advance(SERVER_SILENCE - 1);
    native.message(ping);
    advance(SERVER_SILENCE - 1);
    expect(closes).toEqual([]);
    advance(1.5);
    expect(closes).toEqual([{ code: 4001, byPage: false }]);
  });

  it('send does nothing unless open', () => {
    const { sock, native } = setup();
    sock.send({ type: 'pong' } as never);
    expect(native.sent).toEqual([]);
    native.open();
    sock.send({ type: 'pong' } as never);
    expect(native.sent).toEqual(['{"type":"pong"}']);
  });

  it('a socket that fires its close event inside close() cannot report the wrong code', () => {
    const { sock, native, advance, closes } = setup();
    native.close = () => native.emit('close', { code: 1006 });
    native.open();
    sock.close();
    expect(closes).toEqual([{ code: 1000, byPage: true }]);
    const second = setup();
    second.native.close = () => second.native.emit('close', { code: 1006 });
    second.advance(SOCKET_OPEN_TIMEOUT + 0.1);
    expect(second.closes).toEqual([{ code: 4000, byPage: false }]);
    advance(0);
  });
});
