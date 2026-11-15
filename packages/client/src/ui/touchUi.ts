import type { ItemKind } from '@lodgy/shared';
import { JOYSTICK_RADIUS } from '../input/touchConfig';
import type { TouchButtonName, TouchControls } from '../input/touch';
import { createOwnedPress } from './ownedPress';
import type { TouchView } from './touchView';
import { changedFields } from './touchViewDiff';

export interface TouchUi {
  update(view: TouchView): void;
  setJoystick(state: { origin: { x: number; y: number }; point: { x: number; y: number } } | null): void;
  setVisible(visible: boolean): void;
  // The corner button that opens the run menu.
  onMenu(handler: () => void): void;
}

const STYLE = `
#touch-ui { position: fixed; inset: 0; z-index: 10; pointer-events: none; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; font: 600 14px/1 system-ui, sans-serif; }
#touch-ui[hidden], #touch-ui [hidden] { display: none; }
#touch-ui button { pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; color: #fff; background: rgba(0, 0, 0, 0.45); border: 2px solid rgba(255, 255, 255, 0.7); border-radius: 50%; font: inherit; padding: 0; }
#touch-ui button.down { background: rgba(255, 255, 255, 0.45); }
#touch-ui button.on { border-color: #ffd34e; box-shadow: 0 0 0 2px #ffd34e; }
#touch-actions { position: absolute; right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(2, 64px); gap: 10px; }
#touch-actions button { width: 64px; height: 64px; }
#touch-menu { position: absolute; top: calc(12px + env(safe-area-inset-top)); right: calc(12px + env(safe-area-inset-right)); width: 56px; height: 36px; border-radius: 10px; font-size: 12px; }
#touch-slots { position: absolute; left: 50%; bottom: calc(12px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 8px; }
#touch-slots button { width: 56px; height: 56px; border-radius: 10px; font-size: 11px; }
#touch-slots button.selected { border-color: #ffd34e; box-shadow: 0 0 0 2px #ffd34e; }
#touch-joystick { position: absolute; border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 50%; background: rgba(255, 255, 255, 0.12); pointer-events: none; }
#touch-joystick-knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(255, 255, 255, 0.6); }
#rotate-prompt { position: absolute; inset: 0; display: none; place-items: center; padding: 24px; text-align: center; font-size: 20px; color: #fff; background: #1d3b52; pointer-events: auto; touch-action: none; }
@media (orientation: portrait) { #rotate-prompt { display: grid; } }
`;

const ITEM_LABELS: Record<ItemKind, string> = { jerrycan: 'Fuel', toolbox: 'Tools', healthKit: 'Heal' };
const slotLabel = (kind: ItemKind | null) => (kind === null ? '' : (ITEM_LABELS[kind] ?? kind));

export function createTouchUi(root: HTMLElement): TouchUi & TouchControls & { dispose(): void } {
  let buttonHandler: (name: TouchButtonName, down: boolean) => void = () => {};
  let slotHandler: (slot: 0 | 1 | 2, down: boolean) => void = () => {};
  let cancelHandler: () => void = () => {};
  let menuHandler: () => void = () => {};
  const releases = new Set<() => void>();
  const releaseOf = new WeakMap<HTMLElement, () => void>();

  root.id = 'touch-ui';
  root.hidden = true;
  const style = document.createElement('style');
  style.textContent = STYLE;

  const press = (element: HTMLElement, onChange: (down: boolean) => void) => {
    const owned = createOwnedPress();
    const release = () => {
      if (!owned.cancel()) return;
      element.classList.remove('down');
      onChange(false);
    };
    releases.add(release);
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener(
      'touchstart',
      (event) => {
        swallow(event);
        const first = (event as TouchEvent).changedTouches[0];
        if (!first || !owned.start(first.identifier)) return;
        element.classList.add('down');
        onChange(true);
      },
      { passive: false },
    );
    element.addEventListener(
      'touchend',
      (event) => {
        swallow(event);
        const ids = Array.from((event as TouchEvent).changedTouches, (touch) => touch.identifier);
        if (owned.end(ids)) {
          element.classList.remove('down');
          onChange(false);
        }
      },
      { passive: false },
    );
    element.addEventListener(
      'touchcancel',
      (event) => {
        swallow(event);
        // A system gesture took the touches; nothing may stay held.
        releaseAll();
        cancelHandler();
      },
      { passive: false },
    );
    return release;
  };

  // The Sprint toggle: a latched level the source reads; every release (cancel, hidden page, boarding, downed) turns it off.
  let sprintOn = false;
  const setSprint = (on: boolean) => {
    if (sprintOn === on) return;
    sprintOn = on;
    sprint.classList.toggle('on', on);
    sprint.setAttribute('aria-pressed', String(on));
    buttonHandler('sprint', on);
  };
  const releaseAll = () => {
    for (const release of releases) release();
    setSprint(false);
  };
  const make = (id: string, label: string, onChange: (down: boolean) => void) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    element.textContent = label;
    releaseOf.set(element, press(element, onChange));
    return element;
  };

  const actions = document.createElement('div');
  actions.id = 'touch-actions';
  const interact = make('touch-interact', 'Act', (down) => buttonHandler('interact', down));
  const use = make('touch-use', 'Use', (down) => buttonHandler('use', down));
  const jump = make('touch-jump', 'Jump', (down) => buttonHandler('jump', down));
  const reelIn = make('touch-reel-in', 'Reel in', (down) => buttonHandler('reelIn', down));
  const reelOut = make('touch-reel-out', 'Reel out', (down) => buttonHandler('reelOut', down));
  const reset = make('touch-reset', 'Reset', (down) => buttonHandler('reset', down));
  const sprint = make('touch-sprint', 'Sprint', (down) => down && setSprint(!sprintOn));
  sprint.setAttribute('aria-pressed', 'false');
  use.hidden = true;
  reset.hidden = true;
  reelIn.hidden = true;
  reelOut.hidden = true;
  actions.append(sprint, reset, reelIn, reelOut, use, interact, jump);

  const menu = make('touch-menu', 'Menu', (down) => down && menuHandler());

  const slotBox = document.createElement('div');
  slotBox.id = 'touch-slots';
  const slotButtons = ([0, 1, 2] as const).map((index) => {
    const element = make(`touch-slot-${index}`, '', (down) => slotHandler(index, down));
    element.setAttribute('aria-pressed', 'false');
    return element;
  });
  slotBox.append(...slotButtons);

  const ring = document.createElement('div');
  ring.id = 'touch-joystick';
  ring.hidden = true;
  const knob = document.createElement('div');
  knob.id = 'touch-joystick-knob';
  ring.append(knob);
  ring.style.width = ring.style.height = `${JOYSTICK_RADIUS * 2}px`;

  const rotate = document.createElement('div');
  rotate.id = 'rotate-prompt';
  rotate.textContent = 'Rotate your phone to landscape';

  root.append(style, ring, actions, slotBox, menu, rotate);

  let shown: TouchView | null = null;
  let joystickKey = '';
  // A button that disappears while held must not stay down.
  const hide = (element: HTMLElement, hidden: boolean) => {
    element.hidden = hidden;
    if (hidden) releaseOf.get(element)?.();
  };

  return {
    onButton: (handler) => (buttonHandler = handler),
    onSlot: (handler) => (slotHandler = handler),
    onCancel: (handler) => (cancelHandler = handler),
    releaseAll,
    onMenu: (handler) => (menuHandler = handler),
    update(view) {
      const changed = changedFields(shown, view);
      if (changed.size === 0) return;
      if (changed.has('seated')) jump.textContent = view.seated ? 'Brake' : 'Jump';
      if (changed.has('useVisible')) hide(use, !view.useVisible);
      if (changed.has('reelVisible')) {
        hide(reelIn, !view.reelVisible);
        hide(reelOut, !view.reelVisible);
      }
      if (changed.has('resetVisible')) hide(reset, !view.resetVisible);
      if (changed.has('sprintVisible')) {
        hide(sprint, !view.sprintVisible);
        if (!view.sprintVisible) setSprint(false);
      }
      if (changed.has('slots')) view.slots.forEach((kind, index) => (slotButtons[index]!.textContent = slotLabel(kind)));
      if (changed.has('slots') || changed.has('selected')) {
        slotButtons.forEach((element, index) => {
          const selected = index === view.selected;
          element.classList.toggle('selected', selected);
          element.setAttribute('aria-pressed', String(selected));
        });
      }
      shown = { ...view, slots: [...view.slots] };
    },
    setJoystick(state) {
      const key = state ? `${state.origin.x},${state.origin.y},${state.point.x},${state.point.y}` : '';
      if (key === joystickKey) return;
      joystickKey = key;
      ring.hidden = state === null;
      if (!state) return;
      ring.style.left = `${state.origin.x - JOYSTICK_RADIUS}px`;
      ring.style.top = `${state.origin.y - JOYSTICK_RADIUS}px`;
      const dx = state.point.x - state.origin.x;
      const dy = state.point.y - state.origin.y;
      const distance = Math.hypot(dx, dy);
      const reach = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
      knob.style.transform = `translate(${dx * reach}px, ${dy * reach}px)`;
    },
    setVisible(visible) {
      root.hidden = !visible;
      if (!visible) {
        releaseAll();
        ring.hidden = true;
        joystickKey = '';
      }
    },
    dispose() {
      releaseAll();
      root.replaceChildren();
    },
  };
}
