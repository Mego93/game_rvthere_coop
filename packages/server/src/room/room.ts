import {
  CAMPAIGN,
  DEFAULT_TIME_OF_DAY,
  DEFAULT_WEATHER,
  PLAYER_COLOURS,
  SERVER_MAX_CATCHUP_STEPS,
  PROP_MOVED_EPSILON,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  TICK_RATE,
  createWorld,
  resultsOf,
  type AdminTool,
  type BuiltCourse,
  type ErrorReason,
  type InputFields,
  type ItemKind,
  type LobbyMessage,
  type Phase,
  type PlayerInput,
  type PropSnapshot,
  type Rapier,
  type ResultsMessage,
  type RoomSettings,
  type ServerMessage,
  type SnapshotMessage,
  type World,
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
  ready: boolean;
  // False while the slot is held for a dropped connection; nothing holds slots yet.
  connected: boolean;
}

export interface Room {
  readonly noun: string;
  phase(): Phase;
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
  // After the lobby message to a joiner: sends the last results to a player who joins while they are shown.
  catchUp(player: RoomPlayer): void;
  // The lobby and run commands answer the reason they were refused, or null. The checks run in the order not_admin, bad_phase, not_ready.
  setReady(player: RoomPlayer, ready: boolean): ErrorReason | null;
  configure(by: RoomPlayer, settings: RoomSettings): ErrorReason | null;
  start(by: RoomPlayer): ErrorReason | null;
  restartCheckpoint(by: RoomPlayer): ErrorReason | null;
  restartCourse(by: RoomPlayer): ErrorReason | null;
  adminTool(by: RoomPlayer, tool: AdminTool): ErrorReason | null;
  toLobby(by: RoomPlayer): ErrorReason | null;
  // Selects the next campaign course and enters the lobby; refused on the last course or one outside the campaign.
  next(by: RoomPlayer): ErrorReason | null;
  pushInput(player: RoomPlayer, input: PlayerInput): void;
  // Spends the crew's coins on an item at a fuel station's counter; applies at once.
  buy(player: RoomPlayer, item: ItemKind): 'ok' | 'cannot_buy';
  // Runs the simulation ticks that are due at `now` and broadcasts snapshots.
  update(now: number): void;
  // When the last player left, or null while anyone is connected.
  emptySince(): number | null;
  // Whether anyone with a token other than the creator's has ever joined.
  everJoinedByOthers(): boolean;
  // Tests only.
  debugWorld(): World | null;
  dispose(): void;
}

export interface RoomConfig {
  noun: string;
  // Tests only: a course to use instead of the id's, for each id listed.
  courses?: Readonly<Record<string, BuiltCourse>>;
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
  let phase: Phase = 'lobby';
  // Only exists while playing, and frozen while the results are shown.
  let world: World | null = null;
  let settings: RoomSettings = { courseId: CAMPAIGN[0]!, vehicleId: 'lodgy', timeOfDay: DEFAULT_TIME_OF_DAY, weather: DEFAULT_WEATHER };
  let lastResults: ResultsMessage | null = null;
  // The latest final time of each course finished since the room was created.
  const finished = new Map<string, number>();
  // Kept in the order players joined.
  const players: RoomPlayer[] = [];
  let nextPlayerNumber = 1;
  let adminId: string | null = null;
  // Ticks since the run started, and how many of them the current world has run.
  let tick = 0;
  let worldTicks = 0;
  // Added to a world's tick so that tick numbers keep rising across the worlds of one run.
  let tickOffset = 0;
  // The time at which tick 0 would have run, given the ticks simulated so far.
  let startTime = createdAt;
  // The time of the latest update; a run starts counting from it.
  let lastNow = createdAt;
  let emptySince: number | null = createdAt;
  // The first token to join is the creator's.
  let creatorToken: string | null = null;
  let joinedByOthers = false;

  const broadcast = (message: ServerMessage) => {
    const data = JSON.stringify(message);
    for (const player of players) if (player.connected) player.connection.send(data);
  };

  const broadcastLobby = () => {
    broadcast({
      type: 'lobby',
      room: config.noun,
      phase,
      players: players.map(({ playerId, name, colour, ready, connected }) => ({ playerId, name, colour, ready, connected })),
      adminId,
      ...settings,
    } satisfies LobbyMessage);
  };

  // The pose last sent for each prop, whoever was sent it; the room's one record of what clients have been told.
  const lastSent = new Map<string, PropSnapshot>();
  // Rule K8: a lost vehicle makes the next broadcast full for everyone.
  let restarted = false;

  const broadcastSnapshot = (current: World) => {
    const taken = current.snapshot();
    const snapshot = { ...taken, tick: taken.tick + tickOffset };
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
      if (!player.connected) continue;
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

  // A world for the room's configuration, with every player in it and cp-0 recorded.
  const createRunWorld = (): World => {
    const next = createWorld(rapier, { courseId: settings.courseId, vehicleId: settings.vehicleId }, config.courses?.[settings.courseId]);
    try {
      for (const player of players) next.addPlayer(player.playerId);
      next.recordStart();
    } catch (error) {
      next.dispose();
      throw error;
    }
    return next;
  };

  const enterResults = (current: World) => {
    phase = 'results';
    const results = resultsOf(current.status(), { id: settings.courseId, targetTime: current.course.targetTime }, settings);
    finished.set(settings.courseId, results.finalTime);
    lastResults = { type: 'results', ...results };
    if (CAMPAIGN.every((id) => finished.has(id))) lastResults.campaignTotal = CAMPAIGN.reduce((sum, id) => sum + finished.get(id)!, 0);
    // The snapshot goes out at once, outside the cadence, so that clients see the win.
    broadcastSnapshot(current);
    broadcastLobby();
    broadcast(lastResults);
  };

  // Returns true when this tick won the run.
  const stepOnce = (current: World): boolean => {
    const inputs = new Map<string, InputFields>();
    for (const player of players) inputs.set(player.playerId, player.queue.next().input);
    if (current.step(inputs).some((event) => event.kind === 'vehicleLost')) restarted = true;
    tick += 1;
    worldTicks += 1;
    if (current.status().state === 'won') {
      enterResults(current);
      return true;
    }
    if (tick % SNAPSHOT_EVERY_TICKS === 0) broadcastSnapshot(current);
    return false;
  };

  const refusal = (by: RoomPlayer, ...allowed: Phase[]): ErrorReason | null => {
    if (by.playerId !== adminId) return 'not_admin';
    return allowed.includes(phase) ? null : 'bad_phase';
  };

  const enterLobby = () => {
    world?.dispose();
    world = null;
    lastResults = null;
    phase = 'lobby';
    for (const player of players) player.ready = false;
    broadcastLobby();
  };

  return {
    noun: config.noun,
    phase: () => phase,
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
        ready: false,
        connected: true,
      };
      nextPlayerNumber += 1;
      creatorToken ??= token;
      if (token !== creatorToken) joinedByOthers = true;
      players.push(player);
      // In the lobby there is no world, and in the results the world is frozen, so a joiner there only joins the list.
      if (phase === 'playing') world?.addPlayer(player.playerId);
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
      world?.removePlayer(player.playerId);
      // The role passes to the longest-connected player, or to the next to join if nobody is left.
      if (adminId === player.playerId) adminId = players[0]?.playerId ?? null;
      if (players.length === 0) emptySince = now;
      broadcastLobby();
    },
    announce: broadcastLobby,
    catchUp(player) {
      if (phase === 'results' && lastResults) player.connection.send(JSON.stringify(lastResults));
    },
    setReady(player, ready) {
      if (phase !== 'lobby') return 'bad_phase';
      if (player.ready === ready) return null;
      player.ready = ready;
      broadcastLobby();
      return null;
    },
    configure(by, next) {
      const refused = refusal(by, 'lobby');
      if (refused) return refused;
      settings = { courseId: next.courseId, vehicleId: next.vehicleId, timeOfDay: next.timeOfDay, weather: next.weather };
      broadcastLobby();
      return null;
    },
    start(by) {
      const refused = refusal(by, 'lobby');
      if (refused) return refused;
      if (players.some((player) => player.playerId !== adminId && player.connected && !player.ready)) return 'not_ready';
      // Built first: if it throws, the room is still in the lobby, untouched.
      const fresh = createRunWorld();
      for (const player of players) {
        player.queue = createInputQueue();
        player.sentFull = false;
      }
      lastSent.clear();
      restarted = false;
      tick = 0;
      worldTicks = 0;
      tickOffset = 0;
      startTime = lastNow;
      lastResults = null;
      world = fresh;
      phase = 'playing';
      broadcastLobby();
      return null;
    },
    restartCourse(by) {
      const refused = refusal(by, 'playing');
      if (refused) return refused;
      // The queues stay: the client's game keeps running and its seq keeps rising.
      const fresh = createRunWorld();
      const old = world;
      world = fresh;
      old?.dispose();
      tickOffset += worldTicks;
      worldTicks = 0;
      lastSent.clear();
      restarted = true;
      return null;
    },
    restartCheckpoint(by) {
      const refused = refusal(by, 'playing');
      if (refused) return refused;
      world?.restartCheckpoint();
      return null;
    },
    adminTool(by, tool) {
      const refused = refusal(by, 'playing');
      if (refused) return refused;
      // A skip moves the whole crew, so the next snapshot is full for everyone.
      if (world?.adminTool(tool) && tool === 'skipCheckpoint') restarted = true;
      return null;
    },
    toLobby(by) {
      const refused = refusal(by, 'playing', 'results');
      if (refused) return refused;
      enterLobby();
      return null;
    },
    next(by) {
      const refused = refusal(by, 'results');
      if (refused) return refused;
      const index = CAMPAIGN.indexOf(settings.courseId);
      if (index === -1 || index === CAMPAIGN.length - 1) return 'bad_phase';
      settings = { ...settings, courseId: CAMPAIGN[index + 1]! };
      enterLobby();
      return null;
    },
    pushInput(player, input) {
      if (phase === 'playing') player.queue.push(input);
    },
    buy: (player, item) => (phase === 'playing' && world ? world.buy(player.playerId, item) : 'cannot_buy'),
    update(now) {
      lastNow = now;
      if (phase !== 'playing' || !world) return;
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
      // After the win the world is frozen, even if more ticks are due.
      for (let i = 0; i < due; i++) if (stepOnce(world)) break;
    },
    emptySince: () => emptySince,
    everJoinedByOthers: () => joinedByOthers,
    debugWorld: () => world,
    dispose: () => world?.dispose(),
  };
}
