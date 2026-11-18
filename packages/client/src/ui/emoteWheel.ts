import { EMOTES, type Emote, type Phase } from '@lodgy/shared';

export const EMOTE_LABELS: Record<Emote, string> = { sixSeven: '6-7', dab: 'Dab', wave: 'Wave', dance: 'Dance' };

export interface WheelState {
  phase: Phase;
  seated: boolean;
  downed: boolean;
  // Holding a prop, the hook or an item in hand, which the server refuses.
  carrying: boolean;
  // Any menu, panel or the wheel itself is open.
  open: boolean;
}

// The wheel opens only in a run, on foot, upright and empty-handed, with nothing else open.
export const emoteWheelAllowed = (state: WheelState): boolean => state.phase === 'playing' && !state.seated && !state.downed && !state.carrying && !state.open;

type KeyFacts = { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

// B opens the wheel, except while typing in a field or with a shortcut modifier held.
export const isEmoteKey = (event: KeyFacts, targetTag: string | null): boolean =>
  event.code === 'KeyB' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');

export const emoteForKey = (code: string): Emote | null => {
  const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
  return index < 0 ? null : EMOTES[index]!;
};

const STYLE = `
#emote-wheel { position: fixed; inset: 0; z-index: 16; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
#emote-wheel[hidden] { display: none; }
#emote-ring { position: relative; width: 300px; height: 300px; border-radius: 50%; background: rgba(255, 255, 255, 0.92); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4); font: 600 15px system-ui, sans-serif; color: #1d3b52; }
#emote-ring button { position: absolute; width: 92px; min-height: 56px; margin: -28px 0 0 -46px; padding: 6px; box-sizing: border-box; font: inherit; color: #1d3b52; background: #e3eef6; border: 1px solid #b9cddc; border-radius: 10px; cursor: pointer; touch-action: manipulation; }
#emote-ring button small { display: block; font-weight: 400; font-size: 11px; opacity: 0.7; }
#emote-ring button:hover, #emote-ring button:focus-visible { background: #cfe3f1; outline: 2px solid #2f6f9f; }
#emote-ring button[data-emote="sixSeven"] { left: 50%; top: 20%; }
#emote-ring button[data-emote="dab"] { left: 80%; top: 50%; }
#emote-ring button[data-emote="wave"] { left: 50%; top: 80%; }
#emote-ring button[data-emote="dance"] { left: 20%; top: 50%; }
#emote-ring #emote-close { position: absolute; left: 50%; top: 50%; width: 64px; min-height: 44px; margin: -22px 0 0 -32px; padding: 4px; font: inherit; font-weight: 400; color: #1d3b52; background: transparent; border: 1px solid #b9cddc; border-radius: 22px; cursor: pointer; }
`;

export interface EmoteWheelHandlers {
  onPick(emote: Emote): void;
  // Whether the wheel is open now; the game stands still while it is.
  onOpenChange(open: boolean): void;
}

export interface EmoteWheel {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createEmoteWheel(doc: Document, handlers: EmoteWheelHandlers): EmoteWheel {
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const root = doc.createElement('div');
  root.id = 'emote-wheel';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Emotes');
  const ring = doc.createElement('div');
  ring.id = 'emote-ring';
  EMOTES.forEach((emote, index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.emote = emote;
    button.textContent = EMOTE_LABELS[emote];
    const hint = doc.createElement('small');
    hint.textContent = String(index + 1);
    button.append(hint);
    button.addEventListener('click', () => pick(emote));
    ring.append(button);
  });
  const closeButton = doc.createElement('button');
  closeButton.id = 'emote-close';
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => set(false));
  ring.append(closeButton);
  root.append(ring);
  root.addEventListener('click', (event) => {
    if (event.target === root) set(false);
  });
  doc.body.append(style, root);

  const set = (open: boolean) => {
    if (root.hidden === !open) return;
    root.hidden = !open;
    handlers.onOpenChange(open);
  };
  const pick = (emote: Emote) => {
    set(false);
    handlers.onPick(emote);
  };
  // Capture on window and registered after the other panels: Escape and B close it, 1 to 4 pick, and none of them reach the game.
  doc.defaultView?.addEventListener(
    'keydown',
    (event) => {
      if (root.hidden) return;
      const emote = emoteForKey(event.code);
      if (event.key === 'Escape' || event.code === 'KeyB') {
        event.stopImmediatePropagation();
        if (event.key === 'Escape' || !event.repeat) set(false);
      } else if (emote) {
        event.stopImmediatePropagation();
        if (!event.repeat) pick(emote);
      }
    },
    { capture: true },
  );

  return { open: () => set(true), close: () => set(false), isOpen: () => !root.hidden };
}
