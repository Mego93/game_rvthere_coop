import type { InputFields } from '@lodgy/shared';

// A device-specific reader of the player's intent. Keyboard and touch both implement it.
export interface InputSource {
  sample(): InputFields;
  dispose(): void;
}

// An input source that also says where the player is looking, for the camera and the overlay.
export interface GameInput extends InputSource {
  aim(): { yaw: number; pitch: number };
}
