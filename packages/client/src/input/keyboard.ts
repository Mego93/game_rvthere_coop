import { NEUTRAL_INPUT } from '@lodgy/shared';
import type { InputSource } from './source';

const SLOT_KEYS: Record<string, 0 | 1 | 2> = { Digit1: 0, Digit2: 1, Digit3: 2 };

export function createKeyboardSource(target: EventTarget): InputSource {
  const down = new Set<string>();
  let slot: 0 | 1 | 2 = 0;

  const onKeyDown = (event: Event) => {
    const code = (event as KeyboardEvent).code;
    down.add(code);
    const selected = SLOT_KEYS[code];
    if (selected !== undefined) slot = selected;
  };
  const onKeyUp = (event: Event) => {
    down.delete((event as KeyboardEvent).code);
  };
  // Keys released while the window is unfocused never send keyup.
  const onBlur = () => down.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  const axis = (negative: string, positive: string) =>
    ((down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0)) as -1 | 0 | 1;

  return {
    sample: () => ({
      ...NEUTRAL_INPUT,
      moveX: axis('KeyA', 'KeyD'),
      moveY: axis('KeyS', 'KeyW'),
      jump: down.has('Space'),
      interact: down.has('KeyE'),
      use: down.has('KeyF'),
      reel: axis('KeyR', 'KeyQ'),
      slot,
      drop: down.has('KeyG'),
    }),
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
