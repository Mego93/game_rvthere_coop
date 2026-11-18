import {
  CREATE_PER_MINUTE,
  EMPTY_ROOM_TIMEOUT,
  MAX_PLAYERS,
  MAX_ROOMS,
  PING_INTERVAL,
  SILENCE_TIMEOUT,
  SOLO_ROOM_TIMEOUT,
  STALL_GRACE,
  TICK_DT,
  parseClientMessage,
  type ClientMessage,
  type ErrorReason,
  type ServerMessage,
} from '@lodgy/shared';
import { pickNoun } from './nouns';
import { createRateLimiter, type RateLimiter } from './rateLimit';
import { createRoom, type Room, type RoomPlayer } from './room';
import type { Connection, ConnectionHandle, RoomDeps, RoomServer, RoomServerOptions } from './types';

// The window in which an address's creates are counted, in seconds.
const CREATE_WINDOW = 60;

interface Session {
  connection: Connection;
  address: string;
  limiter: RateLimiter;
  lastHeard: number;
  lastPing: number;
  // Set when the connection threw; the next tick drops the session.
  failed: boolean;
  room: Room | null;
  player: RoomPlayer | null;
}

export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}): RoomServer {
  const rooms = new Map<string, Room>();
  const sessions = new Set<Session>();
  // The session each connected player is on, so that a takeover finds it without scanning every session.
  const sessionOf = new Map<RoomPlayer, Session>();
  // When each address last created rooms, within CREATE_WINDOW; an address with none is not kept.
  const creates = new Map<string, number[]>();
  const createPerMinute = options.createPerMinute ?? CREATE_PER_MINUTE;
  const maxRooms = options.maxRooms ?? MAX_ROOMS;
  let lastTick = deps.clock();

  const send = (connection: Connection, message: ServerMessage) => connection.send(JSON.stringify(message));
  const refuse = (session: Session, reason: ErrorReason) => send(session.connection, { type: 'error', reason });

  // Failures are reported with the room they belong to, if any; the adapter rate-limits per source.
  const report = (error: unknown, source: string) => deps.onError?.(error, source, 0);
  const reportConnection = (error: unknown, room: Room | null) => report(error, room ? `connection:${room.noun}` : 'connection');

  // Forgets a session whose connection is gone, and takes its player out of the room.
  const forget = (session: Session) => {
    if (!sessions.delete(session)) return;
    if (session.room && session.player) {
      if (sessionOf.get(session.player) === session) sessionOf.delete(session.player);
      session.room.hold(session.player, deps.clock());
    }
  };

  // Puts a session in a room: welcome goes to the newcomer first, then the lobby message to everyone.
  const admit = (session: Session, room: Room, player: RoomPlayer) => {
    session.room = room;
    session.player = player;
    sessionOf.set(player, session);
    send(session.connection, { type: 'welcome', playerId: player.playerId, room: room.noun });
    room.announce();
    room.catchUp(player);
  };

  // Takes a session out of its room and closes its connection.
  const drop = (session: Session) => {
    forget(session);
    session.connection.close();
  };

  // The times of an address's creates that still count; drops the address from the map when none do.
  const recentCreates = (address: string, now: number) => {
    const times = (creates.get(address) ?? []).filter((time) => now - time < CREATE_WINDOW);
    if (times.length === 0) creates.delete(address);
    else creates.set(address, times);
    return times;
  };

  const create = (session: Session, message: Extract<ClientMessage, { type: 'create' }>) => {
    if (rooms.size >= maxRooms) return refuse(session, 'server_full');
    const now = deps.clock();
    const times = recentCreates(session.address, now);
    if (times.length >= createPerMinute) return refuse(session, 'server_full');
    const noun = options.fixedNoun ?? pickNoun(deps.random, (candidate) => rooms.has(candidate));
    if (rooms.has(noun)) return refuse(session, 'server_full');
    const room = createRoom(deps.rapier, { noun, courses: options.courses, campaign: options.campaign }, now);
    rooms.set(noun, room);
    creates.set(session.address, [...times, now]);
    const player = room.add(message.name, message.token, session.connection, now);
    admit(session, room, player);
  };

  const join = (session: Session, message: Extract<ClientMessage, { type: 'join' }>) => {
    const room = rooms.get(message.room);
    if (!room) return refuse(session, 'unknown_room');
    const now = deps.clock();

    const existing = room.findByToken(message.token);
    if (existing) {
      // The same tab has come back while its old connection still looks alive (a socket that dropped without closing): it takes its slot over at once.
      const other = sessionOf.get(existing);
      if (other) {
        other.room = null;
        other.player = null;
        sessions.delete(other);
        sessionOf.delete(existing);
        // Told before rejoin closes it, so the page does not fight back for the slot.
        send(other.connection, { type: 'error', reason: 'replaced' });
      }
      room.rejoin(existing, session.connection, now)?.close();
      admit(session, room, existing);
      return;
    }

    if (room.playerCount() >= MAX_PLAYERS) return refuse(session, 'room_full');
    if (room.nameTaken(message.name)) return refuse(session, 'name_taken');
    admit(session, room, room.add(message.name, message.token, session.connection, now));
  };

  // Runs a lobby or admin command; a connection that is not in a room gets bad_message.
  const command = (session: Session, run: (room: Room, player: RoomPlayer) => ErrorReason | null) => {
    if (!session.room || !session.player) return refuse(session, 'bad_message');
    const reason = run(session.room, session.player);
    if (reason) refuse(session, reason);
  };

  // The target is told it was kicked and its connection closed; a held slot has no connection to tell.
  const kick = (session: Session, playerId: string) =>
    command(session, (room, by) => {
      const target = room.findById(playerId);
      const reason = room.kick(by, playerId);
      if (reason || !target) return reason;
      const other = sessionOf.get(target);
      if (other) {
        sessions.delete(other);
        sessionOf.delete(target);
        send(other.connection, { type: 'error', reason: 'kicked' });
        other.connection.close();
      }
      return null;
    });

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
      case 'buy':
        if (!session.room || !session.player) return refuse(session, 'cannot_buy');
        if (session.room.buy(session.player, message.item) === 'cannot_buy') refuse(session, 'cannot_buy');
        return;
      case 'create':
        if (session.room) return refuse(session, 'bad_message');
        return create(session, message);
      case 'join':
        if (session.room) return refuse(session, 'bad_message');
        return join(session, message);
      case 'ready':
        return command(session, (room, player) => room.setReady(player, message.ready));
      case 'appearance': {
        const { type: _type, ...appearance } = message;
        return command(session, (room, player) => room.setAppearance(player, appearance));
      }
      case 'configure': {
        const { type: _type, ...settings } = message;
        return command(session, (room, player) => room.configure(player, settings));
      }
      case 'start':
        return command(session, (room, player) => room.start(player));
      case 'restartCheckpoint':
        return command(session, (room, player) => room.restartCheckpoint(player));
      case 'adminTool':
        return command(session, (room, player) => room.adminTool(player, message.tool));
      case 'next':
        return command(session, (room, player) => room.next(player));
      case 'restartCourse':
        return command(session, (room, player) => room.restartCourse(player));
      case 'toLobby':
        return command(session, (room, player) => room.toLobby(player));
      case 'chat':
        // Unlike the commands, a chat before joining is ignored, not refused.
        if (!session.room || !session.player) return;
        session.room.chat(session.player, message.text, now);
        return;
      case 'emote':
        // Like chat, ignored before joining.
        if (!session.room || !session.player) return;
        session.room.emote(session.player, message.emote, now);
        return;
      case 'kick':
        return kick(session, message.playerId);
      default:
        return refuse(session, 'bad_message');
    }
  };

  // Frees the world of a room that has already left `rooms`. A failure is reported; the room is gone either way.
  const free = (room: Room) => {
    try {
      room.dispose();
    } catch (error) {
      report(error, `room:${room.noun}`);
    }
  };

  // Closes a failed room: its players are disconnected and its world is freed.
  const discard = (noun: string, room: Room) => {
    rooms.delete(noun);
    for (const session of [...sessions]) {
      if (session.room !== room) continue;
      sessions.delete(session);
      if (session.player) sessionOf.delete(session.player);
      session.connection.close();
    }
    free(room);
  };

  const tick = () => {
    const now = deps.clock();
    // After a stall, sessions silent since before the previous run are credited the excess, so that the stall alone never drops anyone.
    const excess = now - lastTick - STALL_GRACE;
    if (excess > 0) {
      for (const session of sessions) {
        if (session.lastHeard <= lastTick) session.lastHeard = Math.min(now, session.lastHeard + excess);
      }
    }
    lastTick = now;
    for (const address of [...creates.keys()]) recentCreates(address, now);
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
        room.expireHeld(now);
        room.update(now);
      } catch (error) {
        // A room whose simulation fails is closed, so that it cannot stop the other rooms.
        report(error, `room:${room.noun}`);
        discard(noun, room);
        continue;
      }
      const emptySince = room.emptySince();
      // A room nobody but its creator joined is not worth keeping for long.
      const timeout = room.everJoinedByOthers() ? EMPTY_ROOM_TIMEOUT : SOLO_ROOM_TIMEOUT;
      if (emptySince !== null && now - emptySince >= timeout) {
        rooms.delete(noun);
        free(room);
      }
    }
  };
  // Twice per simulation tick, so that a late timer callback rarely delays a tick by a whole period.
  const stopTimer = deps.timer.every(TICK_DT / 2, tick);

  return {
    connect(connection, address): ConnectionHandle {
      const now = deps.clock();
      const session: Session = {
        address,
        // Sends happen in the middle of a tick or of another player's join, so a throw is recorded and handled at the next tick.
        connection: {
          send(data) {
            if (session.failed) return;
            try {
              connection.send(data);
            } catch (error) {
              session.failed = true;
              reportConnection(error, session.room);
            }
          },
          close() {
            try {
              connection.close();
            } catch (error) {
              reportConnection(error, session.room);
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
    debugWorld: (noun) => rooms.get(noun)?.debugWorld() ?? null,
    stop() {
      stopTimer();
      const remaining = [...rooms.values()];
      rooms.clear();
      sessions.clear();
      sessionOf.clear();
      creates.clear();
      for (const room of remaining) free(room);
    },
  };
}
