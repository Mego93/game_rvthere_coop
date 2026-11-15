import type { Timer } from '@lodgy/server/room';

export interface PausableTimer extends Timer {
  // Clears every interval but remembers the periods.
  pause(): void;
  resume(): void;
}

interface Entry {
  seconds: number;
  run: () => void;
  id: ReturnType<typeof setInterval> | null;
}

export function createWorkerTimer(onError: (error: unknown, source: string) => void): PausableTimer {
  const entries = new Set<Entry>();
  let paused = false;
  // An exception thrown in a timer callback must not end the Object.
  const contain = (fn: () => void) => () => {
    try {
      fn();
    } catch (error) {
      onError(error, 'timer');
    }
  };
  const start = (entry: Entry) => {
    entry.id = setInterval(contain(entry.run), entry.seconds * 1000);
  };
  return {
    every(seconds, fn) {
      const entry: Entry = { seconds, run: fn, id: null };
      entries.add(entry);
      if (!paused) start(entry);
      return () => {
        if (entry.id !== null) clearInterval(entry.id);
        entries.delete(entry);
      };
    },
    pause() {
      paused = true;
      for (const entry of entries) {
        if (entry.id !== null) clearInterval(entry.id);
        entry.id = null;
      }
    },
    resume() {
      paused = false;
      for (const entry of entries) if (entry.id === null) start(entry);
    },
  };
}
