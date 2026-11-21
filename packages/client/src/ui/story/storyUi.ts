import { type CharacterId, type ClientMessage, type DaySummaryMessage, type Spot, type SpotKind, type StoryFriendView, type StoryStateMessage, type Vec3 } from '@lodgy/shared';
import { CHART_POINTS, FAKE_STOCKS, chartSeries, chartShown, outcomeText } from './fakeRepublic';
import { cashText, goalsView } from './needsView';
import { kioskView, phoneView } from './phoneView';
import { nearAtm } from './spots';
import { summaryView } from './summaryView';

export interface StoryUi {
  setCharacter(id: CharacterId | null): void;
  character(): CharacterId | null;
  // The local friend's view in the latest state, or null before the first one.
  friend(): StoryFriendView | null;
  state(): StoryStateMessage | null;
  onState(message: StoryStateMessage): void;
  onToast(text: string): void;
  takeToasts(): string[];
  onFakeRepublic(message: { pick: 0 | 1 | 2; outcome: number }): void;
  onDaySummary(message: DaySummaryMessage): void;
  // The local player used a spot the client reacts to: the kiosk opens its menu, the board the goals.
  onSpot(kind: SpotKind): void;
  // Where the local player stands, for the ATM and the markers; called every frame.
  setPlace(feet: Vec3 | null, spots: readonly Spot[]): void;
  // A refused purchase: shown in the open menu; false when none is open.
  showError(): boolean;
  isOpen(): boolean;
  closeAll(): void;
  togglePhone(): void;
  openGoals(): void;
  canComplain(): boolean;
  complain(): void;
  // The run ended or the room was left: forget the week's state and close everything. The day summary stays.
  reset(): void;
  dispose(): void;
}

export interface StoryUiDeps {
  send(message: ClientMessage): void;
  // A panel opened or closed: the game stands still while one is open.
  onOpenChange(): void;
}

export const isPhoneKey = (event: { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, targetTag: string | null): boolean =>
  event.code === 'KeyP' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');

// Luiz's complaint key. C is crouch, so the complaint takes Z.
export const isComplainKey = (event: { code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, targetTag: string | null): boolean =>
  event.code === 'KeyZ' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag?.toUpperCase() ?? '');

const STYLE = `
.story-panel { position: fixed; inset: 0; width: min(380px, calc(100vw - 32px)); height: fit-content; max-height: calc(100vh - 32px); margin: auto; z-index: 22; display: grid; gap: 8px; padding: 14px; overflow-y: auto; pointer-events: auto; touch-action: manipulation; }
.story-panel[hidden] { display: none; }
#story-summary { z-index: 26; }
.story-panel h2 { margin: 0; font-size: 22px; color: var(--teal); text-align: center; }
.story-panel h3 { margin: 4px 0 0; font-size: 15px; color: var(--ink-soft); }
.story-panel .ui-btn { width: 100%; justify-content: space-between; }
.story-row { display: grid; gap: 6px; }
.story-panel .ui-btn.story-tile { flex-direction: column; justify-content: center; gap: 2px; padding: 6px 4px; font-size: 14px; text-align: center; white-space: pre-line; line-height: 1.2; }
.story-money { margin: 0; padding: 6px 10px; text-align: center; font-weight: 600; color: var(--ink); background: var(--paper); border-radius: var(--radius-ctl); }
.story-error { margin: 0; min-height: 1.3em; text-align: center; font-weight: 600; color: var(--danger); }
.story-note { margin: 0; color: var(--ink-soft); font-size: 13px; }
.story-chart { width: 100%; height: 120px; background: var(--paper); border-radius: var(--radius-ctl); }
.story-chart polyline { fill: none; stroke: var(--teal); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.story-result { margin: 0; text-align: center; font-weight: 700; color: var(--ink); }
.story-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.story-list li { padding: 6px 10px; background: var(--paper); border-radius: var(--radius-ctl); }
.story-list.done li::before { content: '✓ '; color: var(--ok); font-weight: 700; }
.story-list.missed li::before { content: '✗ '; color: var(--danger); font-weight: 700; }
.story-list.skipped li::before { content: '– '; color: var(--ink-soft); font-weight: 700; }
@media (max-height: 420px) { .story-panel { gap: 4px; padding: 10px; } .story-panel .ui-btn { min-height: 38px; padding: 4px 12px; } .story-chart { height: 80px; } .story-error { min-height: 0; } }
`;

type FakeRepublicState = { phase: 'pick' } | { phase: 'waiting'; pick: 0 | 1 | 2 } | { phase: 'chart'; pick: 0 | 1 | 2; outcome: number; startedAt: number };

export function createStoryUi(doc: Document, deps: StoryUiDeps): StoryUi {
  const win = doc.defaultView!;
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.append(style);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, onClick: () => void, enabled = true, extra = '') => {
    const node = el('button', `ui-btn${extra}`);
    node.type = 'button';
    node.textContent = label;
    node.disabled = !enabled;
    node.addEventListener('click', onClick);
    return node;
  };
  const tiles = (columns: number, buttons: HTMLElement[]) => {
    const row = el('div', 'story-row');
    row.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    row.append(...buttons);
    return row;
  };
  const makePanel = (id: string, title: string) => {
    const root = el('div', 'story-panel ui-panel');
    root.id = id;
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', title);
    doc.body.append(root);
    return root;
  };
  const phoneRoot = makePanel('story-phone', 'Phone');
  const kioskRoot = makePanel('story-kiosk', 'Kiosk');
  const goalsRoot = makePanel('story-goals', 'Goals');
  const summaryRoot = makePanel('story-summary', 'Day summary');

  let character: CharacterId | null = null;
  let state: StoryStateMessage | null = null;
  let feet: Vec3 | null = null;
  let spots: readonly Spot[] = [];
  let toasts: string[] = [];
  let fake: FakeRepublicState = { phase: 'pick' };
  let timer: number | null = null;
  const errorLines = new Map<HTMLElement, HTMLElement>();
  let errorTimer: number | null = null;

  const friend = (): StoryFriendView | null => (state && character ? (state.friends[character] ?? null) : null);
  const open = () => [phoneRoot, kioskRoot, goalsRoot, summaryRoot].some((root) => !root.hidden);
  const keys = new Map<HTMLElement, string>();

  const stopTimer = () => {
    if (timer !== null) win.clearInterval(timer);
    timer = null;
  };
  const clearError = () => {
    if (errorTimer !== null) win.clearTimeout(errorTimer);
    errorTimer = null;
    for (const line of errorLines.values()) line.textContent = '';
  };

  const header = (root: HTMLElement, title: string, body: Element[], close: () => void) => {
    const error = el('p', 'story-error');
    error.setAttribute('role', 'alert');
    errorLines.set(root, error);
    root.replaceChildren(el('h2', undefined, title), ...body, error, button('Close', close));
  };

  const closePhone = () => {
    if (phoneRoot.hidden) return;
    phoneRoot.hidden = true;
    stopTimer();
    if (fake.phase !== 'chart') fake = { phase: 'pick' };
    deps.onOpenChange();
  };
  const closeKiosk = () => {
    if (kioskRoot.hidden) return;
    kioskRoot.hidden = true;
    deps.onOpenChange();
  };
  const closeGoals = () => {
    if (goalsRoot.hidden) return;
    goalsRoot.hidden = true;
    deps.onOpenChange();
  };
  const closeSummary = () => {
    if (summaryRoot.hidden) return;
    summaryRoot.hidden = true;
    deps.onOpenChange();
  };

  const chartNode = () => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'story-chart');
    svg.setAttribute('viewBox', '0 0 300 120');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Price chart');
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    svg.append(line);
    return { svg, line };
  };
  const chartPoints = (series: number[], shown: number) =>
    series
      .slice(0, shown)
      .map((value, i) => `${((i / (CHART_POINTS - 1)) * 300).toFixed(1)},${(112 - value * 104).toFixed(1)}`)
      .join(' ');

  const renderPhone = () => {
    const mine = friend();
    if (!mine) {
      phoneRoot.replaceChildren(el('h2', undefined, 'Phone'), el('p', 'story-note', 'No signal.'), button('Close', closePhone));
      keys.delete(phoneRoot);
      return;
    }
    const view = phoneView(mine, character, nearAtm(spots, feet));
    const key = JSON.stringify([view, fake.phase, fake.phase === 'pick' ? 0 : (fake as { pick: number }).pick]);
    if (keys.get(phoneRoot) === key) return;
    keys.set(phoneRoot, key);
    const body: Element[] = [el('p', 'story-money', `Cash ${cashText(view.cash)}   Bank ${cashText(view.bank)}`)];
    body.push(el('h3', undefined, 'ATM'));
    if (!view.atm.reachable) body.push(el('p', 'story-note', 'Go to the ATM outside the gate to withdraw.'));
    body.push(tiles(2, view.atm.buttons.map((entry) => button(`Withdraw\n${entry.amount} dh`, () => deps.send({ type: 'phone', action: { kind: 'withdraw', amount: entry.amount } }), entry.enabled, ' story-tile'))));
    if (view.shop) {
      body.push(el('h3', undefined, "Alexander's shop"));
      body.push(tiles(3, view.shop.map((entry) => button(`${entry.label}\n${cashText(entry.price)}`, () => deps.send({ type: 'phone', action: { kind: 'phoneBuy', item: entry.item } }), entry.enabled, ' story-tile'))));
    }
    if (view.fakeRepublic || fake.phase === 'chart') {
      body.push(el('h3', undefined, 'Fake Republic'));
      if (fake.phase === 'pick') {
        body.push(el('p', 'story-note', 'Pick a stock. It is not financial advice. It is not even a real republic.'));
        body.push(tiles(3, FAKE_STOCKS.map((stock, index) => button(`${stock.ticker}\n${stock.name}`, () => pickStock(index as 0 | 1 | 2), true, ' story-tile'))));
      } else if (fake.phase === 'waiting') body.push(el('p', 'story-note', 'Placing your order...'));
      else {
        const { svg, line } = chartNode();
        svg.id = 'story-chart';
        const series = chartSeries(fake.pick, fake.outcome);
        const result = el('p', 'story-result');
        result.id = 'story-result';
        const draw = () => {
          if (fake.phase !== 'chart') return;
          const shown = chartShown((performance.now() - fake.startedAt) / 1000);
          line.setAttribute('points', chartPoints(series, shown));
          if (shown >= CHART_POINTS) {
            result.textContent = outcomeText(fake.outcome);
            stopTimer();
          }
        };
        draw();
        stopTimer();
        if (result.textContent === '') timer = win.setInterval(draw, 80);
        body.push(svg, result);
      }
    }
    header(phoneRoot, 'Phone', body, closePhone);
  };

  const pickStock = (pick: 0 | 1 | 2) => {
    fake = { phase: 'waiting', pick };
    keys.delete(phoneRoot);
    deps.send({ type: 'phone', action: { kind: 'fakeRepublic', pick } });
    renderPhone();
  };

  const renderKiosk = () => {
    const mine = friend();
    if (!mine) return;
    const view = kioskView(mine);
    const key = JSON.stringify(view);
    if (keys.get(kioskRoot) === key) return;
    keys.set(kioskRoot, key);
    const body: Element[] = [el('p', 'story-money', `Cash ${cashText(view.cash)}`)];
    body.push(tiles(2, view.buy.map((entry) => button(`${entry.label}\n${entry.price} dh`, () => deps.send({ type: 'phone', action: { kind: 'buy', item: entry.item } }), entry.enabled, ' story-tile'))));
    if (view.eat.length > 0) {
      body.push(el('h3', undefined, 'You carry'));
      body.push(tiles(2, view.eat.map((entry) => button(`Eat\n${entry.label}${entry.count > 1 ? ` x${entry.count}` : ''}`, () => deps.send({ type: 'phone', action: { kind: 'eat', item: entry.item as never } }), true, ' story-tile'))));
    }
    header(kioskRoot, 'Kiosk', body, closeKiosk);
  };

  const renderGoals = () => {
    if (!state) return;
    const rows = goalsView(state.goals);
    const key = JSON.stringify(rows);
    if (keys.get(goalsRoot) === key) return;
    keys.set(goalsRoot, key);
    const list = el('ul', 'story-list');
    for (const row of rows) list.append(el('li', undefined, `${row.mark} ${row.label}`));
    header(goalsRoot, 'Goals', [list], closeGoals);
  };

  const renderOpen = () => {
    if (!phoneRoot.hidden) renderPhone();
    if (!kioskRoot.hidden) renderKiosk();
    if (!goalsRoot.hidden) renderGoals();
  };

  const showOnly = (root: HTMLElement) => {
    for (const other of [phoneRoot, kioskRoot, goalsRoot]) if (other !== root && !other.hidden) other.hidden = true;
    stopTimer();
    keys.delete(root);
    root.hidden = false;
    renderOpen();
    deps.onOpenChange();
  };

  win.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open()) return;
      event.stopImmediatePropagation();
      closeSummary();
      closePhone();
      closeKiosk();
      closeGoals();
    },
    { capture: true },
  );

  return {
    setCharacter: (id) => void (character = id),
    character: () => character,
    friend,
    state: () => state,
    onState(message) {
      state = message;
      renderOpen();
    },
    onToast: (text) => void toasts.push(text),
    takeToasts() {
      const taken = toasts;
      toasts = [];
      return taken;
    },
    onFakeRepublic(message) {
      if (fake.phase !== 'waiting') return;
      fake = { phase: 'chart', pick: message.pick, outcome: message.outcome, startedAt: performance.now() };
      keys.delete(phoneRoot);
      if (!phoneRoot.hidden) renderPhone();
    },
    onDaySummary(message) {
      const view = summaryView(message);
      const body: HTMLElement[] = [];
      for (const section of view.sections) {
        body.push(el('h3', undefined, section.title));
        const list = el('ul', `story-list ${section.key}`);
        for (const label of section.labels) list.append(el('li', undefined, label));
        body.push(list);
      }
      if (body.length === 0) body.push(el('p', 'story-note', 'Nothing was on the list.'));
      header(summaryRoot, view.title, body, closeSummary);
      summaryRoot.hidden = false;
      deps.onOpenChange();
    },
    onSpot(kind) {
      if (kind === 'shop') showOnly(kioskRoot);
      else if (kind === 'board') showOnly(goalsRoot);
    },
    setPlace(nextFeet, nextSpots) {
      const was = nearAtm(spots, feet);
      feet = nextFeet;
      spots = nextSpots;
      if (!phoneRoot.hidden && was !== nearAtm(spots, feet)) renderPhone();
    },
    showError() {
      const visible = [phoneRoot, kioskRoot].find((root) => !root.hidden);
      if (!visible) return false;
      const line = errorLines.get(visible);
      if (!line) return false;
      clearError();
      line.textContent = 'Cannot do that';
      errorTimer = win.setTimeout(clearError, 2000);
      // A refused Fake Republic pick goes back to the choice.
      if (visible === phoneRoot && fake.phase === 'waiting') {
        fake = { phase: 'pick' };
        keys.delete(phoneRoot);
        renderPhone();
        errorLines.get(phoneRoot)!.textContent = 'Cannot do that';
      }
      return true;
    },
    isOpen: open,
    closeAll() {
      closeSummary();
      closePhone();
      closeKiosk();
      closeGoals();
    },
    togglePhone() {
      if (!state) return;
      if (!phoneRoot.hidden) closePhone();
      else showOnly(phoneRoot);
    },
    openGoals() {
      if (!state) return;
      if (!goalsRoot.hidden) closeGoals();
      else showOnly(goalsRoot);
    },
    canComplain: () => character === 'luiz' && state !== null,
    complain() {
      if (character === 'luiz' && state !== null) deps.send({ type: 'complain' });
    },
    reset() {
      state = null;
      toasts = [];
      fake = { phase: 'pick' };
      feet = null;
      spots = [];
      stopTimer();
      clearError();
      for (const root of [phoneRoot, kioskRoot, goalsRoot]) root.hidden = true;
      keys.clear();
      deps.onOpenChange();
    },
    dispose() {
      stopTimer();
      clearError();
      for (const root of [phoneRoot, kioskRoot, goalsRoot, summaryRoot]) root.remove();
      style.remove();
    },
  };
}

