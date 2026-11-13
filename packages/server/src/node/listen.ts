import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import RAPIER from '@dimforge/rapier3d-compat';
import { SOCKET_PATH } from '@lodgy/shared';
import { WebSocketServer } from 'ws';
import { createRoomServer } from '../room/server';
import { serveStatic } from './static';

// No valid message is anywhere near this size; larger ones close the connection.
const MAX_MESSAGE_BYTES = 4096;

export interface ServerOptions {
  // 0 picks a free port.
  port: number;
  // The folder holding the built client.
  clientDir: string;
  vehicleId?: string;
  // Told about every failure the server survives. The default prints it.
  onError?: (error: unknown) => void;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

// Wires the room layer to real sockets, real time and an initialised Rapier, and serves the client on the same port.
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  await RAPIER.init();
  const report = options.onError ?? ((error: unknown) => console.error(error));
  // An exception thrown inside a socket or timer callback would end the process, and every room with it.
  const contain = (fn: () => void, onFailure?: () => void) => {
    try {
      fn();
    } catch (error) {
      report(error);
      onFailure?.();
    }
  };
  const rooms = createRoomServer(
    {
      rapier: RAPIER,
      clock: () => performance.now() / 1000,
      random: Math.random,
      onError: report,
      timer: {
        every(seconds, fn) {
          const id = setInterval(() => contain(fn), seconds * 1000);
          return () => clearInterval(id);
        },
      },
    },
    { vehicleId: options.vehicleId },
  );

  const http = createServer((request, response) => {
    serveStatic(options.clientDir, request, response).catch(() => response.destroy());
  });
  const sockets = new WebSocketServer({ server: http, path: SOCKET_PATH, maxPayload: MAX_MESSAGE_BYTES });
  // ws repeats the HTTP server's errors here, and an error event nobody listens to is thrown. They are handled on `http`.
  sockets.on('error', () => {});
  sockets.on('connection', (socket) => {
    const handle = rooms.connect({
      send(data) {
        if (socket.readyState === socket.OPEN) socket.send(data);
      },
      close: () => socket.close(),
    });
    socket.on('message', (data, isBinary) => {
      // The protocol is JSON text; a binary frame is not part of it.
      if (isBinary) socket.close();
      else contain(() => handle.message(data.toString()), () => socket.terminate());
    });
    socket.on('close', () => contain(() => handle.closed()));
    // An oversized or malformed frame raises an error; the socket is then dropped.
    socket.on('error', () => socket.terminate());
  });

  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(options.port, () => {
        http.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    // The port is taken, most likely. Without this the room timer would keep the process alive.
    rooms.stop();
    throw error;
  }
  http.on('error', report);

  return {
    port: (http.address() as AddressInfo).port,
    async close() {
      rooms.stop();
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
