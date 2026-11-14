import { parseServerMessage, type ClientMessage, type ServerMessage } from '@lodgy/shared';
import { SERVER_SILENCE, SOCKET_OPEN_TIMEOUT } from './reconnect';

export interface GameSocket {
  // Sends a message, or does nothing if the socket is not open.
  send(message: ClientMessage): void;
  // Reports the close synchronously (code 1000, byPage true); nothing arrives afterwards.
  close(): void;
}

export interface CloseInfo {
  code: number;
  byPage: boolean;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(message: ServerMessage): void;
  // Called exactly once. 4000 is an open timeout and 4001 server silence, both reported by the page.
  onClose(info: CloseInfo): void;
}

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: 'open' | 'message' | 'close', fn: (event: any) => void): void;
};

export interface SocketDeps {
  createSocket(url: string): WebSocketLike;
  now(): number;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export const browserDeps: SocketDeps = {
  createSocket: (url) => new WebSocket(url),
  now: () => performance.now(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (id) => window.clearTimeout(id),
};

const OPEN = 1;

// Opens the game's WebSocket. Pings from the server are answered here and not passed on.
export function openSocket(url: string, handlers: SocketHandlers, deps: SocketDeps = browserDeps): GameSocket {
  const socket = deps.createSocket(url);
  let reported = false;
  let timer: number | null = null;

  const stopTimer = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const report = (info: CloseInfo) => {
    if (reported) return;
    reported = true;
    stopTimer();
    handlers.onClose(info);
  };
  const abandon = (code: number) => {
    if (reported) return;
    try {
      socket.close();
    } catch {
      // The socket is already gone.
    }
    report({ code, byPage: false });
  };
  const startTimer = (seconds: number, code: number) => {
    stopTimer();
    timer = deps.setTimer(() => abandon(code), seconds * 1000);
  };

  startTimer(SOCKET_OPEN_TIMEOUT, 4000);
  socket.addEventListener('open', () => {
    if (reported) return;
    startTimer(SERVER_SILENCE, 4001);
    handlers.onOpen();
  });
  socket.addEventListener('close', (event) => report({ code: event?.code ?? 1006, byPage: false }));
  socket.addEventListener('message', (event) => {
    if (reported) return;
    startTimer(SERVER_SILENCE, 4001);
    // A message the page cannot use is dropped.
    const message = parseServerMessage(String(event.data));
    if (!message) return;
    if (message.type === 'ping') socket.send('{"type":"pong"}');
    else handlers.onMessage(message);
  });
  return {
    send(message) {
      if (!reported && socket.readyState === OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      if (reported) return;
      try {
        socket.close();
      } catch {
        // The socket is already gone.
      }
      report({ code: 1000, byPage: true });
    },
  };
}
