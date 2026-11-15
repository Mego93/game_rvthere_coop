import { MAX_MESSAGE_BYTES, type Rapier } from '@lodgy/shared';
import { createReporter, createRoomServer, type RoomServer, type Timer } from '@lodgy/server/room';

export interface GameRoomDeps {
  rapier: Rapier;
  clock: () => number;
  random: () => number;
  timer: Timer;
  onError: (error: unknown, source: string, suppressed: number) => void;
}

export interface GameRoom {
  // Accepts a WebSocket upgrade for this room and returns the 101 response.
  upgrade(request: Request): Response;
  server: RoomServer;
}

export function createGameRoom(deps: GameRoomDeps): GameRoom {
  const report = createReporter(deps.onError, deps.clock);
  const server = createRoomServer({ ...deps, onError: (error, source) => report(source, error) });
  const encoder = new TextEncoder();

  const upgrade = (request: Request): Response => {
    const address = request.headers.get('CF-Connecting-IP') ?? '127.0.0.1';
    const { 0: client, 1: socket } = new WebSocketPair();
    socket.accept();
    const handle = server.connect({ send: (data) => socket.send(data), close: () => socket.close() }, address);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        handle.closed();
      } catch (error) {
        report('socket:close', error);
      }
    };
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return socket.close(1003, 'text only');
      if (encoder.encode(event.data).length > MAX_MESSAGE_BYTES) return socket.close(1009, 'too large');
      try {
        handle.message(event.data);
      } catch (error) {
        report('socket:message', error);
        socket.close(1011, 'error');
      }
    });
    socket.addEventListener('close', finish);
    socket.addEventListener('error', finish);
    return new Response(null, { status: 101, webSocket: client });
  };
  return { upgrade, server };
}
