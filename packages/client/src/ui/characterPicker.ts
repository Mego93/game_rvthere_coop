import { CHARACTER_IDS, CHARACTER_NAMES, type Appearance, type CharacterId, type LobbyMessage } from '@lodgy/shared';

export interface PickerCard {
  characterId: CharacterId;
  name: string;
  state: 'own' | 'free' | 'taken';
  holderName: string | null;
  // The holder is disconnected but still holds the character.
  away: boolean;
}

export interface PickerView {
  cards: PickerCard[];
  // The own appearance with the unconfirmed choice applied.
  appearance: Appearance;
  pending: Appearance | null;
}

const same = (a: Appearance, b: Appearance) => a.characterId === b.characterId && a.glasses === b.glasses && a.top === b.top && a.hat === b.hat && a.skin === b.skin && a.eyes === b.eyes && a.smile === b.smile;

// A local choice stays until the server's entry equals it.
export function mergeAppearance(server: Appearance, pending: Appearance | null): { appearance: Appearance; pending: Appearance | null } {
  if (!pending || same(server, pending)) return { appearance: server, pending: null };
  return { appearance: pending, pending };
}

export function pickerView(message: LobbyMessage, localId: string, pending: Appearance | null): PickerView | null {
  const own = message.players.find((entry) => entry.playerId === localId);
  if (!own) return null;
  const merged = mergeAppearance(own.appearance, pending);
  const cards = CHARACTER_IDS.map((characterId): PickerCard => {
    const holder = message.players.find((entry) => entry.playerId !== localId && entry.appearance.characterId === characterId);
    const state = merged.appearance.characterId === characterId ? 'own' : holder ? 'taken' : 'free';
    return { characterId, name: CHARACTER_NAMES[characterId], state, holderName: holder?.name ?? null, away: holder ? !holder.connected : false };
  });
  return { cards, appearance: merged.appearance, pending: merged.pending };
}

// Refusals of a character or look; every other error leaves the picker alone.
export const PICKER_ERRORS: readonly string[] = ['character_taken', 'bad_phase'];

// The picker's unconfirmed choice and its note, apart from the DOM.
export interface PickerState {
  // The view to show for this lobby message; applies the echo (clearing pending and the note when it matches).
  view(message: LobbyMessage, localId: string): PickerView | null;
  // The look to send for a tap, or null when nothing should be sent (own or taken card, no change, no picker).
  choose(message: LobbyMessage, localId: string, change: Partial<Appearance>): Appearance | null;
  // True when the error belongs to the picker (pending dropped, note set); false leaves everything as it was.
  error(reason: string | undefined, text: string): boolean;
  readonly note: string;
  reset(): void;
}

export function createPickerState(): PickerState {
  let pending: Appearance | null = null;
  let note = '';
  return {
    view(message, localId) {
      const shown = pickerView(message, localId, pending);
      if (pending && !shown?.pending) note = '';
      pending = shown?.pending ?? null;
      return shown;
    },
    choose(message, localId, change) {
      const shown = pickerView(message, localId, pending);
      if (!shown) return null;
      if (change.characterId !== undefined && shown.cards.find((card) => card.characterId === change.characterId)?.state !== 'free') return null;
      const next = { ...shown.appearance, ...change };
      if (same(next, shown.appearance)) return null;
      pending = next;
      note = '';
      return next;
    },
    error(reason, text) {
      if (reason === undefined || !PICKER_ERRORS.includes(reason)) return false;
      pending = null;
      note = text;
      return true;
    },
    get note() {
      return note;
    },
    reset() {
      pending = null;
      note = '';
    },
  };
}
