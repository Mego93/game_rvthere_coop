import { parseServerMessage, type ClientMessage, type ServerMessage } from '@lodgy/shared';

export interface GameSocket {
  // Sends a message, or does nothing if the socket is not open.
  send(message: ClientMessage): void;
  close(): void;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(message: ServerMessage): void;
  // Called once, when the socket closes or fails to open.
  onClose(): void;
}

// Opens the game's WebSocket. Pings from the server are answered here and not passed on.
export function openSocket(url: string, handlers: SocketHandlers): GameSocket {
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => handlers.onOpen());
  socket.addEventListener('close', () => handlers.onClose());
  socket.addEventListener('message', (event) => {
    // A message the page cannot use is dropped.
    const message = parseServerMessage(String(event.data));
    if (!message) return;
    if (message.type === 'ping') socket.send('{"type":"pong"}');
    else handlers.onMessage(message);
  });
  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
}
