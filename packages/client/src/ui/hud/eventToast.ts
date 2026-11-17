import type { EventMessage } from '@lodgy/shared';

export const EVENT_TOAST_SECONDS = 1.5;
export const SOULEYMAN_GREETING = 'Souleyman: Saved. Bonne route!';

const TEXT: Partial<Record<EventMessage['kind'], string>> = { checkpoint: SOULEYMAN_GREETING, goatHit: 'Goat!', scooterHit: 'Scooter!' };

// The toast text for a server event, or null when the kind has none.
export const eventToastText = (kind: EventMessage['kind']): string | null => TEXT[kind] ?? null;

// The newest event toast stays for EVENT_TOAST_SECONDS; a later one replaces it.
export function createEventToast() {
  let text: string | null = null;
  let since = 0;
  return {
    show(kind: EventMessage['kind'], now: number): void {
      const next = eventToastText(kind);
      if (next === null) return;
      text = next;
      since = now;
    },
    current: (now: number): string | null => (text !== null && now - since < EVENT_TOAST_SECONDS ? text : null),
  };
}
