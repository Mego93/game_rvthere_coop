import { CHAT_MAX_LENGTH, ITEM_KINDS, NAME_MAX_LENGTH, PLAYER_COLOUR_PATTERN, TIMES_OF_DAY, WEATHERS, type ItemKind, type TimeOfDay, type Weather } from './constants';
import { courseIds } from './courses/index';
import { clamp, deepFreeze, type Quat, type Vec3 } from './math';
import type { PropSnapshot } from './props';
import type { VehicleState } from './vehicle';
import { VEHICLE_IDS } from './vehicles';
import type { CableSnapshot } from './winch';
import type { WorldSnapshot } from './world';

export interface PlayerInput {
  // Starts at 1 and rises by 1 with every input the client sends.
  seq: number;
  moveX: number;
  moveY: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  interact: boolean;
  use: boolean;
  reel: -1 | 0 | 1;
  slot: 0 | 1 | 2;
  drop: boolean;
  // Absent means false, so a client without the button keeps working.
  reset?: boolean;
  sprint?: boolean;
  crouch?: boolean;
}

export type InputFields = Omit<PlayerInput, 'seq'>;

export const NEUTRAL_INPUT: InputFields = deepFreeze({
  moveX: 0,
  moveY: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  interact: false,
  use: false,
  reel: 0,
  slot: 0,
  drop: false,
});

// The input substituted for a silent player: nothing pressed, aim and slot as they were.
export function neutralInput(last: InputFields): InputFields {
  return { ...NEUTRAL_INPUT, yaw: last.yaw, pitch: last.pitch, slot: last.slot };
}

// The path of the WebSocket endpoint on the server. No room can be named "ws".
export const SOCKET_PATH = '/ws';

export type ClientMessage =
  | { type: 'create'; name: string; token: string }
  | { type: 'join'; room: string; name: string; token: string }
  | ({ type: 'input' } & PlayerInput)
  | { type: 'buy'; item: ItemKind }
  | { type: 'pong' }
  | { type: 'ready'; ready: boolean }
  | ({ type: 'configure' } & RoomSettings)
  | { type: 'kick'; playerId: string }
  | { type: 'start' }
  | { type: 'restartCheckpoint' }
  | { type: 'restartCourse' }
  | { type: 'adminTool'; tool: AdminTool }
  | { type: 'toLobby' }
  | { type: 'next' }
  | { type: 'chat'; text: string };

export const ADMIN_TOOLS = ['skipCheckpoint', 'refill'] as const;
export type AdminTool = (typeof ADMIN_TOOLS)[number];

export interface RoomSettings {
  courseId: string;
  vehicleId: string;
  timeOfDay: TimeOfDay;
  weather: Weather;
}

export type Phase = 'lobby' | 'playing' | 'results';

// The type comes from the list, so a reason cannot be added to one and forgotten in the other.
export const ERROR_REASONS = ['unknown_room', 'room_full', 'name_taken', 'bad_message', 'server_full', 'cannot_buy', 'kicked', 'not_admin', 'not_ready', 'bad_phase', 'replaced'] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

export interface LobbyPlayer {
  playerId: string;
  name: string;
  colour: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyMessage {
  type: 'lobby';
  room: string;
  phase: Phase;
  players: LobbyPlayer[];
  adminId: string | null;
  courseId: string;
  vehicleId: string;
  timeOfDay: TimeOfDay;
  weather: Weather;
}

export interface ResultsMessage {
  type: 'results';
  courseId: string;
  vehicleId: string;
  timeOfDay: TimeOfDay;
  weather: Weather;
  elapsed: number;
  restarts: number;
  respawns: number;
  wallet: number;
  coinsCollected: number;
  coinsTotal: number;
  finalTime: number;
  stars: [boolean, boolean, boolean];
  assisted: boolean;
  // Present once every campaign course has a final time.
  campaignTotal?: number;
}

// Crouched capsule and low eye: 'crouch' and 'slide'; absent, or a stance this version does not know, is standing.
export const isCrouchedStance = (stance: PlayerSnapshot['stance'] | string | undefined): boolean => stance === 'crouch' || stance === 'slide';

export interface PlayerSnapshot {
  playerId: string;
  // The feet.
  pos: Vec3;
  yaw: number;
  seat: string | null;
  // The id of the prop in the hands.
  hands: string | null;
  ground: { bodyId: string; localPos: Vec3 } | null;
  // The state the local client's predictor resets to.
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
  inventory: [ItemKind | null, ItemKind | null, ItemKind | null];
  slot: 0 | 1 | 2;
  // The item use in progress; progress is 0..1.
  hold: { action: string; targetId: string; progress: number } | null;
  // The server's health rounded down, 0..100.
  health: number;
  // Seconds left before respawn while downed.
  downed: number | null;
  // Absent means standing; a stance this version does not know is read as standing.
  stance?: 'crouch' | 'slide';
  // Present only while a slide or its cooldown runs; timers are whole ticks.
  slide?: { ticks: number; cooldown: number; air: number; dirX: number; dirZ: number; launch?: number };
}

export const EVENT_KINDS = ['impact', 'checkpoint', 'vehicleLost', 'pickup', 'use', 'hookAttach', 'hookDetach', 'coin', 'buy', 'hurt', 'downed', 'revive', 'respawn', 'goatHit', 'scooterHit'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface EventMessage {
  type: 'event';
  kind: EventKind;
  tick: number;
  playerId?: string;
  pos?: Vec3;
}

export interface SnapshotMessage extends WorldSnapshot {
  type: 'snapshot';
  // The props that moved since the last one sent to this room's clients, or every prop when `full`.
  props: PropSnapshot[];
  // The last input sequence number the server consumed for the receiving client; 0 before any.
  ackSeq: number;
  full: boolean;
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; room: string }
  | LobbyMessage
  | SnapshotMessage
  | EventMessage
  | ResultsMessage
  | { type: 'error'; reason: ErrorReason }
  | ChatMessage
  | { type: 'ping' };

// `id` counts a room's chat lines from 1; `at` is the server clock in whole seconds, opaque to clients.
export interface ChatMessage {
  type: 'chat';
  id: number;
  playerId: string;
  name: string;
  text: string;
  at: number;
}

const ROOM_PATTERN = /^[a-z0-9]{1,24}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// Control, format, private-use, unassigned and line or paragraph separator characters; look-alike letters still pass (known limit).
const FORBIDDEN_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;

export const hasForbiddenNameCharacter = (value: string): boolean => FORBIDDEN_NAME_CHARACTERS.test(value);

// A trimmed display name, or null if it is not 1 to 16 characters or has a forbidden character.
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) return null;
  return hasForbiddenNameCharacter(name) ? null : name;
}

// A trimmed chat line of 1 to CHAT_MAX_LENGTH code points with no forbidden character, or null.
export function cleanChat(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length === 0 || text.length > CHAT_MAX_LENGTH * 2) return null;
  if ([...text].length > CHAT_MAX_LENGTH) return null;
  return hasForbiddenNameCharacter(text) ? null : text;
}

// A room noun in lower case, or null if it is not a valid one.
export function cleanRoom(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const room = value.trim().toLowerCase();
  return ROOM_PATTERN.test(room) ? room : null;
}

// A session token the server accepts, or null.
export const cleanToken = (value: unknown): string | null =>
  typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;

const isTimeOfDay = (value: unknown): value is TimeOfDay => (TIMES_OF_DAY as readonly unknown[]).includes(value);
const isWeather = (value: unknown): value is Weather => (WEATHERS as readonly unknown[]).includes(value);
const isCourseId = (value: unknown): value is string => typeof value === 'string' && courseIds().includes(value);
const isVehicleId = (value: unknown): value is string => (VEHICLE_IDS as readonly unknown[]).includes(value);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Brings an angle into (-PI, PI].
function wrapAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

// Clamps the axes and pitch and wraps the yaw; the server and the predictor use the same.
export function sanitiseInput(fields: InputFields): InputFields {
  return {
    ...fields,
    moveX: clamp(fields.moveX, -1, 1),
    moveY: clamp(fields.moveY, -1, 1),
    yaw: wrapAngle(fields.yaw),
    pitch: clamp(fields.pitch, -Math.PI / 2, Math.PI / 2),
  };
}

function parseInput(data: Record<string, unknown>): PlayerInput | null {
  const { seq, moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop } = data;
  if (!Number.isSafeInteger(seq) || (seq as number) < 1) return null;
  if (!finite(moveX) || !finite(moveY) || !finite(yaw) || !finite(pitch)) return null;
  if (typeof jump !== 'boolean' || typeof interact !== 'boolean') return null;
  if (typeof use !== 'boolean' || typeof drop !== 'boolean') return null;
  const { reset, sprint, crouch } = data;
  if (reset !== undefined && typeof reset !== 'boolean') return null;
  if (sprint !== undefined && typeof sprint !== 'boolean') return null;
  if (crouch !== undefined && typeof crouch !== 'boolean') return null;
  if (reel !== -1 && reel !== 0 && reel !== 1) return null;
  if (slot !== 0 && slot !== 1 && slot !== 2) return null;
  const fields = sanitiseInput({ moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop });
  return {
    seq: seq as number,
    ...fields,
    ...(reset === undefined ? {} : { reset }),
    ...(sprint === undefined ? {} : { sprint }),
    ...(crouch === undefined ? {} : { crouch }),
  };
}

// Validates one message from a client. Returns null for anything malformed.
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  switch (fields.type) {
    case 'create': {
      const name = cleanName(fields.name);
      const token = cleanToken(fields.token);
      return name && token ? { type: 'create', name, token } : null;
    }
    case 'join': {
      const room = cleanRoom(fields.room);
      const name = cleanName(fields.name);
      const token = cleanToken(fields.token);
      return room && name && token ? { type: 'join', room, name, token } : null;
    }
    case 'input': {
      const input = parseInput(fields);
      return input ? { type: 'input', ...input } : null;
    }
    case 'buy':
      return typeof fields.item === 'string' && Object.hasOwn(ITEM_KINDS, fields.item) ? { type: 'buy', item: fields.item as ItemKind } : null;
    case 'pong':
      return { type: 'pong' };
    case 'ready':
      return typeof fields.ready === 'boolean' ? { type: 'ready', ready: fields.ready } : null;
    case 'configure': {
      const { courseId, vehicleId, timeOfDay, weather } = fields;
      return isCourseId(courseId) && isVehicleId(vehicleId) && isTimeOfDay(timeOfDay) && isWeather(weather)
        ? { type: 'configure', courseId, vehicleId, timeOfDay, weather }
        : null;
    }
    case 'kick':
      return typeof fields.playerId === 'string' && fields.playerId !== '' ? { type: 'kick', playerId: fields.playerId } : null;
    case 'start':
    case 'restartCheckpoint':
    case 'restartCourse':
    case 'toLobby':
    case 'next':
      return { type: fields.type };
    case 'chat': {
      const text = cleanChat(fields.text);
      return text ? { type: 'chat', text } : null;
    }
    case 'adminTool':
      return typeof fields.tool === 'string' && (ADMIN_TOOLS as readonly string[]).includes(fields.tool)
        ? { type: 'adminTool', tool: fields.tool as AdminTool }
        : null;
    default:
      return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isVec3 = (value: unknown): value is Vec3 =>
  isRecord(value) && finite(value.x) && finite(value.y) && finite(value.z);
const isQuat = (value: unknown): value is Quat => isRecord(value) && finite(value.w) && isVec3(value);
const isVec2 = (value: unknown): value is { x: number; z: number } =>
  isRecord(value) && finite(value.x) && finite(value.z);
const isVehicleState = (value: unknown): value is VehicleState =>
  isRecord(value) &&
  isVec3(value.pos) &&
  isQuat(value.rot) &&
  isVec3(value.linvel) &&
  (value.resetReady === undefined || typeof value.resetReady === 'boolean') &&
  finite(value.throttle) &&
  finite(value.steer) &&
  finite(value.fuel) &&
  finite(value.health);
const isPlayerSnapshot = (value: unknown): value is PlayerSnapshot =>
  isRecord(value) &&
  isText(value.playerId) &&
  isVec3(value.pos) &&
  finite(value.yaw) &&
  (value.seat === null || isText(value.seat)) &&
  (value.hands === null || isText(value.hands)) &&
  (value.ground === null || (isRecord(value.ground) && isText(value.ground.bodyId) && isVec3(value.ground.localPos))) &&
  isVec2(value.walk) &&
  isVec2(value.carry) &&
  finite(value.vy) &&
  typeof value.grounded === 'boolean' &&
  Array.isArray(value.inventory) &&
  value.inventory.length === 3 &&
  value.inventory.every((slot) => slot === null || isText(slot)) &&
  (value.slot === 0 || value.slot === 1 || value.slot === 2) &&
  finite(value.health) &&
  value.health >= 0 &&
  value.health <= 100 &&
  (value.downed === null || (finite(value.downed) && value.downed >= 0)) &&
  (value.hold === null || (isRecord(value.hold) && isText(value.hold.action) && isText(value.hold.targetId) && finite(value.hold.progress))) &&
  (value.stance === undefined || isText(value.stance)) &&
  (value.slide === undefined ||
    (isRecord(value.slide) &&
      isCount(value.slide.ticks) &&
      isCount(value.slide.cooldown) &&
      isCount(value.slide.air) &&
      finite(value.slide.dirX) &&
      finite(value.slide.dirZ) &&
      (value.slide.launch === undefined || (finite(value.slide.launch) && value.slide.launch >= 0))));
const isPropSnapshot = (value: unknown): value is PropSnapshot =>
  isRecord(value) && isText(value.id) && isText(value.kind) && isVec3(value.pos) && isQuat(value.rot);
// Far above the most the director keeps alive (9).
const MAX_ANIMALS = 32;
const isAnimalSnapshot = (value: unknown): boolean =>
  isRecord(value) &&
  isCount(value.id) &&
  (value.kind === 'goat' || value.kind === 'scooter') &&
  finite(value.x) &&
  finite(value.y) &&
  finite(value.z) &&
  finite(value.yaw) &&
  (value.hit === undefined || value.hit === true);
const isCableSnapshot = (value: unknown): value is CableSnapshot =>
  isRecord(value) &&
  (value.state === 'stowed' || value.state === 'held' || value.state === 'ground' || value.state === 'attached') &&
  (value.holderId === null || isText(value.holderId)) &&
  (value.anchorId === null || isText(value.anchorId)) &&
  isVec3(value.hookPos) &&
  finite(value.length) &&
  (value.reel === -1 || value.reel === 0 || value.reel === 1);
const isLobbyPlayer = (value: unknown): value is LobbyPlayer =>
  isRecord(value) &&
  isText(value.playerId) &&
  isText(value.name) &&
  isText(value.colour) &&
  PLAYER_COLOUR_PATTERN.test(value.colour) &&
  typeof value.ready === 'boolean' &&
  typeof value.connected === 'boolean';

// Checks one message from the server. Returns null for anything the page cannot use.
// The server is trusted, but the page may be older than it, and one snapshot without finite numbers would spoil the interpolation for good.
// Fields this version does not know are kept, so a newer server can add to a message.
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const message = data as unknown as ServerMessage;
  switch (data.type) {
    case 'ping':
      return message;
    case 'welcome':
      return isText(data.playerId) && isText(data.room) ? message : null;
    case 'error':
      if (!isText(data.reason)) return null;
      // A reason this version does not know is shown as a general refusal.
      return (ERROR_REASONS as readonly string[]).includes(data.reason) ? message : { type: 'error', reason: 'bad_message' };
    case 'chat':
      return isCount(data.id) && isText(data.playerId) && isText(data.name) && isText(data.text) && isCount(data.at) ? message : null;
    case 'lobby':
      return isText(data.room) &&
        (data.phase === 'lobby' || data.phase === 'playing' || data.phase === 'results') &&
        Array.isArray(data.players) &&
        data.players.every(isLobbyPlayer) &&
        (data.adminId === null || isText(data.adminId)) &&
        isText(data.courseId) &&
        isText(data.vehicleId) &&
        isTimeOfDay(data.timeOfDay) &&
        isWeather(data.weather)
        ? message
        : null;
    case 'snapshot':
      return isCount(data.tick) &&
        isCount(data.ackSeq) &&
        finite(data.elapsed) &&
        data.elapsed >= 0 &&
        isCount(data.checkpoint) &&
        isCount(data.checkpointCount) &&
        isCount(data.restarts) &&
        isCount(data.respawns) &&
        Array.isArray(data.coinsLeft) &&
        data.coinsLeft.every(isText) &&
        isCount(data.wallet) &&
        isCount(data.coinsCollected) &&
        isCount(data.coinsTotal) &&
        data.coinsLeft.length <= data.coinsTotal &&
        data.coinsCollected <= data.coinsTotal &&
        typeof data.won === 'boolean' &&
        typeof data.assisted === 'boolean' &&
        typeof data.full === 'boolean' &&
        isVehicleState(data.vehicle) &&
        Array.isArray(data.players) &&
        data.players.every(isPlayerSnapshot) &&
        Array.isArray(data.props) &&
        data.props.every(isPropSnapshot) &&
        (data.animals === undefined || (Array.isArray(data.animals) && data.animals.length <= MAX_ANIMALS && data.animals.every(isAnimalSnapshot))) &&
        isCableSnapshot(data.cable)
        ? message
        : null;
    case 'event':
      return (EVENT_KINDS as readonly unknown[]).includes(data.kind) &&
        isCount(data.tick) &&
        (data.playerId === undefined || isText(data.playerId)) &&
        (data.pos === undefined || isVec3(data.pos))
        ? message
        : null;
    case 'results':
      return isText(data.courseId) &&
        isText(data.vehicleId) &&
        isTimeOfDay(data.timeOfDay) &&
        isWeather(data.weather) &&
        finite(data.elapsed) &&
        data.elapsed >= 0 &&
        isCount(data.restarts) &&
        isCount(data.respawns) &&
        isCount(data.wallet) &&
        isCount(data.coinsCollected) &&
        isCount(data.coinsTotal) &&
        data.coinsCollected <= data.coinsTotal &&
        finite(data.finalTime) &&
        data.finalTime >= 0 &&
        Array.isArray(data.stars) &&
        data.stars.length === 3 &&
        data.stars.every((star) => typeof star === 'boolean') &&
        typeof data.assisted === 'boolean' &&
        (data.campaignTotal === undefined || (finite(data.campaignTotal) && data.campaignTotal >= 0))
        ? message
        : null;
    default:
      return null;
  }
}
