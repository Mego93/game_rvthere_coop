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
  onMute(): void;
  onHelp(): void;
  onTutorial(): void;
}

export interface RunMenu {
  setOpen(open: boolean): void;
  setMuted(muted: boolean): void;
  // The admin's extra items and the kick list; rebuilt whenever the room changes.
  update(isAdmin: boolean, kickable: { playerId: string; name: string }[]): void;
  dispose(): void;
}

const STYLE = `
#run-menu { position: fixed; inset: 0; width: min(320px, calc(100vw - 32px)); height: fit-content; max-height: calc(100vh - 32px); margin: auto; z-index: 20; display: grid; gap: 8px; padding: 14px; overflow-y: auto; pointer-events: auto; touch-action: manipulation; }
#run-menu[hidden] { display: none; }
#run-menu h2 { margin: 0 0 2px; font-size: 22px; color: var(--teal); text-align: center; }
#run-menu .ui-btn { width: 100%; }
#run-menu .run-kick { color: var(--danger); background: var(--paper); border-color: var(--danger); box-shadow: 0 3px 0 var(--danger); }
@media (max-height: 500px) {
  #run-menu { width: min(520px, calc(100vw - 32px)); grid-template-columns: 1fr 1fr; padding: 10px; }
  #run-menu h2 { grid-column: 1 / -1; }
}
`;

export function createRunMenu(doc: Document, handlers: RunMenuHandlers): RunMenu {
  const root = doc.createElement('div');
  root.id = 'run-menu';
  root.className = 'ui-panel';
  root.hidden = true;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.body.append(root);

  const button = (id: string, label: string, onClick: () => void, className = '') => {
    const element = doc.createElement('button');
    element.id = id;
    element.type = 'button';
    element.textContent = label;
    element.className = className ? `ui-btn ${className}` : 'ui-btn';
    element.addEventListener('click', onClick);
    return element;
  };
  const muteButton = button('run-mute', 'Mute sound', handlers.onMute);
  const helpButton = button('run-help', '? Controls', handlers.onHelp);
  const tutorialButton = button('run-tutorial', 'Tutorial', handlers.onTutorial);
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
    setMuted(muted) {
      muteButton.textContent = muted ? 'Unmute sound' : 'Mute sound';
    },
    update(isAdmin, kickable) {
      const title = doc.createElement('h2');
      title.textContent = 'Menu';
      const items = runMenuItems(isAdmin).map((label) => button(actions[label]![0], label, actions[label]![1], label === 'Resume' ? 'ui-btn-primary' : ''));
      const kicks = isAdmin ? kickable.map((entry) => button(`run-kick-${entry.playerId}`, `Kick ${entry.name}`, () => handlers.onKick(entry.playerId), 'run-kick')) : [];
      root.replaceChildren(style, title, ...items, muteButton, helpButton, tutorialButton, ...kicks);
    },
    dispose() {
      root.remove();
    },
  };
}
