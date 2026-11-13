import {
  EMPTY_ROOM_TIMEOUT,
  MAX_PLAYERS,
  MAX_ROOMS,
  PING_INTERVAL,
  SILENCE_TIMEOUT,
  TICK_DT,
  getCourse,
  getVehicleConfig,
  parseClientMessage,
  type ClientMessage,
  type ErrorReason,
  type ServerMessage,
} from '@lodgy/shared';
import { pickNoun } from './nouns';
import { createRateLimiter, type RateLimiter } from './rateLimit';
import { createRoom, type Room, type RoomPlayer } from './room';
import type { Connection, ConnectionHandle, RoomDeps, RoomServer, RoomServerOptions } from './types';

interface Session {
  connection: Connection;
  limiter: RateLimiter;
  lastHeard: number;
  lastPing: number;
  // Set when the connection threw; the next tick drops the session.
  failed: boolean;
  room: Room | null;
  player: RoomPlayer | null;
}

export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}): RoomServer {
  const courseId = options.courseId ?? 'test';
  const vehicleId = options.vehicleId ?? 'lodgy';
  // Fail at start-up, not at the first room, if either id is wrong.
  getCourse(courseId);
  getVehicleConfig(vehicleId);

  const rooms = new Map<string, Room>();
  const sessions = new Set<Session>();

  const send = (connection: Connection, message: ServerMessage) => connection.send(JSON.stringify(message));
  const refuse = (session: Session, reason: ErrorReason) => send(session.connection, { type: 'error', reason });

  // Forgets a session whose connection is gone, and takes its player out of the room.
  const forget = (session: Session) => {
    if (!sessions.delete(session)) return;
    if (session.room && session.player) session.room.remove(session.player, deps.clock());
  };

  // Puts a session in a room: welcome goes to the newcomer first, then the lobby message to everyone.
  const admit = (session: Session, room: Room, player: RoomPlayer) => {
    session.room = room;
    session.player = player;
    send(session.connection, { type: 'welcome', playerId: player.playerId, room: room.noun });
    room.announce();
  };

  // Takes a session out of its room and closes its connection.
  const drop = (session: Session) => {
    forget(session);
    session.connection.close();
  };

  const create = (session: Session, message: Extract<ClientMessage, { type: 'create' }>) => {
    if (rooms.size >= MAX_ROOMS) return refuse(session, 'server_full');
    const noun = pickNoun(deps.random, (candidate) => rooms.has(candidate));
    const room = createRoom(deps.rapier, { noun, courseId, vehicleId }, deps.clock());
    rooms.set(noun, room);
    admit(session, room, room.add(message.name, message.token, session.connection));
  };

  const join = (session: Session, message: Extract<ClientMessage, { type: 'join' }>) => {
    const room = rooms.get(message.room);
    if (!room) return refuse(session, 'unknown_room');

    const existing = room.findByToken(message.token);
    if (existing) {
      // The same tab has come back while its old connection still looks alive (a socket that dropped without closing): it takes its slot over at once.
      for (const other of sessions) {
        if (other.player === existing) {
          other.room = null;
          other.player = null;
          sessions.delete(other);
        }
      }
      room.replaceConnection(existing, session.connection).close();
      admit(session, room, existing);
      return;
    }

    if (room.playerCount() >= MAX_PLAYERS) return refuse(session, 'room_full');
    if (room.nameTaken(message.name)) return refuse(session, 'name_taken');
    admit(session, room, room.add(message.name, message.token, session.connection));
  };

  const handle = (session: Session, raw: string) => {
    // A connection that failed is as good as gone; it is dropped at the next tick.
    if (!sessions.has(session) || session.failed) return;
    const now = deps.clock();
    session.lastHeard = now;
    const verdict = session.limiter.hit(now);
    if (verdict === 'close') return drop(session);
    if (verdict === 'drop') return;

    const message = parseClientMessage(raw);
    if (!message) return refuse(session, 'bad_message');
    switch (message.type) {
      case 'pong':
        return;
      case 'input': {
        // Input from a connection that is not in a room is ignored.
        if (!session.room || !session.player) return;
        const { type: _type, ...input } = message;
        session.room.pushInput(session.player, input);
        return;
      }
      case 'create':
        if (session.room) return refuse(session, 'bad_message');
        return create(session, message);
      case 'join':
        if (session.room) return refuse(session, 'bad_message');
        return join(session, message);
    }
  };

  // Frees the world of a room that has already left `rooms`. A failure is reported; the room is gone either way.
  const free = (room: Room) => {
    try {
      room.dispose();
    } catch (error) {
      deps.onError?.(error);
    }
  };

  // Closes a failed room: its players are disconnected and its world is freed.
  const discard = (noun: string, room: Room) => {
    rooms.delete(noun);
    for (const session of [...sessions]) {
      if (session.room !== room) continue;
      sessions.delete(session);
      session.connection.close();
    }
    free(room);
  };

  const tick = () => {
    const now = deps.clock();
    for (const session of [...sessions]) {
      if (session.failed || now - session.lastHeard >= SILENCE_TIMEOUT) {
        drop(session);
      } else if (now - session.lastPing >= PING_INTERVAL) {
        session.lastPing = now;
        send(session.connection, { type: 'ping' });
      }
    }
    for (const [noun, room] of rooms) {
      try {
        room.update(now);
      } catch (error) {
        // A room whose simulation fails is closed, so that it cannot stop the other rooms.
        deps.onError?.(error);
        discard(noun, room);
        continue;
      }
      const emptySince = room.emptySince();
      if (emptySince !== null && now - emptySince >= EMPTY_ROOM_TIMEOUT) {
        rooms.delete(noun);
        free(room);
      }
    }
  };
  // Twice per simulation tick, so that a late timer callback rarely delays a tick by a whole period.
  const stopTimer = deps.timer.every(TICK_DT / 2, tick);

  return {
    connect(connection): ConnectionHandle {
      const now = deps.clock();
      const session: Session = {
        // Sends happen in the middle of a tick or of another player's join, so a throw is recorded and handled at the next tick.
        connection: {
          send(data) {
            if (session.failed) return;
            try {
              connection.send(data);
            } catch (error) {
              session.failed = true;
              deps.onError?.(error);
            }
          },
          close() {
            try {
              connection.close();
            } catch (error) {
              deps.onError?.(error);
            }
          },
        },
        limiter: createRateLimiter(),
        lastHeard: now,
        lastPing: now,
        failed: false,
        room: null,
        player: null,
      };
      sessions.add(session);
      return {
        message: (data) => handle(session, data),
        closed: () => forget(session),
      };
    },
    roomCount: () => rooms.size,
    stop() {
      stopTimer();
      const remaining = [...rooms.values()];
      rooms.clear();
      sessions.clear();
      for (const room of remaining) free(room);
    },
  };
}
