export interface RunMenuState {
  open: boolean;
}

export type RunMenuEvent = 'esc' | 'button' | 'resume' | 'shopOpened' | 'phaseLeft';

// Esc toggles, but never while the shop menu is open (that Esc closes the shop menu); the touch button opens; neither opens outside the playing phase.
export function runMenuState(prev: RunMenuState, event: RunMenuEvent, shopOpen: boolean, playing = true): RunMenuState {
  switch (event) {
    case 'esc':
      return { open: playing && !shopOpen && !prev.open };
    case 'button':
      return { open: playing };
    default:
      return { open: false };
  }
}

// The local game stands still while a menu is open and outside the playing phase (the frozen world behind the results).
export const inputFrozen = (menuOpen: boolean, phase: string): boolean => menuOpen || phase !== 'playing';

export function runMenuItems(isAdmin: boolean): string[] {
  return isAdmin ? ['Resume', 'Restart from checkpoint', 'Restart course', 'Return to lobby', 'Skip checkpoint', 'Refill'] : ['Resume'];
}

export interface RunMenuHandlers {
  onResume(): void;
  onRestartCheckpoint(): void;
  onRestartCourse(): void;
  onToLobby(): void;
  onSkip(): void;
  onRefill(): void;
  onKick(playerId: string): void;
}

export interface RunMenu {
  setOpen(open: boolean): void;
  // The admin's extra items and the kick list; rebuilt whenever the room changes.
  update(isAdmin: boolean, kickable: { playerId: string; name: string }[]): void;
  dispose(): void;
}

const STYLE = `
#run-menu { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20; display: grid; gap: 8px; min-width: 240px; max-height: 90vh; overflow-y: auto; padding: 14px; color: #fff; background: rgba(0, 0, 0, 0.8); border-radius: 8px; font: 14px/1.3 system-ui, sans-serif; pointer-events: auto; touch-action: manipulation; }
#run-menu[hidden] { display: none; }
#run-menu button { padding: 12px; font: inherit; color: #fff; background: #2f6f9f; border: 1px solid #9ab; border-radius: 6px; touch-action: manipulation; }
#run-menu .run-kick { background: #8a3a2f; }
`;

export function createRunMenu(doc: Document, handlers: RunMenuHandlers): RunMenu {
  const root = doc.createElement('div');
  root.id = 'run-menu';
  root.hidden = true;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.body.append(root);

  const button = (id: string, label: string, onClick: () => void, className = '') => {
    const element = doc.createElement('button');
    element.id = id;
    element.type = 'button';
    element.textContent = label;
    if (className) element.className = className;
    element.addEventListener('click', onClick);
    return element;
  };
  const actions: Record<string, [string, () => void]> = {
    Resume: ['run-resume', handlers.onResume],
    'Restart from checkpoint': ['run-restart-checkpoint', handlers.onRestartCheckpoint],
    'Restart course': ['run-restart-course', handlers.onRestartCourse],
    'Return to lobby': ['run-to-lobby', handlers.onToLobby],
    'Skip checkpoint': ['run-skip', handlers.onSkip],
    Refill: ['run-refill', handlers.onRefill],
  };

  return {
    setOpen(open) {
      root.hidden = !open;
    },
    update(isAdmin, kickable) {
      const title = doc.createElement('strong');
      title.textContent = 'Menu';
      const items = runMenuItems(isAdmin).map((label) => button(actions[label]![0], label, actions[label]![1]));
      const kicks = isAdmin ? kickable.map((entry) => button(`run-kick-${entry.playerId}`, `Kick ${entry.name}`, () => handlers.onKick(entry.playerId), 'run-kick')) : [];
      root.replaceChildren(style, title, ...items, ...kicks);
    },
    dispose() {
      root.remove();
    },
  };
}
