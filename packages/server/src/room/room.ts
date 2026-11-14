import {
  DEFAULT_TIME_OF_DAY,
  DEFAULT_WEATHER,
  PLAYER_COLOURS,
  SERVER_MAX_CATCHUP_STEPS,
  PROP_MOVED_EPSILON,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  TICK_RATE,
  createWorld,
  type InputFields,
  type ItemKind,
  type LobbyMessage,
  type PlayerInput,
  type BuiltCourse,
  type PropSnapshot,
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
  // Spends the crew's coins on an item at a fuel station's counter; applies at once.
  buy(player: RoomPlayer, item: ItemKind): 'ok' | 'cannot_buy';
  // Runs the simulation ticks that are due at `now` and broadcasts snapshots.
  update(now: number): void;
  // When the last player left, or null while anyone is connected.
  emptySince(): number | null;
  // Whether anyone with a token other than the creator's has ever joined.
  everJoinedByOthers(): boolean;
  dispose(): void;
}

export interface RoomConfig {
  noun: string;
  courseId: string;
  vehicleId: string;
  // Tests only: a course to use instead of the id's.
  course?: BuiltCourse;
}

const movedSince = (a: PropSnapshot, b: PropSnapshot) =>
  Math.abs(a.pos.x - b.pos.x) > PROP_MOVED_EPSILON ||
  Math.abs(a.pos.y - b.pos.y) > PROP_MOVED_EPSILON ||
  Math.abs(a.pos.z - b.pos.z) > PROP_MOVED_EPSILON ||
  Math.abs(a.rot.x - b.rot.x) > PROP_MOVED_EPSILON ||
  Math.abs(a.rot.y - b.rot.y) > PROP_MOVED_EPSILON ||
  Math.abs(a.rot.z - b.rot.z) > PROP_MOVED_EPSILON ||
  Math.abs(a.rot.w - b.rot.w) > PROP_MOVED_EPSILON;

export function createRoom(rapier: Rapier, config: RoomConfig, createdAt: number): Room {
  const world = createWorld(rapier, { courseId: config.courseId, vehicleId: config.vehicleId }, config.course);
  // Kept in the order players joined.
  const players: RoomPlayer[] = [];
  let nextPlayerNumber = 1;
  let adminId: string | null = null;
  let tick = 0;
  // The time at which tick 0 would have run, given the ticks simulated so far.
  let startTime = createdAt;
  let emptySince: number | null = createdAt;
  // The first token to join is the creator's.
  let creatorToken: string | null = null;
  let joinedByOthers = false;

  const broadcastLobby = () => {
    const message: LobbyMessage = {
      type: 'lobby',
      room: config.noun,
      phase: 'playing',
      players: players.map(({ playerId, name, colour }) => ({ playerId, name, colour, ready: false, connected: true })),
      adminId,
      courseId: config.courseId,
      vehicleId: config.vehicleId,
      timeOfDay: DEFAULT_TIME_OF_DAY,
      weather: DEFAULT_WEATHER,
    };
    const data = JSON.stringify(message);
    for (const player of players) player.connection.send(data);
  };

  // The pose last sent for each prop, whoever was sent it; the room's one record of what clients have been told.
  const lastSent = new Map<string, PropSnapshot>();
  // Rule K8: a lost vehicle makes the next broadcast full for everyone.
  let restarted = false;

  const broadcastSnapshot = () => {
    const snapshot = world.snapshot();
    // Rule I7: a prop or item that appeared or vanished cannot be told as a partial list, so everyone gets the whole.
    const idsChanged = snapshot.props.length !== lastSent.size || snapshot.props.some((prop) => !lastSent.has(prop.id));
    const full = idsChanged || restarted;
    if (full) lastSent.clear();
    restarted = false;
    const moved = snapshot.props.filter((prop) => {
      const sent = lastSent.get(prop.id);
      return !sent || movedSince(sent, prop);
    });
    for (const prop of moved) lastSent.set(prop.id, prop);
    for (const player of players) {
      const message: SnapshotMessage = {
        type: 'snapshot',
        ...snapshot,
        props: player.sentFull && !full ? moved : snapshot.props,
        ackSeq: player.queue.ackSeq(),
        full: !player.sentFull || full,
      };
      player.sentFull = true;
      player.connection.send(JSON.stringify(message));
    }
  };

  const stepOnce = () => {
    const inputs = new Map<string, InputFields>();
    for (const player of players) inputs.set(player.playerId, player.queue.next().input);
    if (world.step(inputs).some((event) => event.kind === 'vehicleLost')) restarted = true;
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
      creatorToken ??= token;
      if (token !== creatorToken) joinedByOthers = true;
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
    buy: (player, item) => world.buy(player.playerId, item),
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
    everJoinedByOthers: () => joinedByOthers,
    dispose: () => world.dispose(),
  };
}
