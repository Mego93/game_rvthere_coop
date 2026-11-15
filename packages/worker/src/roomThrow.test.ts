import RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '@lodgy/shared';
import { expect, test, vi } from 'vitest';
import { createGameRoom, type ServerSocket } from './room';
import { createWorkerTimer } from './workerTimer';

vi.mock('@lodgy/server/room', async (importActual) => {
  const actual = await importActual<typeof import('@lodgy/server/room')>();
  return {
    ...actual,
    createRoomServer: () => ({
      connect: () => ({
        message(data: string) {
          if (data === 'boom') throw new Error('boom');
        },
        closed() {},
      }),
      roomCount: () => 0,
      debugWorld: () => null,
      stop() {},
    }),
  };
});

class Fake implements ServerSocket {
  closes: number[] = [];
  listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {};
  accept() {}
  send() {}
  close(code?: number) {
    this.closes.push(code ?? 0);
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  message(data: string) {
    for (const listener of this.listeners.message ?? []) listener({ data });
  }
}

test('a throwing handler is reported and closes only that connection', () => {
  const sockets: Fake[] = [];
  const errors: unknown[] = [];
  const room = createGameRoom<Fake>({
    rapier: RAPIER as unknown as Rapier,
    clock: () => 0,
    random: () => 0,
    timer: createWorkerTimer(() => {}),
    onError: (error) => errors.push(error),
    createPair: () => {
      const socket = new Fake();
      sockets.push(socket);
      return { client: socket, server: socket };
    },
  });
  room.upgrade('tagine', '1.1.1.1');
  room.upgrade('tagine', '2.2.2.2');
  sockets[0]!.message('boom');
  expect(sockets[0]!.closes).toEqual([1011]);
  expect(sockets[1]!.closes).toEqual([]);
  expect(errors).toHaveLength(1);
  expect(room.connections()).toBe(1);
  sockets[1]!.message('fine');
  expect(sockets[1]!.closes).toEqual([]);
});
