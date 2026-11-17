import { TIMES_OF_DAY, VEHICLE_IDS, WEATHERS, courseIds, type LobbyMessage, type RoomSettings } from '@lodgy/shared';

export const VEHICLE_LABELS: Record<string, string> = { lodgy: 'Lodgy', rv: 'RV' };
const vehicleLabel = (id: string) => (Object.hasOwn(VEHICLE_LABELS, id) ? VEHICLE_LABELS[id] : id);

export interface LobbyPlayerView {
  playerId: string;
  name: string;
  colour: string;
  isAdmin: boolean;
  connected: boolean;
  // "admin", "ready" or "not ready", with " (disconnected)" for a held slot.
  status: string;
  canKick: boolean;
}

export const OSM_ATTRIBUTION = { text: 'Route data © OpenStreetMap contributors (ODbL)', href: 'https://www.openstreetmap.org/copyright' } as const;

export interface LobbyView {
  isAdmin: boolean;
  settingsEditable: boolean;
  settings: RoomSettings;
  players: LobbyPlayerView[];
  showReady: boolean;
  localReady: boolean;
  showStart: boolean;
  startEnabled: boolean;
  attribution: { text: string; href: string };
}

export function lobbyView(message: LobbyMessage, localId: string): LobbyView {
  const isAdmin = message.adminId !== null && message.adminId === localId;
  const players = message.players.map((entry): LobbyPlayerView => {
    const admin = entry.playerId === message.adminId;
    const base = admin ? 'admin' : entry.ready ? 'ready' : 'not ready';
    return {
      playerId: entry.playerId,
      name: entry.name,
      colour: entry.colour,
      isAdmin: admin,
      connected: entry.connected,
      status: entry.connected ? base : `${base} (disconnected)`,
      canKick: isAdmin && entry.playerId !== localId,
    };
  });
  const others = message.players.filter((entry) => entry.playerId !== message.adminId && entry.connected);
  return {
    isAdmin,
    settingsEditable: isAdmin,
    settings: { courseId: message.courseId, vehicleId: message.vehicleId, timeOfDay: message.timeOfDay, weather: message.weather },
    players,
    showReady: !isAdmin,
    localReady: message.players.find((entry) => entry.playerId === localId)?.ready ?? false,
    showStart: isAdmin,
    startEnabled: isAdmin && others.every((entry) => entry.ready),
    attribution: OSM_ATTRIBUTION,
  };
}

// With no previous view every card is new, so the lobby's first display slides them all in.
export function newPlayerIds(previous: readonly LobbyPlayerView[] | null, next: readonly LobbyPlayerView[]): string[] {
  const known = new Set(previous?.map((entry) => entry.playerId));
  return next.filter((entry) => !known.has(entry.playerId)).map((entry) => entry.playerId);
}

const baseStatus = (status: string) => status.replace(' (disconnected)', '');

// Players in both views whose admin/ready/not-ready state changed; a connection change alone does not count.
export function readyChanged(previous: readonly LobbyPlayerView[] | null, next: readonly LobbyPlayerView[]): string[] {
  if (!previous) return [];
  const before = new Map(previous.map((entry) => [entry.playerId, baseStatus(entry.status)]));
  return next.filter((entry) => before.has(entry.playerId) && before.get(entry.playerId) !== baseStatus(entry.status)).map((entry) => entry.playerId);
}

// A setting the admin changed that the server has not echoed yet keeps the local value; once the echo shows it, the server's value wins again.
export function mergeSettings(local: RoomSettings, pending: Partial<RoomSettings>, server: RoomSettings): { settings: RoomSettings; pending: Partial<RoomSettings> } {
  const settings = { ...server };
  const remaining: Partial<RoomSettings> = {};
  for (const key of Object.keys(pending) as (keyof RoomSettings)[]) {
    if (server[key] === pending[key]) continue;
    (settings as Record<string, string>)[key] = local[key];
    (remaining as Record<string, string>)[key] = pending[key]!;
  }
  return { settings, pending: remaining };
}

interface PlayerCard {
  item: HTMLLIElement;
  swatch: HTMLSpanElement;
  name: HTMLSpanElement;
  status: HTMLSpanElement;
  kick: HTMLButtonElement | null;
}

export interface LobbyHandlers {
  onReady(ready: boolean): void;
  onConfigure(settings: RoomSettings): void;
  onStart(): void;
  onKick(playerId: string): void;
  onCredits(): void;
  onTutorial(): void;
}

export interface LobbyScreen {
  show(message: LobbyMessage, localId: string): void;
  hide(): void;
  isShown(): boolean;
  setError(text: string): void;
}

const DUNES = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='120' viewBox='0 0 600 120'><path d='M0 120V70Q75 20 150 62T300 60T450 40T600 70V120Z' fill='%23d9b98a'/></svg>\")";
const DUNES_FAR = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='120' viewBox='0 0 800 120'><path d='M0 120V80Q100 30 200 70T400 64T600 50T800 80V120Z' fill='%23ecd3ad'/></svg>\")";
const SILHOUETTE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='50' viewBox='0 0 120 50'><path d='M6 38L10 22Q12 14 22 14H70Q78 14 84 22L100 26Q112 28 114 36V42H6Z' fill='%2335566e'/><circle cx='28' cy='42' r='8' fill='%2335566e'/><circle cx='92' cy='42' r='8' fill='%2335566e'/><circle cx='28' cy='42' r='3' fill='%23cfe6f5'/><circle cx='92' cy='42' r='3' fill='%23cfe6f5'/></svg>\")";

const STYLE = `
#lobby { position: fixed; inset: 0; z-index: 20; display: grid; overflow-x: hidden; overflow-y: auto; background: linear-gradient(#8ec5ea, #cfe6f5 55%, #f6ead2); }
#lobby[hidden] { display: none; }
#lobby-bg { contain: strict; position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.lobby-dunes { will-change: transform; position: absolute; left: 0; bottom: 0; width: 200%; height: 120px; background-repeat: repeat-x; background-position: 0 100%; }
#lobby-dunes-far { background-image: ${DUNES_FAR}; background-size: 800px 120px; height: 140px; opacity: 0.8; animation: lobby-drift-far 160s linear infinite; }
#lobby-dunes-near { background-image: ${DUNES}; background-size: 600px 120px; animation: lobby-drift-near 80s linear infinite; }
#lobby-vehicle-sil { will-change: transform; position: absolute; left: 0; bottom: 52px; width: 120px; height: 50px; background: ${SILHOUETTE} no-repeat center / contain; opacity: 0.6; animation: lobby-cross 28s linear infinite, lobby-bob 0.9s ease-in-out infinite alternate; }
#lobby-layout { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "main" "chat"; gap: 16px; justify-content: center; align-content: center; width: 100%; box-sizing: border-box; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
#lobby-panel { grid-area: main; justify-self: center; display: grid; gap: 12px; width: min(440px, 100%); box-sizing: border-box; padding: 24px; background: rgba(255, 255, 255, 0.94); border-radius: 8px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); animation: lobby-rise 0.45s ease-out both; }
#lobby-chat { grid-area: chat; justify-self: center; width: min(440px, 100%); min-width: 0; box-sizing: border-box; }
#lobby-chat:empty { display: none; }
@media (min-width: 900px) {
  #lobby-layout { grid-template-columns: minmax(320px, 440px) minmax(320px, 440px); grid-template-areas: "main chat"; align-items: start; gap: 24px; }
  #lobby-layout:has(#lobby-chat:empty) { grid-template-columns: minmax(320px, 440px); grid-template-areas: "main"; }
  #lobby-panel, #lobby-chat { justify-self: stretch; width: auto; }
}
#lobby-panel h1 { margin: 0; font-size: 22px; }
#lobby-panel button, #lobby-panel select { min-height: 44px; padding: 8px 12px; font: inherit; border: 1px solid #9ab; border-radius: 6px; transition: background-color 0.2s, opacity 0.2s, border-color 0.2s; }
#lobby-panel button { color: #fff; background: #2f6f9f; border-color: #2f6f9f; cursor: pointer; }
#lobby-panel button:disabled { opacity: 0.5; cursor: default; }
.lobby-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; min-height: 44px; border-radius: 6px; }
#lobby-link { min-width: 0; overflow-wrap: anywhere; }
#lobby-players { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
#lobby-players li { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 0 8px; border-radius: 6px; background: #f1f6fa; transition: opacity 0.35s; }
#lobby-players li.away { opacity: 0.5; }
#lobby-players li.joining { animation: lobby-join 0.4s ease-out both; }
#lobby-players li.pulse { animation: lobby-pulse 0.5s ease-out; }
#lobby-players li.leaving { animation: lobby-leave 0.25s ease-in forwards; }
.lobby-swatch { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.lobby-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.lobby-badge { padding: 2px 8px; border-radius: 999px; color: #fff; background: #c07a14; font-size: 12px; font-weight: 600; text-transform: uppercase; }
#lobby-players li.is-ready .lobby-status { color: #1f7a3d; font-weight: 600; }
.lobby-flash { animation: lobby-flash 0.7s ease-out; }
#lobby-start.go { animation: lobby-go 1s ease-in-out 3; }
#lobby-credits, #lobby-osm { justify-self: center; display: inline-flex; align-items: center; min-height: 44px; }
#lobby-credits { font-size: 14px; color: #2f6f9f; }
#lobby-osm { font-size: 12px; color: #4a5a66; text-align: center; }
#lobby-error { margin: 0; min-height: 1.4em; color: #b3261e; font-size: 14px; }
@keyframes lobby-drift-near { to { transform: translateX(-50%); } }
@keyframes lobby-drift-far { to { transform: translateX(-50%); } }
@keyframes lobby-cross { from { transform: translateX(-160px); } to { transform: translateX(calc(100vw + 40px)); } }
@keyframes lobby-bob { from { margin-bottom: 0; } to { margin-bottom: 3px; } }
@keyframes lobby-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes lobby-join { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes lobby-pulse { 0% { box-shadow: 0 0 0 0 rgba(47, 111, 159, 0.55); } 100% { box-shadow: 0 0 0 10px rgba(47, 111, 159, 0); } }
@keyframes lobby-leave { to { opacity: 0; transform: translateX(24px); } }
@keyframes lobby-flash { 0% { background-color: rgba(255, 214, 102, 0.9); } 100% { background-color: transparent; } }
@keyframes lobby-go { 0%, 100% { box-shadow: 0 0 0 0 rgba(47, 111, 159, 0.6); } 50% { box-shadow: 0 0 0 10px rgba(47, 111, 159, 0); } }
@media (prefers-reduced-motion: reduce) {
  #lobby *, #lobby *::before, #lobby *::after { animation: none !important; transition: none !important; }
  #lobby-vehicle-sil { left: 12%; }
}
`;

const SETTINGS = [
  { key: 'courseId', id: 'lobby-course', label: 'Course', options: () => courseIds().map((id) => ({ value: id, text: id })) },
  { key: 'vehicleId', id: 'lobby-vehicle', label: 'Vehicle', options: () => VEHICLE_IDS.map((id) => ({ value: id, text: vehicleLabel(id) })) },
  { key: 'timeOfDay', id: 'lobby-time', label: 'Time of day', options: () => TIMES_OF_DAY.map((id) => ({ value: id, text: id })) },
  { key: 'weather', id: 'lobby-weather', label: 'Weather', options: () => WEATHERS.map((id) => ({ value: id, text: id })) },
] as const;

export function createLobby(doc: Document, handlers: LobbyHandlers): LobbyScreen {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, id?: string, text?: string) => {
    const element = doc.createElement(tag);
    if (id) element.id = id;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const root = el('div', 'lobby');
  root.hidden = true;
  const style = el('style');
  style.textContent = STYLE;
  const panel = el('div', 'lobby-panel');
  const title = el('h1', undefined, 'Lobby');
  const link = el('span', 'lobby-link');
  const copy = el('button', 'lobby-copy', 'Copy');
  copy.type = 'button';
  const linkRow = el('div');
  linkRow.className = 'lobby-row';
  linkRow.append(link, copy);
  const settingsBox = el('div');
  const players = el('ul', 'lobby-players');
  const ready = el('button', 'lobby-ready', 'Ready');
  ready.type = 'button';
  const start = el('button', 'lobby-start', 'Start');
  start.type = 'button';
  const error = el('p', 'lobby-error');
  error.setAttribute('role', 'alert');
  const credits = el('a', 'lobby-credits', 'Credits');
  credits.href = '/CREDITS.md';
  credits.target = '_blank';
  credits.rel = 'noopener';
  const osm = el('a', 'lobby-osm', OSM_ATTRIBUTION.text);
  osm.href = OSM_ATTRIBUTION.href;
  osm.target = '_blank';
  osm.rel = 'noopener';
  const tutorial = el('button', 'lobby-tutorial', 'Tutorial');
  tutorial.type = 'button';
  panel.append(title, linkRow, settingsBox, players, ready, start, error, tutorial, credits, osm);
  const background = el('div', 'lobby-bg');
  background.setAttribute('aria-hidden', 'true');
  for (const id of ['lobby-dunes-far', 'lobby-dunes-near']) {
    const layer = el('div', id);
    layer.className = 'lobby-dunes';
    background.append(layer);
  }
  background.append(el('div', 'lobby-vehicle-sil'));
  // Another task fills this slot; it stays empty (and hidden by CSS) until then.
  const chat = el('section', 'lobby-chat');
  const layout = el('div', 'lobby-layout');
  layout.append(panel, chat);
  root.append(style, background, layout);
  doc.body.append(root);

  let view: LobbyView | null = null;
  let previous: LobbyView | null = null;
  const cards = new Map<string, PlayerCard>();
  let renderedEditable: boolean | null = null;
  let pending: Partial<RoomSettings> = {};
  let server: RoomSettings | null = null;

  const applySettings = (values: RoomSettings, overrideFocus: boolean) => {
    for (const { key, id, options } of SETTINGS) {
      const element = doc.getElementById(id)!;
      const value = values[key];
      if (element instanceof HTMLSelectElement) {
        if (overrideFocus || doc.activeElement !== element) element.value = value;
      } else element.textContent = options().find((option) => option.value === value)?.text ?? value;
      if (element.dataset.value !== undefined && element.dataset.value !== value) animate(element.parentElement!, 'lobby-flash');
      element.dataset.value = value;
    }
  };
  let room = '';

  const animate = (element: HTMLElement, name: string) => {
    element.classList.remove(name);
    void element.offsetWidth;
    element.classList.add(name);
    element.addEventListener('animationend', () => element.classList.remove(name), { once: true });
  };

  const makeCard = (): PlayerCard => {
    const item = el('li');
    const swatch = el('span');
    swatch.className = 'lobby-swatch';
    const name = el('span');
    name.className = 'lobby-name';
    const status = el('span');
    item.append(swatch, name, status);
    return { item, swatch, name, status, kick: null };
  };
  const syncKick = (card: PlayerCard, entry: LobbyPlayerView) => {
    if (!entry.canKick) {
      card.kick?.remove();
      card.kick = null;
      return;
    }
    if (card.kick) return;
    const kick = el('button', `lobby-kick-${entry.playerId}`, 'Kick');
    kick.type = 'button';
    kick.addEventListener('click', () => {
      error.textContent = '';
      handlers.onKick(entry.playerId);
    });
    card.item.append(kick);
    card.kick = kick;
  };
  const LEAVE_MS = 250;
  const removeCard = (playerId: string) => {
    const card = cards.get(playerId);
    if (!card) return;
    cards.delete(playerId);
    card.item.classList.remove('joining', 'pulse');
    card.item.classList.add('leaving');
    // A rejoining player must not meet a stale duplicate id.
    card.kick?.removeAttribute('id');
    setTimeout(() => card.item.remove(), LEAVE_MS);
  };
  const nextLive = (from: Element | null) => {
    let node = from;
    while (node && node.classList.contains('leaving')) node = node.nextElementSibling;
    return node;
  };

  const current = (): RoomSettings => {
    const values = { ...view!.settings };
    for (const { key, id } of SETTINGS) {
      const select = doc.getElementById(id);
      if (select instanceof HTMLSelectElement) values[key] = select.value as never;
    }
    return values;
  };

  // Selects for the admin and plain text for the others; rebuilt only when the role changes, so an open select keeps its focus.
  const buildSettings = (editable: boolean) => {
    settingsBox.textContent = '';
    pending = {};
    for (const { key, id, label, options } of SETTINGS) {
      const row = el('label');
      row.className = 'lobby-row';
      row.append(el('span', undefined, label));
      if (editable) {
        const select = el('select', id);
        for (const option of options()) select.append(new Option(option.text, option.value));
        select.addEventListener('change', () => {
          error.textContent = '';
          pending = { ...pending, [key]: select.value };
          handlers.onConfigure(current());
        });
        row.append(select);
      } else {
        row.append(el('span', id));
      }
      settingsBox.append(row);
    }
    renderedEditable = editable;
  };

  copy.addEventListener('click', () => {
    const text = `${location.origin}/${room}`;
    const done = () => {
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1500);
    };
    try {
      navigator.clipboard.writeText(text).then(done, () => {});
    } catch {
      // No clipboard in this context; the link stays visible to copy by hand.
    }
  });
  credits.addEventListener('click', (event) => {
    event.preventDefault();
    handlers.onCredits();
  });
  tutorial.addEventListener('click', () => handlers.onTutorial());
  ready.addEventListener('click', () => {
    error.textContent = '';
    handlers.onReady(!view!.localReady);
  });
  start.addEventListener('click', () => {
    error.textContent = '';
    handlers.onStart();
  });

  return {
    show(message, localId) {
      view = lobbyView(message, localId);
      room = message.room;
      link.textContent = `${location.origin}/${message.room}`;
      if (renderedEditable !== view.settingsEditable) buildSettings(view.settingsEditable);
      server = view.settings;
      if (renderedEditable) {
        const merged = mergeSettings(current(), pending, server);
        pending = merged.pending;
        view.settings = merged.settings;
      }
      applySettings(view.settings, false);
      const fresh = new Set(newPlayerIds(previous?.players ?? null, view.players));
      const pulsed = new Set(readyChanged(previous?.players ?? null, view.players));
      const present = new Set(view.players.map((entry) => entry.playerId));
      for (const id of [...cards.keys()]) if (!present.has(id)) removeCard(id);
      let cursor = nextLive(players.firstElementChild);
      for (const entry of view.players) {
        let card = cards.get(entry.playerId);
        if (!card) {
          card = makeCard();
          cards.set(entry.playerId, card);
        }
        card.swatch.style.background = entry.colour;
        card.name.textContent = entry.name;
        card.status.textContent = entry.status;
        card.status.className = entry.isAdmin ? 'lobby-status lobby-badge' : 'lobby-status';
        card.item.classList.toggle('is-ready', entry.status.startsWith('ready'));
        card.item.classList.toggle('away', !entry.connected);
        syncKick(card, entry);
        if (card.item === cursor) cursor = nextLive(cursor.nextElementSibling);
        else players.insertBefore(card.item, cursor);
        if (fresh.has(entry.playerId)) animate(card.item, 'joining');
        else if (pulsed.has(entry.playerId)) animate(card.item, 'pulse');
      }
      ready.hidden = !view.showReady;
      ready.textContent = view.localReady ? 'Not ready' : 'Ready';
      ready.setAttribute('aria-pressed', String(view.localReady));
      start.hidden = !view.showStart;
      start.disabled = !view.startEnabled;
      if (view.startEnabled && !previous?.startEnabled) animate(start, 'go');
      else if (!view.startEnabled) start.classList.remove('go');
      previous = view;
      root.hidden = false;
    },
    hide() {
      pending = {};
      previous = null;
      players.textContent = '';
      cards.clear();
      error.textContent = '';
      root.hidden = true;
    },
    isShown: () => !root.hidden,
    setError(text) {
      // A refusal may be of a change; drop the unconfirmed ones so the next echo restores the server's values.
      pending = {};
      if (server && renderedEditable) applySettings(server, true);
      error.textContent = text;
    },
  };
}
