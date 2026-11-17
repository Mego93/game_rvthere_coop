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

const same = (a: Appearance, b: Appearance) => a.characterId === b.characterId && a.glasses === b.glasses && a.top === b.top && a.hat === b.hat;

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
