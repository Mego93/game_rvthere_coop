import {
  PLAYER_COLOURS,
  SERVER_MAX_CATCHUP_STEPS,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  TICK_RATE,
  createWorld,
  type InputFields,
  type LobbyMessage,
  type PlayerInput,
  type Rapier,
  type SnapshotMessage,
} from '@lodgy/shared';
import { createInputQueue, type InputQueue } from './inputQueue';
import type { Connection } from './types';

export interface RoomPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly colour: string;
  readonly token: string;
  connection: Connection;
  queue: InputQueue;
  // Whether this connection has been sent a full snapshot yet.
  sentFull: boolean;
}

export interface Room {
  readonly noun: string;
  playerCount(): number;
  findByToken(token: string): RoomPlayer | undefined;
  // Names are compared ignoring case.
  nameTaken(name: string): boolean;
  // add and replaceConnection do not announce; the caller sends welcome first, then calls announce.
  add(name: string, token: string, connection: Connection): RoomPlayer;
  // Hands a player's slot to a new connection and returns the old one.
  replaceConnection(player: RoomPlayer, connection: Connection): Connection;
  remove(player: RoomPlayer, now: number): void;
  // Sends the lobby message to every player.
  announce(): void;
  pushInput(player: RoomPlayer, input: PlayerInput): void;
  // Runs the simulation ticks that are due at `now` and broadcasts snapshots.
  update(now: number): void;
  // When the last player left, or null while anyone is connected.
  emptySince(): number | null;
  dispose(): void;
}

export interface RoomConfig {
  noun: string;
  courseId: string;
  vehicleId: string;
}

export function createRoom(rapier: Rapier, config: RoomConfig, createdAt: number): Room {
  const world = createWorld(rapier, { courseId: config.courseId, vehicleId: config.vehicleId });
  // Kept in the order players joined: the first is the driver until seats exist (step 3).
  const players: RoomPlayer[] = [];
  let nextPlayerNumber = 1;
  let adminId: string | null = null;
  let tick = 0;
  // The time at which tick 0 would have run, given the ticks simulated so far.
  let startTime = createdAt;
  let emptySince: number | null = createdAt;

  const broadcastLobby = () => {
    const message: LobbyMessage = {
      type: 'lobby',
      room: config.noun,
      phase: 'playing',
      players: players.map(({ playerId, name, colour }) => ({ playerId, name, colour, ready: false, connected: true })),
      adminId,
      courseId: config.courseId,
      vehicleId: config.vehicleId,
    };
    const data = JSON.stringify(message);
    for (const player of players) player.connection.send(data);
  };

  const broadcastSnapshot = () => {
    const snapshot = world.snapshot();
    for (const player of players) {
      const message: SnapshotMessage = {
        type: 'snapshot',
        ...snapshot,
        ackSeq: player.queue.ackSeq(),
        full: !player.sentFull,
      };
      player.sentFull = true;
      player.connection.send(JSON.stringify(message));
    }
  };

  const stepOnce = () => {
    const inputs = new Map<string, InputFields>();
    for (const player of players) inputs.set(player.playerId, player.queue.next().input);
    world.step(inputs);
    tick += 1;
    if (tick % SNAPSHOT_EVERY_TICKS === 0) broadcastSnapshot();
  };

  return {
    noun: config.noun,
    playerCount: () => players.length,
    findByToken: (token) => players.find((player) => player.token === token),
    nameTaken(name) {
      const wanted = name.toLowerCase();
      return players.some((player) => player.name.toLowerCase() === wanted);
    },
    add(name, token, connection) {
      const colour = PLAYER_COLOURS.find((candidate) => !players.some((player) => player.colour === candidate));
      const player: RoomPlayer = {
        playerId: `p${nextPlayerNumber}`,
        name,
        colour: colour ?? PLAYER_COLOURS[0],
        token,
        connection,
        queue: createInputQueue(),
        sentFull: false,
      };
      nextPlayerNumber += 1;
      players.push(player);
      world.addPlayer(player.playerId);
      adminId ??= player.playerId;
      emptySince = null;
      return player;
    },
    replaceConnection(player, connection) {
      const old = player.connection;
      player.connection = connection;
      // The new connection numbers its inputs from 1 again and has seen no snapshot.
      player.queue = createInputQueue();
      player.sentFull = false;
      return old;
    },
    remove(player, now) {
      const index = players.indexOf(player);
      if (index === -1) return;
      players.splice(index, 1);
      world.removePlayer(player.playerId);
      // The role passes to the longest-connected player, or to the next to join if nobody is left.
      if (adminId === player.playerId) adminId = players[0]?.playerId ?? null;
      if (players.length === 0) emptySince = now;
      broadcastLobby();
    },
    announce: broadcastLobby,
    pushInput: (player, input) => player.queue.push(input),
    update(now) {
      if (players.length === 0) {
        // An empty room is paused: the world keeps its state and no time is owed when someone returns.
        startTime = now - tick * TICK_DT;
        return;
      }
      // The small allowance stops a tick being missed when floating-point error leaves the product just short.
      let due = Math.floor((now - startTime) * TICK_RATE + 1e-6) - tick;
      if (due > SERVER_MAX_CATCHUP_STEPS) {
        // Whatever is owed beyond the catch-up limit is discarded, so a stall cannot snowball.
        startTime += (due - SERVER_MAX_CATCHUP_STEPS) * TICK_DT;
        due = SERVER_MAX_CATCHUP_STEPS;
      }
      for (let i = 0; i < due; i++) stepOnce();
    },
    emptySince: () => emptySince,
    dispose: () => world.dispose(),
  };
}
