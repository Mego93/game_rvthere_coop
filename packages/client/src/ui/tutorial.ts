import { WINCH_MAX_LENGTH, WINCH_WARN_LENGTH } from '@lodgy/shared';
import { CONTROLS, keyLabels } from './controls';

export const TUTORIAL_FLAG = 'lodgy.tutorial.done';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  touchText: string;
  caps: string[];
}

const rowOf = (action: string) => {
  const entry = CONTROLS.find((row) => row.action.startsWith(action));
  if (!entry) throw new Error(`CONTROLS has no row "${action}"`);
  return entry;
};

// The caps of the CONTROLS rows whose action starts with `actions`.
const caps = (...actions: string[]): string[] => [...new Set(actions.flatMap((action) => keyLabels(rowOf(action).keys)))];

// The key words of the CONTROLS row whose action starts with `action`, as prose: "E", "W, A, S or D".
const key = (action: string): string => {
  const labels = keyLabels(rowOf(action).keys);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
};

const WINCH_RANGE = `The hook reaches ${WINCH_MAX_LENGTH} m, and the rope turns red from ${WINCH_WARN_LENGTH} m: it is about to let go.`;
const BOARD_RULE = 'At the driver door you take the driver seat if it is free; anywhere else you take the nearest free seat.';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    title: 'Move and jump',
    text: `Walk with ${key('Walk')} and jump with ${key('Jump')}. Click the game to look around with the mouse.`,
    touchText: 'Drag on the left half of the screen to walk and on the right half to look. Tap Jump to jump.',
    caps: caps('Walk', 'Jump'),
  },
  {
    id: 'sprint',
    title: 'Sprint, crouch and slide',
    text: `Hold ${key('Sprint')} while moving forward to sprint. Hold ${key('Crouch')} to crouch and fit under low gaps. Press ${key('Crouch')} while sprinting to slide.`,
    touchText: 'Tap Sprint to start running and tap it again to stop. Sprint only works while moving forward.',
    caps: caps('Sprint', 'Crouch'),
  },
  {
    id: 'board',
    title: 'Board and seats',
    text: `Walk up to the vehicle and press ${key('Board')} to board. ${BOARD_RULE} Press ${key('Board')} again to leave.`,
    touchText: `Walk up to the vehicle and tap Act to board. ${BOARD_RULE} Tap Act again to leave.`,
    caps: caps('Board'),
  },
  {
    id: 'drive',
    title: 'Drive',
    text: `The driver steers and accelerates with ${key('Throttle')} and brakes with ${key('Brake')}. The others ride along, and the vehicle is the same one for everyone.`,
    touchText: 'The driver uses the joystick on the left to steer and throttle, and Brake on the right. The others ride along.',
    caps: caps('Throttle', 'Brake'),
  },
  {
    id: 'winch',
    title: 'The winch',
    text: `Press ${key('Board')} near the hook to take it, walk to an anchor and press ${key('Board')} to attach it. ${key('Reel in')} reels the rope in and ${key('Reel out')} reels it out. ${WINCH_RANGE}`,
    touchText: `Tap Act near the hook to take it, walk to an anchor and tap Act to attach it. Reel in and Reel out change the rope length. ${WINCH_RANGE}`,
    caps: caps('Board', 'Reel in', 'Reel out'),
  },
  {
    id: 'items',
    title: 'Items',
    text: `Pick items up with ${key('Board')} and choose a slot with ${key('Select a slot')}. Hold ${key('Use the selected')} to use the selected item: it works while the bar fills.`,
    touchText: 'Pick items up with Act and tap a slot to select it. Hold Use to use the selected item: it works while the bar fills.',
    caps: caps('Select a slot', 'Use the selected'),
  },
  {
    id: 'reset',
    title: 'Reset a stuck vehicle',
    text: `If the vehicle is stuck or upside down, hold ${key('Hold to reset')} until it resets. It costs time.`,
    touchText: 'If the vehicle is stuck or upside down, hold Reset until it resets. It costs time.',
    caps: caps('Hold to reset'),
  },
  {
    id: 'help',
    title: 'Help',
    text: `Press ${key('Show or hide this help')} any time to see every control, and ${key('Open chat')} to chat with your crew. ${key('Menu')} opens the menu, where you can open this tutorial again.`,
    touchText: 'Tap Menu any time to open the menu. It lists the controls and opens this tutorial again. Tap Chat to talk with your crew.',
    caps: caps('Show or hide this help'),
  },
];

export const tutorialText = (step: TutorialStep, touch: boolean): string => (touch ? step.touchText : step.text);

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isDone = (store: Store | null): boolean => {
  try {
    return store?.getItem(TUTORIAL_FLAG) === '1';
  } catch {
    return false;
  }
};

// Once per page load at most, and never again once the flag is set; a storage that throws only limits it to once per load.
export const shouldAutoShowTutorial = (store: Store | null, shownThisLoad: boolean): boolean => !shownThisLoad && !isDone(store);

export function markTutorialDone(store: Store | null): void {
  try {
    store?.setItem(TUTORIAL_FLAG, '1');
  } catch {
    // The tutorial then shows again on the next page load.
  }
}

const STYLE = `
#tutorial { position: fixed; inset: 0; z-index: 50; display: grid; background: rgba(0, 0, 0, 0.45); }
#tutorial[hidden] { display: none; }
#tutorial-panel { display: grid; gap: 12px; width: min(460px, 92vw); max-height: 90vh; margin: auto; padding: 18px; box-sizing: border-box; overflow-y: auto; color: rgba(255, 255, 255, 0.92); background: rgba(12, 16, 24, 0.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55); font: 14px/1.45 system-ui, sans-serif; }
#tutorial-count { color: rgba(255, 255, 255, 0.6); font-size: 12px; }
#tutorial-title { margin: 0; font-size: 20px; }
#tutorial-text { margin: 0; }
#tutorial-caps { display: flex; flex-wrap: wrap; gap: 6px; }
#tutorial-caps[hidden] { display: none; }
#tutorial-caps kbd { padding: 2px 8px; border: 1px solid rgba(255, 255, 255, 0.5); border-bottom-width: 3px; border-radius: 5px; background: rgba(255, 255, 255, 0.12); font: 13px ui-monospace, Menlo, monospace; }
#tutorial-nav { display: flex; gap: 8px; justify-content: space-between; }
#tutorial-nav button { padding: 10px 14px; font: inherit; color: #fff; background: #2f6f9f; border: 1px solid #9ab; border-radius: 6px; touch-action: manipulation; }
#tutorial-nav button[hidden] { display: none; }
#tutorial-skip { background: transparent !important; }
`;

export interface Tutorial {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createTutorial(doc: Document, options: { touch: boolean; store: Store | null; onChange?: (open: boolean) => void }): Tutorial {
  const root = doc.createElement('div');
  root.id = 'tutorial';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Tutorial');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const panel = doc.createElement('div');
  panel.id = 'tutorial-panel';
  const count = doc.createElement('div');
  count.id = 'tutorial-count';
  const title = doc.createElement('h2');
  title.id = 'tutorial-title';
  const text = doc.createElement('p');
  text.id = 'tutorial-text';
  const capsBox = doc.createElement('div');
  capsBox.id = 'tutorial-caps';
  const nav = doc.createElement('div');
  nav.id = 'tutorial-nav';
  const button = (id: string, label: string) => {
    const element = doc.createElement('button');
    element.id = id;
    element.type = 'button';
    element.textContent = label;
    return element;
  };
  const skip = button('tutorial-skip', 'Skip');
  const back = button('tutorial-back', 'Back');
  const next = button('tutorial-next', 'Next');
  nav.append(skip, back, next);
  panel.append(count, title, text, capsBox, nav);
  root.append(style, panel);
  doc.body.append(root);

  let index = 0;
  const render = () => {
    const step = TUTORIAL_STEPS[index]!;
    count.textContent = `${index + 1} / ${TUTORIAL_STEPS.length}`;
    title.textContent = step.title;
    text.textContent = tutorialText(step, options.touch);
    capsBox.replaceChildren(
      ...step.caps.map((label) => {
        const cap = doc.createElement('kbd');
        cap.textContent = label;
        return cap;
      }),
    );
    capsBox.hidden = options.touch;
    back.hidden = index === 0;
    next.textContent = index === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next';
  };
  const set = (open: boolean) => {
    if (root.hidden === !open) return;
    if (open) {
      index = 0;
      render();
    }
    root.hidden = !open;
    if (open) next.focus();
    options.onChange?.(open);
  };
  const finish = () => {
    markTutorialDone(options.store);
    set(false);
  };
  skip.addEventListener('click', finish);
  back.addEventListener('click', () => {
    index = Math.max(0, index - 1);
    render();
  });
  next.addEventListener('click', () => {
    if (index === TUTORIAL_STEPS.length - 1) finish();
    else {
      index += 1;
      render();
    }
  });
  // Capture on window, so the game's own Escape handler does not also open the run menu. Escape counts as Skip. Create this before the controls panel: its listener runs first and the immediate stop leaves the controls panel for the next Escape.
  doc.defaultView?.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || root.hidden) return;
      event.stopImmediatePropagation();
      finish();
    },
    { capture: true },
  );

  return { open: () => set(true), close: () => set(false), isOpen: () => !root.hidden };
}
