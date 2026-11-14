import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import RAPIER from '@dimforge/rapier3d-compat';
import { MAX_CONNECTIONS, MAX_CONNECTIONS_PER_ADDRESS, MAX_SEND_BUFFER, SOCKET_CLOSE_TIMEOUT, SOCKET_PATH } from '@lodgy/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { createReporter } from '../room/report';
import { createRoomServer } from '../room/server';
import { serveStatic } from './static';

// No valid message is anywhere near this size; larger ones close the connection.
const MAX_MESSAGE_BYTES = 4096;

export interface ServerOptions {
  // 0 picks a free port.
  port: number;
  // The folder holding the built client.
  clientDir: string;
  // Tests and the end-to-end run only: rooms start their run on creation. Remove in step 11 task 4a.
  autostart?: boolean;
  // Told about every failure the server survives, at most once per source per REPORT_INTERVAL. The default prints it.
  onError?: (error: unknown, source: string, suppressed: number) => void;
  // Behind a proxy on this machine (the Cloudflare Tunnel), the address comes from CF-Connecting-IP.
  trustProxy?: boolean;
  // Overrides of the constants, for tests and the end-to-end run.
  limits?: { createPerMinute?: number; perAddress?: number; total?: number };
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', '::1']);
const normalise = (address: string) => address.replace(/^::ffff:/, '');

// The address of the client: the socket's, or, when the proxy is trusted and the socket is loopback, CF-Connecting-IP.
export function clientAddress(remote: string | undefined, headers: IncomingHttpHeaders, trustProxy: boolean): string {
  const socketAddress = normalise(remote ?? 'unknown');
  if (!trustProxy || !LOOPBACK.has(socketAddress)) return socketAddress;
  const header = headers['cf-connecting-ip'];
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
  return first ? normalise(first) : socketAddress;
}

export interface SendableSocket {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  send(data: string): void;
  terminate(): void;
}

// Sends, and drops a socket whose queue shows that its reader cannot keep up.
export function sendOrDrop(socket: SendableSocket, data: string, cap: number = MAX_SEND_BUFFER): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(data);
  if (socket.bufferedAmount > cap) socket.terminate();
}

const refuse = (socket: Duplex, status: string) => {
  socket.on('error', () => {});
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
};

// Wires the room layer to real sockets, real time and an initialised Rapier, and serves the client on the same port.
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  await RAPIER.init();
  const clock = () => performance.now() / 1000;
  const report = createReporter(
    options.onError ??
      ((error, source, suppressed) => {
        console.error(error);
        if (suppressed > 0) console.error(`(${suppressed} more from ${source} were not printed)`);
      }),
    clock,
  );
  const totalCap = options.limits?.total ?? MAX_CONNECTIONS;
  const perAddressCap = options.limits?.perAddress ?? MAX_CONNECTIONS_PER_ADDRESS;
  // An exception thrown inside a socket or timer callback would end the process, and every room with it.
  const contain = (source: string, fn: () => void, onFailure?: () => void) => {
    try {
      fn();
    } catch (error) {
      report(source, error);
      onFailure?.();
    }
  };
  const rooms = createRoomServer(
    {
      rapier: RAPIER,
      clock,
      random: Math.random,
      onError: (error, source) => report(source, error),
      timer: {
        every(seconds, fn) {
          const id = setInterval(() => contain('timer', fn), seconds * 1000);
          return () => clearInterval(id);
        },
      },
    },
    { autostart: options.autostart, createPerMinute: options.limits?.createPerMinute },
  );

  const pathOf = (url: string | undefined) => {
    try {
      return new URL(url ?? '/', 'http://localhost').pathname;
    } catch {
      return null;
    }
  };
  const http = createServer((request, response) => {
    if (pathOf(request.url) === SOCKET_PATH) {
      response.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8', Upgrade: 'websocket' });
      response.end('Upgrade required\n');
      return;
    }
    serveStatic(options.clientDir, request, response, report).catch(() => response.destroy());
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    // A peer that never answers the close frame must not hold its connection slot for ws's default 30 s.
    // Spread because @types/ws 8.18 does not declare closeTimeout yet.
    ...{ closeTimeout: SOCKET_CLOSE_TIMEOUT * 1000 },
  });
  // ws repeats errors here, and an error event nobody listens to is thrown.
  sockets.on('error', () => {});

  let total = 0;
  const perAddress = new Map<string, number>();
  const accept = (socket: WebSocket, address: string) => {
    total += 1;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    socket.on('close', () => {
      total -= 1;
      const left = (perAddress.get(address) ?? 1) - 1;
      if (left > 0) perAddress.set(address, left);
      else perAddress.delete(address);
    });
    const handle = rooms.connect(
      {
        send: (data) => sendOrDrop(socket, data),
        close: () => socket.close(),
      },
      address,
    );
    socket.on('message', (data, isBinary) => {
      // The protocol is JSON text; a binary frame is not part of it.
      if (isBinary) socket.terminate();
      else contain('socket:message', () => handle.message(data.toString()), () => socket.terminate());
    });
    socket.on('close', () => contain('socket:close', () => handle.closed()));
    // An oversized or malformed frame raises an error; the socket is then dropped.
    socket.on('error', () => socket.terminate());
  };

  // Caps are checked before the upgrade completes, so a refused client costs no WebSocket.
  http.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    try {
      if (pathOf(request.url) !== SOCKET_PATH) return refuse(socket, '400 Bad Request');
      const address = clientAddress(request.socket.remoteAddress, request.headers, options.trustProxy ?? false);
      const full = total >= totalCap || (perAddress.get(address) ?? 0) >= perAddressCap;
      if (full) return refuse(socket, '503 Service Unavailable');
      sockets.handleUpgrade(request, socket, head, (ws) => accept(ws, address));
    } catch (error) {
      report('upgrade', error);
      socket.destroy();
    }
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
  http.on('error', (error) => report('http', error));

  return {
    port: (http.address() as AddressInfo).port,
    async close() {
      rooms.stop();
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      const closed = new Promise<void>((resolve) => http.close(() => resolve()));
      http.closeAllConnections();
      await closed;
    },
  };
}
