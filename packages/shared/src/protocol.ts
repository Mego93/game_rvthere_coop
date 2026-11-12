import { NAME_MAX_LENGTH } from './constants';
import { clamp, deepFreeze } from './math';
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

export type ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message' | 'server_full';

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

export interface SnapshotMessage extends WorldSnapshot {
  type: 'snapshot';
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

const cleanToken = (value: unknown): string | null =>
  typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Brings an angle into (-PI, PI].
function wrapAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

function parseInput(data: Record<string, unknown>): PlayerInput | null {
  const { seq, moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop } = data;
  if (!Number.isSafeInteger(seq) || (seq as number) < 1) return null;
  if (!finite(moveX) || !finite(moveY) || !finite(yaw) || !finite(pitch)) return null;
  if (typeof jump !== 'boolean' || typeof interact !== 'boolean') return null;
  if (typeof use !== 'boolean' || typeof drop !== 'boolean') return null;
  if (reel !== -1 && reel !== 0 && reel !== 1) return null;
  if (slot !== 0 && slot !== 1 && slot !== 2) return null;
  return {
    seq: seq as number,
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    yaw: wrapAngle(yaw),
    pitch: clamp(pitch, -Math.PI / 2, Math.PI / 2),
    jump,
    interact,
    use,
    reel,
    slot,
    drop,
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
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}
