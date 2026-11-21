import { AMMO_BOX_ROUNDS, KOKE_SECONDS, SHIELD_HP, SHIELD_SECONDS, TAJINE_HEAL, TREEDENT_SECONDS, type EventMessage } from '@lodgy/shared';

export const EVENT_TOAST_SECONDS = 1.5;
export const SOULEYMAN_GREETING = 'Souleyman: Saved. Bonne route!';

const TEXT: Partial<Record<EventMessage['kind'], string>> = { checkpoint: SOULEYMAN_GREETING, goatHit: 'Goat!', scooterHit: 'Scooter!', outOfBounds: 'Back to the road', eat: 'Power-up!' };

const EAT_TEXT: Record<string, string> = {
  tajine: `Tajine! +${TAJINE_HEAL} health`,
  treedent: `Treedent! Faster for ${TREEDENT_SECONDS} s`,
  fromageBlanc: `Fromage blanc! Shield of ${SHIELD_HP} for ${SHIELD_SECONDS} s`,
  kokeZero: `Koke Zero! Double damage for ${KOKE_SECONDS} s`,
  ammo: `Ammo! +${AMMO_BOX_ROUNDS} rounds`,
};

// The toast text for a server event, or null when the kind has none.
// An eat event names the item that was eaten or drunk.
export const eventToastText = (kind: EventMessage['kind'], item?: string): string | null =>
  kind === 'eat' && item !== undefined && Object.hasOwn(EAT_TEXT, item) ? EAT_TEXT[item]! : (TEXT[kind] ?? null);

// The eat and out-of-bounds toasts are for the player they happened to; every other toast is for everyone.
export const toastFor = (message: Pick<EventMessage, 'kind' | 'playerId'>, localId: string): boolean => (message.kind !== 'eat' && message.kind !== 'outOfBounds') || message.playerId === localId;

// The newest event toast stays for EVENT_TOAST_SECONDS; a later one replaces it.
export const STORY_TOAST_SECONDS = 3;

export function createEventToast() {
  let text: string | null = null;
  let since = 0;
  let seconds = EVENT_TOAST_SECONDS;
  return {
    // A story toast from the server: its own text, a little longer than an event's.
    showText(next: string, now: number): void {
      text = next;
      since = now;
      seconds = STORY_TOAST_SECONDS;
    },
    show(kind: EventMessage['kind'], now: number, item?: string): void {
      const next = eventToastText(kind, item);
      if (next === null) return;
      text = next;
      since = now;
      seconds = EVENT_TOAST_SECONDS;
    },
    current: (now: number): string | null => (text !== null && now - since < seconds ? text : null),
  };
}
