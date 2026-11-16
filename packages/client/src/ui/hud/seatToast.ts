export const SEAT_TOAST_SECONDS = 2.5;
export const SEAT_RING_SECONDS = 2;

export const seatToastText = (label: string): string => (label === 'Driver' ? 'You are the Driver' : `You are in the ${label.toLowerCase()} seat`);

export interface SeatAnnouncement { toast: string | null; ringAge: number | null }

// One result object is reused, so a frame allocates nothing.
export function createSeatAnnouncer() {
  let seat: string | null = null;
  let since = 0;
  let text = '';
  const result: SeatAnnouncement = { toast: null, ringAge: null };
  return {
    update(own: { id: string; label: string } | null, now: number): SeatAnnouncement {
      const id = own?.id ?? null;
      if (id !== seat) {
        seat = id;
        since = now;
        text = own ? seatToastText(own.label) : '';
      }
      const age = now - since;
      result.toast = id !== null && age < SEAT_TOAST_SECONDS ? text : null;
      result.ringAge = id !== null && age < SEAT_RING_SECONDS ? age : null;
      return result;
    },
  };
}
