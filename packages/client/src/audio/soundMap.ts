import type { EventMessage } from '@lodgy/shared';

export type SoundName = 'impact' | 'hookAttach' | 'pickup' | 'use' | 'coin' | 'purchase' | 'hurt' | 'downed' | 'revive' | 'checkpoint' | 'vehicleLost' | 'click' | 'win';
export type LoopName = 'engine' | 'winch' | 'rain';

// Absolute paths under public/; null means no file, and the sound is skipped.
export const SOUND_FILES: Record<SoundName | LoopName, string | null> = {
  impact: '/sounds/impact.mp3',
  hookAttach: '/sounds/hook.mp3',
  pickup: '/sounds/pickup.mp3',
  use: '/sounds/use.mp3',
  coin: '/sounds/coin.mp3',
  purchase: '/sounds/purchase.mp3',
  hurt: '/sounds/hurt.mp3',
  downed: '/sounds/downed.mp3',
  revive: '/sounds/revive.mp3',
  checkpoint: '/sounds/checkpoint.mp3',
  vehicleLost: '/sounds/vehicleLost.mp3',
  click: '/sounds/click.mp3',
  win: '/sounds/win.mp3',
  engine: '/sounds/engine.wav',
  winch: '/sounds/winch.wav',
  rain: '/sounds/rain.wav',
};

const SOUND_OF_EVENT: Record<EventMessage['kind'], SoundName | null> = {
  impact: 'impact',
  checkpoint: 'checkpoint',
  vehicleLost: 'vehicleLost',
  pickup: 'pickup',
  buy: 'purchase',
  use: 'use',
  hookAttach: 'hookAttach',
  hookDetach: 'hookAttach',
  coin: 'coin',
  hurt: 'hurt',
  downed: 'downed',
  revive: 'revive',
  respawn: null,
  goatHit: 'impact',
  scooterHit: 'impact',
};

// Events whose sound plays quieter than full.
const VOLUME_OF_EVENT: Partial<Record<EventMessage['kind'], number>> = { goatHit: 0.5, scooterHit: 0.5 };

const ALWAYS_FLAT: ReadonlySet<SoundName> = new Set(['coin', 'purchase', 'click', 'win']);

// The sound for a server event, and whether it plays at a place; the local player's own events and events without a position are heard flat.
export function soundFor(event: Pick<EventMessage, 'kind' | 'playerId' | 'pos'>, localId: string): { kind: SoundName; positional: boolean; volume?: number } | null {
  const kind = SOUND_OF_EVENT[event.kind];
  if (kind === null) return null;
  const positional = !ALWAYS_FLAT.has(kind) && event.playerId !== localId && event.pos !== undefined;
  const volume = VOLUME_OF_EVENT[event.kind];
  return volume === undefined ? { kind, positional } : { kind, positional, volume };
}

export interface MuteKeyEvent {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

// M toggles mute, except while typing in a field or with a shortcut modifier held.
export const isMuteKey = (event: MuteKeyEvent, targetTag: string | null): boolean =>
  event.code === 'KeyM' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');
