import { FINAL_RESTART_PENALTY } from '@lodgy/shared';
import { KEY_BINDINGS } from '../input/keyboard';

export interface ControlEntry {
  group: string;
  keys: string[];
  action: string;
}

// Codes handled outside the keyboard source: F3 and Escape in game.ts, M in audio/soundMap.ts, H in main.ts.
export const EXTRA_CODES = ['F3', 'Escape', 'KeyM', 'KeyH'];

export const CONTROLS: readonly ControlEntry[] = [
  { group: 'On foot', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], action: 'Walk' },
  { group: 'On foot', keys: ['Space'], action: 'Jump' },
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
  { group: 'Game', keys: ['Escape'], action: 'Menu, or close this help' },
  { group: 'Game', keys: ['KeyM'], action: 'Mute or unmute sound' },
];

export const keyLabel = (code: string): string => code.replace(/^Key/, '').replace(/^Digit/, '');

export const missingFromControls = (): string[] => {
  const listed = new Set(CONTROLS.flatMap((entry) => entry.keys));
  return [...KEY_BINDINGS.map((binding) => binding.code), ...EXTRA_CODES].filter((code) => !listed.has(code));
};

const STYLE = `
#controls { position: fixed; inset: 0; z-index: 45; display: grid; background: rgba(0, 0, 0, 0.5); }
#controls[hidden] { display: none; }
#controls-panel { display: grid; grid-template-rows: auto 1fr auto; gap: 12px; width: min(560px, 92vw); max-height: 86vh; margin: auto; padding: 20px; box-sizing: border-box; background: #fff; color: #222; border-radius: 8px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3); font: 14px/1.4 system-ui, sans-serif; }
#controls-panel h2 { margin: 0; font-size: 20px; }
#controls-list { margin: 0; overflow: auto; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-content: start; }
#controls-list dt { font-weight: 600; white-space: nowrap; }
#controls-list dd { margin: 0; }
#controls-list kbd { padding: 1px 6px; border: 1px solid #999; border-radius: 4px; background: #f3f3f3; font: 12px ui-monospace, Menlo, monospace; }
#controls-credits { justify-self: center; color: #2f6f9f; }
#controls-close { padding: 10px; font: inherit; font-size: 16px; color: #fff; background: #2f6f9f; border: 1px solid #2f6f9f; border-radius: 6px; }
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
  const title = doc.createElement('h2');
  title.textContent = 'Controls';
  const list = doc.createElement('dl');
  list.id = 'controls-list';
  for (const entry of CONTROLS) {
    const keys = doc.createElement('dt');
    entry.keys.forEach((code, index) => {
      if (index > 0) keys.append(' ');
      const key = doc.createElement('kbd');
      key.textContent = keyLabel(code);
      keys.append(key);
    });
    const action = doc.createElement('dd');
    action.textContent = `${entry.group}: ${entry.action}`;
    list.append(keys, action);
  }
  const footer = doc.createElement('div');
  footer.style.display = 'grid';
  footer.style.gap = '8px';
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
      event.stopPropagation();
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
