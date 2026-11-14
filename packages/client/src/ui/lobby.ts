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

export interface LobbyView {
  isAdmin: boolean;
  settingsEditable: boolean;
  settings: RoomSettings;
  players: LobbyPlayerView[];
  showReady: boolean;
  localReady: boolean;
  showStart: boolean;
  startEnabled: boolean;
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
  };
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

export interface LobbyHandlers {
  onReady(ready: boolean): void;
  onConfigure(settings: RoomSettings): void;
  onStart(): void;
  onKick(playerId: string): void;
}

export interface LobbyScreen {
  show(message: LobbyMessage, localId: string): void;
  hide(): void;
  isShown(): boolean;
  setError(text: string): void;
}

const STYLE = `
#lobby { position: fixed; inset: 0; z-index: 20; display: grid; overflow-y: auto; background: #cfe6f5; }
#lobby[hidden] { display: none; }
#lobby-panel { display: grid; gap: 12px; width: min(420px, 90vw); margin: auto; padding: 24px; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); }
#lobby-panel h1 { margin: 0; font-size: 22px; }
#lobby-panel button, #lobby-panel select { padding: 8px 10px; font: inherit; border: 1px solid #9ab; border-radius: 6px; }
#lobby-panel button { color: #fff; background: #2f6f9f; border-color: #2f6f9f; }
#lobby-panel button:disabled { opacity: 0.5; }
.lobby-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
#lobby-players { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
#lobby-players li { display: flex; gap: 8px; align-items: center; }
.lobby-swatch { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.lobby-name { flex: 1; }
#lobby-error { margin: 0; min-height: 1.4em; color: #b3261e; font-size: 14px; }
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
  panel.append(title, linkRow, settingsBox, players, ready, start, error);
  root.append(style, panel);
  doc.body.append(root);

  let view: LobbyView | null = null;
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
    }
  };
  let room = '';

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
      players.textContent = '';
      for (const entry of view.players) {
        const item = el('li');
        const swatch = el('span');
        swatch.className = 'lobby-swatch';
        swatch.style.background = entry.colour;
        const name = el('span', undefined, entry.name);
        name.className = 'lobby-name';
        item.append(swatch, name, el('span', undefined, entry.status));
        if (entry.canKick) {
          const kick = el('button', `lobby-kick-${entry.playerId}`, 'Kick');
          kick.type = 'button';
          kick.addEventListener('click', () => {
            error.textContent = '';
            handlers.onKick(entry.playerId);
          });
          item.append(kick);
        }
        players.append(item);
      }
      ready.hidden = !view.showReady;
      ready.textContent = view.localReady ? 'Not ready' : 'Ready';
      ready.setAttribute('aria-pressed', String(view.localReady));
      start.hidden = !view.showStart;
      start.disabled = !view.startEnabled;
      root.hidden = false;
    },
    hide() {
      pending = {};
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
