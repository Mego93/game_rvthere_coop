import type { ItemKind } from '@lodgy/shared';
import { JOYSTICK_RADIUS } from '../input/touchConfig';
import type { TouchButtonName, TouchControls } from '../input/touch';
import type { TouchView } from './touchView';

export interface TouchUi {
  update(view: TouchView): void;
  setJoystick(state: { origin: { x: number; y: number }; point: { x: number; y: number } } | null): void;
  setVisible(visible: boolean): void;
}

const STYLE = `
#touch-ui { position: fixed; inset: 0; z-index: 10; pointer-events: none; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; font: 600 14px/1 system-ui, sans-serif; }
#touch-ui[hidden], #touch-ui [hidden] { display: none; }
#touch-ui button { pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; color: #fff; background: rgba(0, 0, 0, 0.45); border: 2px solid rgba(255, 255, 255, 0.7); border-radius: 50%; font: inherit; padding: 0; }
#touch-ui button.down { background: rgba(255, 255, 255, 0.45); }
#touch-actions { position: absolute; right: calc(12px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(2, 64px); gap: 10px; }
#touch-actions button { width: 64px; height: 64px; }
#touch-slots { position: absolute; left: 50%; bottom: calc(12px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 8px; }
#touch-slots button { width: 56px; height: 56px; border-radius: 10px; font-size: 11px; }
#touch-slots button.selected { border-color: #ffd34e; box-shadow: 0 0 0 2px #ffd34e; }
#touch-joystick { position: absolute; border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 50%; background: rgba(255, 255, 255, 0.12); pointer-events: none; }
#touch-joystick-knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(255, 255, 255, 0.6); }
`;

const ITEM_LABELS: Record<ItemKind, string> = { jerrycan: 'Fuel', toolbox: 'Tools', healthKit: 'Heal' };
const slotLabel = (kind: ItemKind | null) => (kind === null ? '' : (ITEM_LABELS[kind] ?? kind));

export function createTouchUi(root: HTMLElement): TouchUi & TouchControls & { dispose(): void } {
  let buttonHandler: (name: TouchButtonName, down: boolean) => void = () => {};
  let slotHandler: (slot: 0 | 1 | 2, down: boolean) => void = () => {};
  let cancelHandler: () => void = () => {};
  const releases = new Set<() => void>();

  root.id = 'touch-ui';
  root.hidden = true;
  const style = document.createElement('style');
  style.textContent = STYLE;

  // Follows the touch that started on it, so other touches landing on the same element are ignored.
  const press = (element: HTMLElement, onChange: (down: boolean) => void) => {
    let owner: number | null = null;
    const release = () => {
      if (owner === null) return;
      owner = null;
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
        if (owner !== null || !first) return;
        owner = first.identifier;
        element.classList.add('down');
        onChange(true);
      },
      { passive: false },
    );
    const finish = (event: Event) => {
      swallow(event);
      if (owner !== null && Array.from((event as TouchEvent).changedTouches).some((touch) => touch.identifier === owner)) release();
    };
    element.addEventListener('touchend', finish, { passive: false });
    element.addEventListener(
      'touchcancel',
      (event) => {
        swallow(event);
        // A system gesture took the touches; nothing may stay held.
        for (const other of releases) other();
        cancelHandler();
      },
      { passive: false },
    );
  };

  const make = (id: string, label: string, onChange: (down: boolean) => void) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    element.textContent = label;
    press(element, onChange);
    return element;
  };

  const actions = document.createElement('div');
  actions.id = 'touch-actions';
  const interact = make('touch-interact', 'Act', (down) => buttonHandler('interact', down));
  const use = make('touch-use', 'Use', (down) => buttonHandler('use', down));
  const jump = make('touch-jump', 'Jump', (down) => buttonHandler('jump', down));
  const reelIn = make('touch-reel-in', 'Reel in', (down) => buttonHandler('reelIn', down));
  const reelOut = make('touch-reel-out', 'Reel out', (down) => buttonHandler('reelOut', down));
  use.hidden = true;
  reelIn.hidden = true;
  reelOut.hidden = true;
  actions.append(reelIn, reelOut, use, interact, jump);

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

  root.append(style, ring, actions, slotBox);

  let shown: { seated: boolean; useVisible: boolean; reelVisible: boolean; slots: string; selected: number } | null = null;

  return {
    onButton: (handler) => (buttonHandler = handler),
    onSlot: (handler) => (slotHandler = handler),
    onCancel: (handler) => (cancelHandler = handler),
    update(view) {
      const next = { seated: view.seated, useVisible: view.useVisible, reelVisible: view.reelVisible, slots: view.slots.join(','), selected: view.selected };
      if (shown && shown.seated === next.seated && shown.useVisible === next.useVisible && shown.reelVisible === next.reelVisible && shown.slots === next.slots && shown.selected === next.selected) return;
      if (!shown || shown.seated !== next.seated) jump.textContent = next.seated ? 'Brake' : 'Jump';
      if (!shown || shown.useVisible !== next.useVisible) use.hidden = !next.useVisible;
      if (!shown || shown.reelVisible !== next.reelVisible) {
        reelIn.hidden = !next.reelVisible;
        reelOut.hidden = !next.reelVisible;
      }
      if (!shown || shown.slots !== next.slots) view.slots.forEach((kind, index) => (slotButtons[index]!.textContent = slotLabel(kind)));
      if (!shown || shown.selected !== next.selected || shown.slots !== next.slots) {
        slotButtons.forEach((element, index) => {
          const selected = index === view.selected;
          element.classList.toggle('selected', selected);
          element.setAttribute('aria-pressed', String(selected));
        });
      }
      shown = next;
    },
    setJoystick(state) {
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
        for (const release of releases) release();
        ring.hidden = true;
      }
    },
    dispose() {
      for (const release of releases) release();
      root.replaceChildren();
    },
  };
}
