import { CAMPAIGN, type ResultsMessage } from '@lodgy/shared';
import { VEHICLE_LABELS, WEATHER_LABELS } from './lobby';

export interface ResultsView {
  lines: string[];
  showNext: boolean;
  showLobby: boolean;
}

function clock(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function resultsView(message: ResultsMessage, isAdmin: boolean, campaign: readonly string[] = CAMPAIGN): ResultsView {
  const lines = [
    `Final time ${clock(message.finalTime)}`,
    `Vehicle ${Object.hasOwn(VEHICLE_LABELS, message.vehicleId) ? VEHICLE_LABELS[message.vehicleId] : message.vehicleId}`,
    `Course ${message.courseId}, ${message.timeOfDay}, ${WEATHER_LABELS[message.weather]}`,
    `Restarts ${message.restarts}, respawns ${message.respawns}`,
    `Coins ${message.wallet} kept, ${message.coinsCollected}/${message.coinsTotal} collected`,
    `Stars ${message.stars.map((earned) => (earned ? '★' : '☆')).join('')}`,
  ];
  if (message.assisted) lines.push('assisted');
  if (message.campaignTotal !== undefined) lines.push(`Campaign total ${clock(message.campaignTotal)}`);
  if (!isAdmin) lines.push('Waiting for the admin');
  const index = campaign.indexOf(message.courseId);
  return { lines, showNext: isAdmin && index >= 0 && index < campaign.length - 1, showLobby: isAdmin };
}

const STYLE = `
#results { position: fixed; inset: 0; z-index: 20; display: grid; overflow-y: auto; box-sizing: border-box; padding: max(16px, var(--safe-top)) max(16px, var(--safe-right)) max(16px, var(--safe-bottom)) max(16px, var(--safe-left)); background: var(--scrim); }
#results[hidden], #results [hidden] { display: none; }
#results-panel { width: min(420px, 100%); margin: auto; padding: 22px; display: grid; gap: 14px; text-align: center; animation: results-rise 240ms var(--ease) both; }
#results-title { margin: 0; font-size: 26px; font-weight: 700; color: var(--teal); }
#results-lines { display: grid; gap: 6px; white-space: pre-line; overflow-wrap: anywhere; font-size: 16px; }
#results-lines > div { padding: 6px 10px; background: var(--paper); border-radius: var(--radius-ctl); }
#results-lines > div:first-child { font: 700 24px/1.2 var(--font-display); color: var(--terracotta-strong); }
#results-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
@media (max-height: 500px) {
  #results-panel { gap: 8px; padding: 12px 16px; }
  #results-title { font-size: 22px; }
  #results-lines { grid-template-columns: 1fr 1fr; gap: 4px 6px; font-size: 14px; }
  #results-lines > div { padding: 3px 8px; }
  #results-lines > div:first-child { grid-column: 1 / -1; font-size: 20px; }
  #results-lines > div:last-child:nth-child(even) { grid-column: 1 / -1; }
}
@keyframes results-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { #results-panel { animation: none; } }
`;

export interface ResultsHandlers {
  onNext(): void;
  onLobby(): void;
}

export interface ResultsScreen {
  show(message: ResultsMessage, isAdmin: boolean): void;
  hide(): void;
}

export function createResults(root: HTMLElement, handlers: ResultsHandlers): ResultsScreen {
  const doc = root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const title = doc.createElement('h2');
  title.id = 'results-title';
  title.textContent = 'Course complete';
  const text = doc.createElement('div');
  text.id = 'results-lines';
  const button = (id: string, label: string, onClick: () => void) => {
    const element = doc.createElement('button');
    element.id = id;
    element.type = 'button';
    element.textContent = label;
    element.className = id === 'results-next' ? 'ui-btn ui-btn-primary' : 'ui-btn';
    element.addEventListener('click', onClick);
    return element;
  };
  const next = button('results-next', 'Next course', handlers.onNext);
  const lobby = button('results-lobby', 'Back to lobby', handlers.onLobby);
  const buttons = doc.createElement('div');
  buttons.id = 'results-buttons';
  buttons.append(next, lobby);
  const panel = doc.createElement('div');
  panel.id = 'results-panel';
  panel.className = 'ui-panel';
  panel.append(title, text, buttons);
  root.replaceChildren(style, panel);
  return {
    show(message, isAdmin) {
      const view = resultsView(message, isAdmin);
      text.replaceChildren(...view.lines.map((line) => Object.assign(doc.createElement('div'), { textContent: line })));
      next.hidden = !view.showNext;
      lobby.hidden = !view.showLobby;
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
  };
}
