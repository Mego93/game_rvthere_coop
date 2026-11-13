import { NEUTRAL_INPUT } from '@lodgy/shared';
import { joystickVector } from './joystick';
import { createLook } from './look';
import type { GameInput } from './source';
import { JOYSTICK_DEAD_ZONE, JOYSTICK_RADIUS, LONG_PRESS, TOUCH_LOOK_SENSITIVITY } from './touchConfig';
import { createButton } from './touchButtons';
import { createTouchTracker } from './touchTracker';

export type TouchButtonName = 'interact' | 'use' | 'jump' | 'reelIn' | 'reelOut';

// What the touch UI offers the source: button and slot presses, and a way to cancel them all.
export interface TouchControls {
  onButton(handler: (name: TouchButtonName, down: boolean) => void): void;
  onSlot(handler: (slot: 0 | 1 | 2, down: boolean) => void): void;
  onCancel(handler: () => void): void;
  // Releases every held button; the source calls it when it cancels.
  releaseAll(): void;
}

export interface TouchSourceOptions {
  surface: EventTarget;
  win: EventTarget;
  doc: EventTarget & { visibilityState: string };
  width(): number;
  controls: TouchControls;
}

export type TouchSource = GameInput & {
  joystick(): { origin: { x: number; y: number }; point: { x: number; y: number } } | null;
};

export const hasJoystick = (input: GameInput): input is TouchSource => typeof (input as Partial<TouchSource>).joystick === 'function';

interface TouchLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

const BUTTON_NAMES: TouchButtonName[] = ['interact', 'use', 'jump', 'reelIn', 'reelOut'];

export function createTouchSource({ surface, win, doc, width, controls }: TouchSourceOptions): TouchSource {
  const tracker = createTouchTracker(width);
  const look = createLook();
  const buttons = Object.fromEntries(BUTTON_NAMES.map((name) => [name, createButton()])) as Record<
    TouchButtonName,
    ReturnType<typeof createButton>
  >;
  let slot: 0 | 1 | 2 = 0;
  let dropLatched = false;
  let longPress: ReturnType<typeof setTimeout> | null = null;
  // The slot whose press owns the timer.
  let pressedSlot: 0 | 1 | 2 | null = null;
  let disposed = false;

  const clearLongPress = () => {
    if (longPress !== null) clearTimeout(longPress);
    longPress = null;
    pressedSlot = null;
  };
  const cancelAll = () => {
    tracker.cancelAll();
    for (const button of Object.values(buttons)) button.reset();
    dropLatched = false;
    clearLongPress();
    controls.releaseAll();
  };
  const drain = () => {
    const { dx, dy } = tracker.takeLook();
    look.apply(dx, dy, TOUCH_LOOK_SENSITIVITY);
  };

  const touches = (event: Event) => Array.from((event as unknown as { changedTouches: ArrayLike<TouchLike> }).changedTouches);
  const onStart = (event: Event) => {
    event.preventDefault();
    for (const t of touches(event)) tracker.start(t.identifier, t.clientX, t.clientY);
  };
  const onMove = (event: Event) => {
    event.preventDefault();
    for (const t of touches(event)) tracker.move(t.identifier, t.clientX, t.clientY);
  };
  const onEnd = (event: Event) => {
    event.preventDefault();
    for (const t of touches(event)) tracker.end(t.identifier);
  };
  const onCancelEvent = () => cancelAll();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') cancelAll();
  };

  const options = { passive: false } as const;
  surface.addEventListener('touchstart', onStart, options);
  surface.addEventListener('touchmove', onMove, options);
  surface.addEventListener('touchend', onEnd, options);
  surface.addEventListener('touchcancel', onCancelEvent);
  win.addEventListener('blur', onCancelEvent);
  doc.addEventListener('visibilitychange', onVisibility);

  controls.onButton((name, down) => {
    if (disposed) return;
    if (down) buttons[name].down();
    else buttons[name].up();
  });
  controls.onSlot((pressed, down) => {
    if (disposed) return;
    if (!down) {
      if (pressedSlot === pressed) clearLongPress();
      return;
    }
    clearLongPress();
    slot = pressed;
    pressedSlot = pressed;
    longPress = setTimeout(() => {
      longPress = null;
      pressedSlot = null;
      dropLatched = true;
    }, LONG_PRESS * 1000);
  });
  controls.onCancel(() => {
    if (!disposed) cancelAll();
  });

  return {
    sample() {
      drain();
      const stick = tracker.joystick();
      const { moveX, moveY } = stick
        ? joystickVector(stick.origin, stick.point, JOYSTICK_RADIUS, JOYSTICK_DEAD_ZONE)
        : { moveX: 0, moveY: 0 };
      const drop = dropLatched;
      dropLatched = false;
      return {
        ...NEUTRAL_INPUT,
        moveX,
        moveY,
        yaw: look.yaw(),
        pitch: look.pitch(),
        jump: buttons.jump.sample(),
        interact: buttons.interact.sample(),
        use: buttons.use.sample(),
        reel: ((buttons.reelIn.sample() ? 1 : 0) - (buttons.reelOut.sample() ? 1 : 0)) as -1 | 0 | 1,
        slot,
        drop,
      };
    },
    aim() {
      drain();
      return { yaw: look.yaw(), pitch: look.pitch() };
    },
    joystick: () => tracker.joystick(),
    dispose() {
      cancelAll();
      disposed = true;
      surface.removeEventListener('touchstart', onStart);
      surface.removeEventListener('touchmove', onMove);
      surface.removeEventListener('touchend', onEnd);
      surface.removeEventListener('touchcancel', onCancelEvent);
      win.removeEventListener('blur', onCancelEvent);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
