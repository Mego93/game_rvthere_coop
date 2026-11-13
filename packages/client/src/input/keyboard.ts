import { NEUTRAL_INPUT } from '@lodgy/shared';
import type { InputSource } from './source';

const SLOT_KEYS: Record<string, 0 | 1 | 2> = { Digit1: 0, Digit2: 1, Digit3: 2 };

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyG', 'Digit1', 'Digit2', 'Digit3',
]);
const BUTTON_KEYS = ['Space', 'KeyE', 'KeyF', 'KeyG'];

export function createKeyboardSource(target: EventTarget): InputSource {
  const down = new Set<string>();
  // Buttons pressed since the last sample, so a tap shorter than a tick still counts.
  const tapped = new Set<string>();
  let slot: 0 | 1 | 2 = 0;

  const leaveBrowserAlone = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey;
  const claim = (event: KeyboardEvent) => {
    if (GAME_KEYS.has(event.code) && !leaveBrowserAlone(event)) event.preventDefault();
  };

  const onKeyDown = (event: Event) => {
    const code = (event as KeyboardEvent).code;
    // macOS sends no keyup for a key released while Cmd is held, so such a key would stick.
    if (leaveBrowserAlone(event as KeyboardEvent)) return;
    claim(event as KeyboardEvent);
    if (BUTTON_KEYS.includes(code) && !down.has(code)) tapped.add(code);
    down.add(code);
    const selected = SLOT_KEYS[code];
    if (selected !== undefined) slot = selected;
  };
  const onKeyUp = (event: Event) => {
    claim(event as KeyboardEvent);
    const code = (event as KeyboardEvent).code;
    if (code === 'MetaLeft' || code === 'MetaRight') down.clear();
    down.delete(code);
  };
  // Keys released while the window is unfocused never send keyup.
  const onBlur = () => {
    down.clear();
    tapped.clear();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  const axis = (negative: string, positive: string) =>
    ((down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0)) as -1 | 0 | 1;

  const button = (code: string) => down.has(code) || tapped.has(code);

  return {
    sample() {
      const input = {
        ...NEUTRAL_INPUT,
        moveX: axis('KeyA', 'KeyD'),
        moveY: axis('KeyS', 'KeyW'),
        jump: button('Space'),
        interact: button('KeyE'),
        use: button('KeyF'),
        reel: axis('KeyR', 'KeyQ'),
        slot,
        drop: button('KeyG'),
      };
      tapped.clear();
      return input;
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
