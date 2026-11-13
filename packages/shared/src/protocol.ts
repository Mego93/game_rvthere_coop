import { NAME_MAX_LENGTH, PLAYER_COLOUR_PATTERN, type ItemKind } from './constants';
import { clamp, deepFreeze, type Quat, type Vec3 } from './math';
import type { PropSnapshot } from './props';
import type { VehicleState } from './vehicle';
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
  | { type: 'pong' };

export type Phase = 'lobby' | 'playing' | 'results';

// The type comes from the list, so a reason cannot be added to one and forgotten in the other.
export const ERROR_REASONS = ['unknown_room', 'room_full', 'name_taken', 'bad_message', 'server_full'] as const;
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
}

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
  | { type: 'error'; reason: ErrorReason }
  | { type: 'ping' };

const ROOM_PATTERN = /^[a-z0-9]{1,24}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// A trimmed display name, or null if it is not 1 to 16 characters.
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= NAME_MAX_LENGTH ? name : null;
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
  if (reel !== -1 && reel !== 0 && reel !== 1) return null;
  if (slot !== 0 && slot !== 1 && slot !== 2) return null;
  return { seq: seq as number, ...sanitiseInput({ moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop }) };
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
    case 'pong':
      return { type: 'pong' };
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
  finite(value.throttle) &&
  finite(value.steer);
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
  typeof value.grounded === 'boolean';
const isPropSnapshot = (value: unknown): value is PropSnapshot =>
  isRecord(value) && isText(value.id) && isText(value.kind) && isVec3(value.pos) && isQuat(value.rot);
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
    case 'lobby':
      return isText(data.room) &&
        (data.phase === 'lobby' || data.phase === 'playing' || data.phase === 'results') &&
        Array.isArray(data.players) &&
        data.players.every(isLobbyPlayer) &&
        (data.adminId === null || isText(data.adminId)) &&
        isText(data.courseId) &&
        isText(data.vehicleId)
        ? message
        : null;
    case 'snapshot':
      return isCount(data.tick) &&
        isCount(data.ackSeq) &&
        typeof data.full === 'boolean' &&
        isVehicleState(data.vehicle) &&
        Array.isArray(data.players) &&
        data.players.every(isPlayerSnapshot) &&
        Array.isArray(data.props) &&
        data.props.every(isPropSnapshot) &&
        isCableSnapshot(data.cable)
        ? message
        : null;
    default:
      return null;
  }
}
