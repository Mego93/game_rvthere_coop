export interface TouchButton {
  down(): void;
  up(): void;
  reset(): void;
  sample(): boolean;
}

export function createButton(): TouchButton {
  let held = false;
  // Pressed since the last sample, so a tap shorter than a tick still counts.
  let tapped = false;
  return {
    down() {
      held = true;
      tapped = true;
    },
    up() {
      held = false;
    },
    reset() {
      held = false;
      tapped = false;
    },
    sample() {
      const pressed = held || tapped;
      tapped = false;
      return pressed;
    },
  };
}
