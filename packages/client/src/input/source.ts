import type { InputFields } from '@lodgy/shared';

// A device-specific reader of the player's intent. Keyboard and touch both implement it.
export interface InputSource {
  sample(): InputFields;
  dispose(): void;
}
