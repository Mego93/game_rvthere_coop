import { CAMPAIGN, type ResultsMessage } from '@lodgy/shared';
import { VEHICLE_LABELS } from './lobby';

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

export function resultsView(message: ResultsMessage, isAdmin: boolean): ResultsView {
  const lines = [
    `Final time ${clock(message.finalTime)}`,
    `Vehicle ${VEHICLE_LABELS[message.vehicleId] ?? message.vehicleId}`,
    `Course ${message.courseId}, ${message.timeOfDay}, ${message.weather}`,
    `Restarts ${message.restarts}, respawns ${message.respawns}`,
    `Coins ${message.wallet} kept, ${message.coinsCollected}/${message.coinsTotal} collected`,
    `Stars ${message.stars.map((earned) => (earned ? '★' : '☆')).join('')}`,
  ];
  if (message.assisted) lines.push('assisted');
  if (message.campaignTotal !== undefined) lines.push(`Campaign total ${clock(message.campaignTotal)}`);
  const index = CAMPAIGN.indexOf(message.courseId);
  return { lines, showNext: isAdmin && index >= 0 && index < CAMPAIGN.length - 1, showLobby: isAdmin };
}

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
  const text = doc.createElement('div');
  const button = (id: string, label: string, onClick: () => void) => {
    const element = doc.createElement('button');
    element.id = id;
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
  };
  const next = button('results-next', 'Next course', handlers.onNext);
  const lobby = button('results-lobby', 'Back to lobby', handlers.onLobby);
  const buttons = doc.createElement('div');
  buttons.append(next, lobby);
  const panel = doc.createElement('div');
  panel.append(text, buttons);
  root.replaceChildren(panel);
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
