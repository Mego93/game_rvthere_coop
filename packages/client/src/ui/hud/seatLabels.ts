export const SEAT_LABELS: Readonly<Record<string, string>> = {
  driver: 'Driver',
  seat1: 'Front passenger',
  seat2: 'Middle left',
  seat3: 'Middle right',
  seat4: 'Rear left',
  seat5: 'Rear right',
};

export const seatLabel = (id: string): string | null => SEAT_LABELS[id] ?? null;
