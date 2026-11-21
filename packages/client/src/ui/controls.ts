import { FINAL_RESTART_PENALTY } from '@lodgy/shared';
import { KEY_BINDINGS } from '../input/keyboard';

export interface ControlEntry {
  group: string;
  keys: string[];
  action: string;
}

// Codes handled outside the keyboard source: F3, T, B, V, P, Z and Escape in game.ts, M in audio/soundMap.ts, H in main.ts.
export const EXTRA_CODES = ['F3', 'Escape', 'KeyM', 'KeyH', 'KeyT', 'KeyB', 'KeyV', 'KeyP', 'KeyZ'];

export const CONTROLS: readonly ControlEntry[] = [
  { group: 'On foot', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], action: 'Walk' },
  { group: 'On foot', keys: ['Space'], action: 'Jump' },
  { group: 'On foot', keys: ['ShiftLeft', 'ShiftRight'], action: 'Sprint (hold, moving forward; not while carrying)' },
  { group: 'On foot', keys: ['KeyC'], action: 'Crouch (hold)' },
  { group: 'On foot', keys: ['ShiftLeft', 'KeyC'], action: 'Slide: sprint, then press C' },
  { group: 'On foot', keys: ['KeyE'], action: 'Board, leave, hook or unhook, pick up, push' },
  { group: 'Driving', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], action: 'Throttle, brake and steer' },
  { group: 'Driving', keys: ['Space'], action: 'Brake' },
  { group: 'Winch', keys: ['KeyQ'], action: 'Reel in' },
  { group: 'Winch', keys: ['KeyR'], action: 'Reel out' },
  { group: 'Items', keys: ['Digit1', 'Digit2', 'Digit3'], action: 'Select a slot' },
  { group: 'Items', keys: ['KeyF'], action: 'Use the selected item' },
  { group: 'Items', keys: ['KeyG'], action: 'Drop the selected item' },
  { group: 'Vehicle', keys: ['KeyX'], action: `Hold to reset a stuck or upturned vehicle (${FINAL_RESTART_PENALTY} s penalty)` },
  { group: 'Game', keys: ['KeyH'], action: 'Show or hide this help' },
  { group: 'Game', keys: ['F3'], action: 'Show or hide the debug overlay' },
  { group: 'Game', keys: ['KeyT'], action: 'Open chat' },
  { group: 'Game', keys: ['KeyB'], action: 'Emote wheel' },
  { group: 'Game', keys: ['Escape'], action: 'Menu, or close this help, chat or emote wheel' },
  { group: 'Game', keys: ['KeyV'], action: 'Switch between first and third person view' },
  { group: 'Game', keys: ['KeyM'], action: 'Mute or unmute sound' },
  { group: 'Story', keys: ['KeyP'], action: 'Phone: ATM, shop and Fake Republic' },
  { group: 'Story', keys: ['KeyZ'], action: 'Complain (Luiz)' },
];

export const keyLabel = (code: string): string => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Shift(Left|Right)$/, 'Shift');

// The caps shown for a row: left and right Shift are one cap.
export const keyLabels = (codes: readonly string[]): string[] => [...new Set(codes.map(keyLabel))];

export const missingFromControls = (): string[] => {
  const listed = new Set(CONTROLS.flatMap((entry) => entry.keys));
  return [...KEY_BINDINGS.map((binding) => binding.code), ...EXTRA_CODES].filter((code) => !listed.has(code));
};

const STYLE = `
#controls { position: fixed; inset: 0; z-index: 45; display: grid; background: var(--scrim); }
#controls[hidden] { display: none; }
#controls-panel { display: grid; grid-template-rows: auto 1fr auto; gap: 12px; width: min(560px, 92vw); max-height: 86vh; margin: auto; padding: 18px 20px; font: 15px/1.4 var(--font-text); }
#controls-panel h2 { margin: 0; font-size: 24px; color: var(--teal); }
#controls-list { margin: 0; overflow: auto; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-content: start; }
#controls-list dt { font-weight: 600; white-space: nowrap; }
#controls-list dd { margin: 0; }
#controls-list kbd { padding: 1px 7px; color: var(--ink); background: var(--paper); border: 1px solid var(--ink-soft); border-bottom-width: 3px; border-radius: 6px; font-size: 12px; }
#controls-footer { display: grid; gap: 8px; }
#controls-credits { justify-self: center; font-weight: 600; color: var(--info); }
`;

export interface ControlsPanel {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

export function createControlsPanel(doc: Document, onChange: (open: boolean) => void = () => {}, onCredits: () => void = () => {}): ControlsPanel {
  const root = doc.createElement('div');
  root.id = 'controls';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Controls');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const panel = doc.createElement('div');
  panel.id = 'controls-panel';
  panel.className = 'ui-panel';
  const title = doc.createElement('h2');
  title.textContent = 'Controls';
  const list = doc.createElement('dl');
  list.id = 'controls-list';
  for (const entry of CONTROLS) {
    const keys = doc.createElement('dt');
    keyLabels(entry.keys).forEach((label, index) => {
      if (index > 0) keys.append(' ');
      const key = doc.createElement('kbd');
      key.textContent = label;
      keys.append(key);
    });
    const action = doc.createElement('dd');
    action.textContent = `${entry.group}: ${entry.action}`;
    list.append(keys, action);
  }
  const footer = doc.createElement('div');
  footer.id = 'controls-footer';
  const credits = doc.createElement('a');
  credits.id = 'controls-credits';
  credits.href = '/CREDITS.md';
  credits.target = '_blank';
  credits.rel = 'noopener';
  credits.textContent = 'Credits';
  credits.addEventListener('click', (event) => {
    event.preventDefault();
    set(false);
    onCredits();
  });
  const close = doc.createElement('button');
  close.id = 'controls-close';
  close.className = 'ui-btn ui-btn-primary';
  close.type = 'button';
  close.textContent = 'Close';
  footer.append(credits, close);
  panel.append(title, list, footer);
  root.append(style, panel);
  doc.body.append(root);

  const set = (open: boolean) => {
    if (root.hidden === !open) return;
    root.hidden = !open;
    if (open) close.focus();
    onChange(open);
  };
  close.addEventListener('click', () => set(false));
  root.addEventListener('click', (event) => {
    if (event.target === root) set(false);
  });
  // Capture on window, so the game's own Escape handler does not also open the run menu.
  doc.defaultView?.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || root.hidden) return;
      event.stopImmediatePropagation();
      set(false);
    },
    { capture: true },
  );

  return {
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(root.hidden === true),
    isOpen: () => !root.hidden,
  };
}

// H toggles the panel, except while typing in a field or with a shortcut modifier held.
export const isHelpKey = (event: { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, targetTag: string | null): boolean =>
  event.code === 'KeyH' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');

// V switches between first and third person, except while typing in a field or with a shortcut modifier held.
export const isViewKey = (event: { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, targetTag: string | null): boolean =>
  event.code === 'KeyV' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');
