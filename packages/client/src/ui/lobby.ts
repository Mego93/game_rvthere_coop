import { CHAT_LIMIT, CHAT_FORM_STYLE, createChatForm, renderChatLines, type ChatLine, type SubmitResult } from './chat';
import { CAMPAIGN, CHARACTER_IDS, ROOM_MODES, CHARACTER_NAMES, TIMES_OF_DAY, VEHICLE_IDS, WEATHER_SETTINGS, courseIds, defaultAppearance, getCourseDef, type Appearance, type LobbyMessage, type RoomSettings, type WeatherSetting } from '@lodgy/shared';
import { OPTION_ROWS, createPickerState, optionText, portraitModel } from './characterPicker';
import { dayTitle } from './story/summaryView';

export const VEHICLE_LABELS: Record<string, string> = { lodgy: 'Lodgy', rv: 'RV' };
export const WEATHER_LABELS: Record<WeatherSetting, string> = { clear: 'Clear', rain: 'Rain', sandstorm: 'Sandstorm', random: 'Random' };
export const weatherOptions = () => WEATHER_SETTINGS.map((id) => ({ value: id, text: WEATHER_LABELS[id] }));
// The name a course shows in the lobby: its label, or its id when it has none.
export const courseLabel = (id: string): string => getCourseDef(id)?.label ?? id;
export const courseOptions = () => courseIds().map((id) => ({ value: id, text: courseLabel(id) }));
export const MODE_LABELS: Record<RoomSettings['mode'], string> = { race: 'Race', story: 'Story' };
export const modeOptions = () => ROOM_MODES.map((id) => ({ value: id, text: MODE_LABELS[id] }));
export const CHAIN_LABEL = 'Run all five stages';
// The chain checkbox shows when the selected course is one of the stages.
export const chainShown = (courseId: string): boolean => CAMPAIGN.includes(courseId);
const vehicleLabel = (id: string) => (Object.hasOwn(VEHICLE_LABELS, id) ? VEHICLE_LABELS[id] : id);

export interface LobbyPlayerView {
  playerId: string;
  name: string;
  colour: string;
  // The display name of the character the player has chosen.
  character: string;
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
  // The "Run all five stages" checkbox: shown for a stage, and only the admin can change it.
  showChain: boolean;
  chainEditable: boolean;
  settings: RoomSettings;
  // The Race / Story toggle: shown with ?storytest or once the room is in story mode; only the admin changes it.
  showMode: boolean;
  modeEditable: boolean;
  // The course select and the chain box belong to the race.
  showCourse: boolean;
  story: { dayText: string; finishedText: string } | null;
  showReset: boolean;
  players: LobbyPlayerView[];
  showReady: boolean;
  localReady: boolean;
  showStart: boolean;
  startEnabled: boolean;
  attribution: { text: string; href: string };
}

// One press asks, the next sends; Cancel backs out.
export function nextResetStep(step: 'idle' | 'confirm', event: 'press' | 'confirm' | 'cancel'): { step: 'idle' | 'confirm'; send: boolean } {
  if (step === 'idle') return { step: event === 'press' ? 'confirm' : 'idle', send: false };
  return { step: 'idle', send: event === 'confirm' };
}

export function lobbyView(message: LobbyMessage, localId: string, options: { storyEnabled?: boolean } = {}): LobbyView {
  const isAdmin = message.adminId !== null && message.adminId === localId;
  const players = message.players.map((entry): LobbyPlayerView => {
    const admin = entry.playerId === message.adminId;
    const base = admin ? 'admin' : entry.ready ? 'ready' : 'not ready';
    return {
      playerId: entry.playerId,
      name: entry.name,
      colour: entry.colour,
      character: CHARACTER_NAMES[entry.appearance.characterId],
      isAdmin: admin,
      connected: entry.connected,
      status: entry.connected ? base : `${base} (disconnected)`,
      canKick: isAdmin && entry.playerId !== localId,
    };
  });
  const others = message.players.filter((entry) => entry.playerId !== message.adminId && entry.connected);
  const inStory = message.mode === 'story';
  const finished = message.story?.finishedDays ?? [];
  return {
    isAdmin,
    settingsEditable: isAdmin,
    showMode: options.storyEnabled === true || inStory,
    modeEditable: isAdmin,
    showCourse: !inStory,
    story: inStory && message.story ? { dayText: dayTitle(message.story.day), finishedText: finished.length > 0 ? `Finished days: ${finished.join(', ')}` : 'No days finished yet' } : null,
    showReset: isAdmin && inStory,
    showChain: !inStory && chainShown(message.courseId),
    chainEditable: isAdmin,
    settings: { courseId: message.courseId, vehicleId: message.vehicleId, timeOfDay: message.timeOfDay, weather: message.weather, chain: message.chain, mode: message.mode },
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
    (settings as Record<string, unknown>)[key] = local[key];
    (remaining as Record<string, unknown>)[key] = pending[key]!;
  }
  return { settings, pending: remaining };
}

interface PlayerCard {
  item: HTMLLIElement;
  swatch: HTMLSpanElement;
  name: HTMLSpanElement;
  character: HTMLSpanElement;
  status: HTMLSpanElement;
  kick: HTMLButtonElement | null;
}

export interface LobbyHandlers {
  onReady(ready: boolean): void;
  onConfigure(settings: RoomSettings): void;
  onStart(): void;
  onKick(playerId: string): void;
  // Sends the player's full chosen look; the server answers with the next lobby message or an error.
  onAppearance(appearance: Appearance): void;
  onCredits(): void;
  onTutorial(): void;
  // The Race / Story toggle is offered without being asked for (the page was opened with ?storytest).
  storyEnabled: boolean;
  // The admin confirmed Reset week.
  onResetWeek(): void;
  // Sends a line typed or picked in the lobby chat; says whether it went.
  onChat(text: string): SubmitResult;
}

export interface LobbyScreen {
  show(message: LobbyMessage, localId: string): void;
  hide(): void;
  isShown(): boolean;
  // The reason, when the server gave one, tells a refused look from any other error.
  setError(text: string, reason?: string): void;
  // The chat log to show; called on every new line.
  setChat(lines: readonly ChatLine[]): void;
}

// Scenery is drawn with gradients, so the page carries no images; each layer ends at zero height on the tile's edge so the tiles join.
const DUNES = 'radial-gradient(ellipse 300px 80px at 300px 120px, var(--dune-near) 98%, transparent 100%), radial-gradient(ellipse 200px 48px at 0 120px, var(--dune-near) 98%, transparent 100%), radial-gradient(ellipse 200px 48px at 600px 120px, var(--dune-near) 98%, transparent 100%)';
const DUNES_FAR = 'radial-gradient(ellipse 400px 76px at 400px 140px, var(--dune-far) 98%, transparent 100%), radial-gradient(ellipse 260px 44px at 0 140px, var(--dune-far) 98%, transparent 100%), radial-gradient(ellipse 260px 44px at 800px 140px, var(--dune-far) 98%, transparent 100%)';
const SILHOUETTE = 'radial-gradient(circle at 28px 42px, var(--sky) 0 3px, var(--silhouette) 3.5px 8px, transparent 8.5px), radial-gradient(circle at 92px 42px, var(--sky) 0 3px, var(--silhouette) 3.5px 8px, transparent 8.5px), linear-gradient(var(--silhouette), var(--silhouette)) 24px 12px / 62px 16px no-repeat, linear-gradient(135deg, transparent 0 50%, var(--silhouette) 50%) 16px 12px / 8px 16px no-repeat, linear-gradient(225deg, transparent 0 50%, var(--silhouette) 50%) 86px 12px / 8px 16px no-repeat, linear-gradient(var(--silhouette), var(--silhouette)) 6px 26px / 108px 16px no-repeat';

const STYLE = `${CHAT_FORM_STYLE}
#lobby { position: fixed; inset: 0; z-index: 20; display: grid; overflow-x: hidden; overflow-y: auto; background: linear-gradient(var(--sky-top), var(--sky) 55%, var(--sky-bottom)); }
#lobby[hidden] { display: none; }
#lobby-bg { contain: strict; position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.lobby-dunes { will-change: transform; position: absolute; left: 0; bottom: 0; width: calc(100% + 600px); height: 120px; background-repeat: repeat-x; background-position: 0 100%; }
#lobby-dunes-far { width: calc(100% + 800px); background-image: ${DUNES_FAR}; background-size: 800px 140px; height: 140px; opacity: 0.85; animation: lobby-drift-far 133s linear infinite; }
#lobby-dunes-near { background-image: ${DUNES}; background-size: 600px 120px; animation: lobby-drift-near 67s linear infinite; }
#lobby-vehicle-sil { will-change: transform; position: absolute; left: 0; bottom: 52px; width: 120px; height: 50px; background: ${SILHOUETTE}; opacity: 0.6; animation: lobby-cross 28s linear infinite, lobby-bob 0.9s ease-in-out infinite alternate; }
#lobby-layout { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "main" "chat"; gap: 16px; justify-content: center; align-content: center; width: 100%; box-sizing: border-box; padding: max(16px, var(--safe-top)) max(16px, var(--safe-right)) max(16px, var(--safe-bottom)) max(16px, var(--safe-left)); }
#lobby-panel { grid-area: main; justify-self: center; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; width: min(440px, 100%); padding: 18px; animation: lobby-rise 0.45s var(--ease) both; }
#lobby-chat { grid-area: chat; justify-self: center; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; width: min(440px, 100%); min-width: 0; padding: 14px 16px 16px; animation: lobby-rise 0.45s var(--ease) both; }
#lobby-chat h2 { margin: 0; font-size: 20px; color: var(--teal); }
#lobby-chat .chat-form { grid-template-columns: minmax(0, 1fr); }
#lobby-chat .chat-lines { display: flex; flex-direction: column; height: 220px; padding: 6px 10px; background: var(--paper); border-radius: var(--radius-ctl); color: var(--ink); }
#lobby-chat .chat-line:first-child { margin-top: auto; }
#lobby-chat .chat-lines:empty::before { content: 'No messages yet'; color: var(--ink-soft); }
@media (max-width: 360px) { #lobby-panel { padding: 12px; } #lobby-chat { padding: 12px; } }
@media (min-width: 900px) {
  #lobby-layout { grid-template-columns: minmax(320px, 440px) minmax(320px, 440px); grid-template-areas: "main chat"; align-items: start; gap: 24px; }
  #lobby-panel, #lobby-chat { justify-self: stretch; width: auto; }
}
#lobby-panel h1 { margin: 0; font-size: 28px; line-height: 1.1; color: var(--teal); }
#lobby-panel select { width: auto; max-width: 60%; cursor: pointer; }
.lobby-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; min-height: 44px; border-radius: var(--radius-ctl); }
.lobby-chain { justify-content: flex-start; cursor: pointer; font-weight: 600; }
.lobby-chain[hidden] { display: none; }
.lobby-chain input { width: 22px; height: 22px; flex: none; accent-color: var(--terracotta); }
#lobby-link { min-width: 0; overflow-wrap: anywhere; font-weight: 600; color: var(--info); }
#lobby-players { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
#lobby-players li { display: flex; flex-wrap: wrap; gap: 0 8px; align-items: center; min-height: 44px; padding: 0 10px; border-radius: var(--radius-ctl); background: var(--paper); transition: opacity 0.35s; }
#lobby-players li.away { opacity: 0.5; }
#lobby-players .ui-btn { min-height: 44px; padding: 4px 12px; font-size: 14px; }
.lobby-status { white-space: nowrap; color: var(--ink-soft); font-size: 13px; }
.lobby-char { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-soft); font-size: 13px; }
#lobby-picker { display: grid; gap: 8px; min-width: 0; }
#lobby-picker[hidden] { display: none; }
#lobby-picker h2 { margin: 0; font-size: 18px; color: var(--teal); }
#lobby-picker-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
#lobby-panel .pick-card, #lobby-panel .pick-seg { min-height: 44px; font: inherit; border-radius: var(--radius-ctl); cursor: pointer; transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease), opacity var(--dur) var(--ease); }
#lobby-panel .pick-card { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 6px; align-items: center; min-width: 0; padding: 4px 6px; color: var(--ink); background: var(--paper); border: 2px solid var(--sand-deep); text-align: left; line-height: 1.15; }
#lobby-panel .pick-card.own { border-color: var(--teal); background: var(--sand-deep); }
#lobby-panel .pick-card.taken { opacity: 0.6; cursor: default; }
.pick-text { display: grid; min-width: 0; }
.pick-name { font-weight: 600; overflow-wrap: break-word; }
.pick-sub { font-size: 12px; color: var(--ink-soft); overflow-wrap: anywhere; }
.pick-group { display: grid; gap: 4px; }
.pick-group-label { font-size: 13px; font-weight: 600; color: var(--ink-soft); }
.pick-segments { display: flex; gap: 4px; }
#lobby-panel .pick-seg { flex: 1 1 0; min-width: 0; padding: 4px 2px; font-size: 13px; color: var(--ink); background: var(--paper); border: 2px solid var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#lobby-panel .pick-seg[aria-pressed='true'] { color: var(--white); background: var(--teal); border-color: var(--teal); }
#lobby-panel .pick-seg.swatch { min-width: 44px; background: var(--swatch); border-color: var(--ink-soft); color: transparent; }
#lobby-panel .pick-seg.swatch[aria-pressed='true'] { background: var(--swatch); border-color: var(--ink); outline: 3px solid var(--teal); outline-offset: -5px; }
#lobby-panel .pick-seg.swatch:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
#lobby-picker-note { margin: 0; min-height: 1.2em; color: var(--danger); font-size: 14px; font-weight: 500; }
.pt { position: relative; width: 44px; height: 56px; flex: none; overflow: hidden; }
.pt > * { position: absolute; display: none; }
.pt-legs { display: block; left: 12px; bottom: 0; width: 20px; height: 8px; background: var(--trousers); }
.pt-body { display: block; left: 5px; bottom: 6px; width: 34px; height: 24px; border-radius: 9px 9px 2px 2px; background: var(--top); }
.pt-stripe { left: 20px; bottom: 6px; width: 4px; height: 20px; background: var(--stripe); }
.pt[data-top='own'][data-stripe='yes'] .pt-stripe { display: block; }
.pt-under { left: 16px; bottom: 24px; width: 12px; height: 7px; border-radius: 0 0 6px 6px; background: var(--under); }
.pt[data-top='own'][data-under='yes'] .pt-under, .pt[data-top='suit'] .pt-under { display: block; }
.pt[data-top='suit'] .pt-under { background: var(--portrait-white); }
.pt-tie { left: 21px; bottom: 8px; width: 3px; height: 17px; background: var(--portrait-tie); }
.pt[data-top='suit'] .pt-tie { display: block; }
.pt { isolation: isolate; }
.pt-head { display: block; left: 11px; bottom: 26px; width: 22px; height: 22px; border-radius: 50%; background: var(--skin, var(--portrait-skin)); }
.pt-eyes { display: block; left: 15px; bottom: 38px; width: 14px; height: 4px; }
.pt-eyes::before, .pt-eyes::after { content: ''; position: absolute; top: 0; width: 3px; height: 3px; background: var(--portrait-eye); }
.pt-eyes::before { left: 0; }
.pt-eyes::after { right: 0; }
.pt[data-eyes='wide'] .pt-eyes::before, .pt[data-eyes='wide'] .pt-eyes::after { top: -1px; width: 5px; height: 5px; border-radius: 50%; background: var(--portrait-white); box-shadow: inset 0 0 0 1.5px var(--portrait-eye); }
.pt[data-eyes='sleepy'] .pt-eyes::before, .pt[data-eyes='sleepy'] .pt-eyes::after { top: 2px; width: 4px; height: 1.5px; }
.pt[data-eyes='happy'] .pt-eyes::before, .pt[data-eyes='happy'] .pt-eyes::after { top: 0; width: 4px; height: 3px; background: transparent; border-top: 2px solid var(--portrait-eye); border-radius: 50% 50% 0 0; }
.pt-smile { display: block; left: 17px; bottom: 30px; width: 10px; height: 3px; border-bottom: 2px solid var(--portrait-mouth); border-radius: 0 0 6px 6px; }
.pt[data-smile='grin'] .pt-smile { left: 15px; width: 14px; height: 4px; border-bottom: 0; background: var(--portrait-mouth); box-shadow: inset 0 1.5px 0 var(--portrait-white); }
.pt[data-smile='neutral'] .pt-smile { height: 2px; border-bottom: 0; border-radius: 1px; background: var(--portrait-mouth); }
.pt-hair { left: 10px; bottom: 38px; width: 24px; height: 11px; border-radius: 12px 12px 3px 3px; background: var(--hair); }
.pt:not([data-hair='bald']) .pt-hair { display: block; }
.pt[data-hair='wavy'] .pt-hair { left: 8px; width: 28px; height: 13px; bottom: 37px; border-radius: 10px; }
.pt[data-hair='swept'] .pt-hair { height: 10px; border-radius: 12px 4px 3px 10px; }
.pt[data-hair='long'] .pt-hair { height: 24px; bottom: 25px; border-radius: 12px 12px 4px 4px; z-index: -1; }
.pt-mou { left: 16px; bottom: 34px; width: 12px; height: 2px; border-radius: 2px; background: var(--hair); }
.pt[data-facial='moustache'] .pt-mou { display: block; }
.pt-beard { left: 14px; bottom: 26px; width: 16px; height: 4px; border-radius: 2px 2px 8px 8px; background: var(--hair); }
.pt[data-facial='beard'] .pt-beard { display: block; }
.pt-glasses { left: 13px; bottom: 37px; width: 18px; height: 7px; }
.pt[data-glasses='round'] .pt-glasses { display: block; }
.pt-glasses::before, .pt-glasses::after { content: ''; position: absolute; top: 0; width: 6px; height: 6px; border: 1.5px solid var(--portrait-frame); border-radius: 50%; }
.pt-glasses::before { left: 0; }
.pt-glasses::after { right: 0; }
.pt-hat { left: 9px; bottom: 46px; width: 26px; height: 7px; border-radius: 6px 6px 1px 1px; background: var(--portrait-cap); }
.pt[data-hat='cap'] .pt-hat { display: block; }
.pt[data-hat='fez'] .pt-hat { display: block; left: 12px; width: 20px; height: 9px; border-radius: 2px; background: var(--portrait-fez); }
#lobby-players li.joining { animation: lobby-join 0.4s var(--ease) both; }
#lobby-players li.pulse { animation: lobby-pulse 0.5s var(--ease); }
#lobby-players li.leaving { animation: lobby-leave 0.25s ease-in forwards; pointer-events: none; }
.lobby-swatch { width: 14px; height: 14px; border: 2px solid var(--ink); border-radius: 50%; flex: none; box-sizing: border-box; }
.lobby-name { flex: 1 1 72px; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.lobby-badge { padding: 2px 10px; border-radius: 999px; color: var(--ink); background: var(--saffron); font-size: 12px; font-weight: 700; text-transform: uppercase; }
#lobby-players li.is-ready .lobby-status { color: var(--ok); font-weight: 700; }
.lobby-flash { animation: lobby-flash 0.7s ease-out; }
#lobby-start.go { animation: lobby-go 1s ease-in-out 3; }
#lobby-credits, #lobby-osm { justify-self: center; display: inline-flex; align-items: center; min-height: 44px; }
#lobby-credits { font-size: 14px; font-weight: 600; color: var(--info); }
#lobby-osm { font-size: 12px; color: var(--ink-soft); text-align: center; }
#lobby-story { display: grid; gap: 4px; padding: 8px 10px; border-radius: var(--radius-ctl); background: var(--paper); }
#lobby-story[hidden] { display: none; }
.lobby-story-line { margin: 0; font-weight: 600; }
#lobby-reset-row[hidden], .lobby-row[hidden] { display: none; }
#lobby-reset-row .ui-btn { flex: 1 1 0; }
#lobby-error { margin: 0; min-height: 1.4em; color: var(--danger); font-size: 14px; font-weight: 600; }
@keyframes lobby-drift-near { to { transform: translateX(-600px); } }
@keyframes lobby-drift-far { to { transform: translateX(-800px); } }
@keyframes lobby-cross { from { transform: translateX(-160px); } to { transform: translateX(calc(100vw + 40px)); } }
@keyframes lobby-bob { from { translate: 0 0; } to { translate: 0 -3px; } }
@keyframes lobby-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes lobby-join { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
#lobby.starting .lobby-dunes, #lobby.starting #lobby-vehicle-sil, #lobby.starting #lobby-start { animation-play-state: paused; }
@keyframes lobby-pulse { 0% { box-shadow: 0 0 0 0 var(--pulse-a); } 100% { box-shadow: 0 0 0 10px var(--pulse-b); } }
@keyframes lobby-leave { to { opacity: 0; transform: translateX(24px); } }
@keyframes lobby-flash { 0% { background-color: var(--flash); } 100% { background-color: transparent; } }
@keyframes lobby-go { 0%, 100% { box-shadow: 0 3px 0 var(--ink), 0 0 0 0 var(--go-glow); } 50% { box-shadow: 0 3px 0 var(--ink), 0 0 0 10px var(--go-glow-off); } }
@media (prefers-reduced-motion: reduce) {
  #lobby *, #lobby *::before, #lobby *::after { animation: none !important; transition: none !important; }
  #lobby-vehicle-sil { left: 12%; }
  #lobby-players li.leaving { display: none; }
}
`;

const SETTINGS = [
  { key: 'mode', id: 'lobby-mode', label: 'Mode', options: modeOptions },
  { key: 'courseId', id: 'lobby-course', label: 'Course', options: courseOptions },
  { key: 'vehicleId', id: 'lobby-vehicle', label: 'Vehicle', options: () => VEHICLE_IDS.map((id) => ({ value: id, text: vehicleLabel(id) })) },
  { key: 'timeOfDay', id: 'lobby-time', label: 'Time of day', options: () => TIMES_OF_DAY.map((id) => ({ value: id, text: id })) },
  { key: 'weather', id: 'lobby-weather', label: 'Weather', options: weatherOptions },
] as const;

// A flat portrait of a character in CSS shapes, from portraitModel.
function paintPortrait(portrait: HTMLElement, appearance: Appearance, withAddOns: boolean) {
  const model = portraitModel(appearance, withAddOns);
  const data = portrait.dataset;
  data.top = model.top;
  data.hair = model.hair;
  data.facial = model.facial;
  data.glasses = model.glasses;
  data.hat = model.hat;
  data.under = model.under ? 'yes' : 'no';
  data.stripe = model.stripe ? 'yes' : 'no';
  data.eyes = model.eyes;
  data.smile = model.smile;
  const style = portrait.style;
  style.setProperty('--top', model.topColour);
  style.setProperty('--trousers', model.trousers);
  style.setProperty('--hair', model.hairColour);
  style.setProperty('--under', model.underColour);
  style.setProperty('--stripe', model.stripeColour);
  style.setProperty('--skin', model.skin);
}

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
  panel.className = 'ui-panel';
  const title = el('h1', undefined, 'Lobby');
  const link = el('span', 'lobby-link');
  const copy = el('button', 'lobby-copy', 'Copy');
  copy.className = 'ui-btn';
  copy.type = 'button';
  const linkRow = el('div');
  linkRow.className = 'lobby-row';
  linkRow.append(link, copy);
  const settingsBox = el('div');
  const storyBox = el('section', 'lobby-story');
  storyBox.hidden = true;
  const storyDay = el('p', 'lobby-story-day');
  storyDay.className = 'lobby-story-line';
  const storyFinished = el('p', 'lobby-story-finished');
  storyFinished.className = 'lobby-story-line';
  const resetRow = el('div', 'lobby-reset-row');
  resetRow.className = 'lobby-row';
  const reset = el('button', 'lobby-reset-week', 'Reset week');
  reset.className = 'ui-btn';
  reset.type = 'button';
  const resetConfirm = el('button', 'lobby-reset-confirm', 'Yes, reset it');
  resetConfirm.className = 'ui-btn ui-btn-primary';
  resetConfirm.type = 'button';
  const resetCancel = el('button', 'lobby-reset-cancel', 'Cancel');
  resetCancel.className = 'ui-btn';
  resetCancel.type = 'button';
  resetConfirm.hidden = true;
  resetCancel.hidden = true;
  resetRow.append(reset, resetConfirm, resetCancel);
  storyBox.append(storyDay, storyFinished, resetRow);
  const players = el('ul', 'lobby-players');
  const picker = el('section', 'lobby-picker');
  picker.hidden = true;
  const cardsBox = el('div', 'lobby-picker-cards');
  const note = el('p', 'lobby-picker-note');
  note.setAttribute('role', 'status');
  const ready = el('button', 'lobby-ready', 'Ready');
  ready.className = 'ui-btn';
  ready.type = 'button';
  const start = el('button', 'lobby-start', 'Start');
  start.className = 'ui-btn ui-btn-primary';
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
  tutorial.className = 'ui-btn';
  tutorial.type = 'button';
  panel.append(title, linkRow, settingsBox, storyBox, players, picker, ready, start, error, tutorial, credits, osm);
  const background = el('div', 'lobby-bg');
  background.setAttribute('aria-hidden', 'true');
  for (const id of ['lobby-dunes-far', 'lobby-dunes-near']) {
    const layer = el('div', id);
    layer.className = 'lobby-dunes';
    background.append(layer);
  }
  background.append(el('div', 'lobby-vehicle-sil'));
  const chat = el('section', 'lobby-chat');
  chat.className = 'ui-panel';
  const chatTitle = el('h2', undefined, 'Chat');
  const chatLines = el('div', 'lobby-chat-lines');
  chatLines.className = 'chat-lines';
  const chatForm = createChatForm(doc, (text) => handlers.onChat(text));
  chatForm.input.id = 'lobby-chat-input';
  // The keyboard of a phone covers the lower page; bring the input up once it has opened.
  chatForm.input.addEventListener('focus', () => setTimeout(() => chatForm.element.scrollIntoView?.({ block: 'nearest' }), 300));
  chat.append(chatTitle, chatLines, chatForm.element);
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
  let lastMessage: LobbyMessage | null = null;
  let localId = '';
  const pickerState = createPickerState();
  const pickCards = new Map<string, { button: HTMLButtonElement; portrait: HTMLElement; sub: HTMLElement }>();
  const pickSegments = new Map<string, HTMLButtonElement>();

  const applySettings = (values: RoomSettings, overrideFocus: boolean) => {
    for (const { key, id, options } of SETTINGS) {
      const element = doc.getElementById(id)!;
      const value = values[key];
      if (element instanceof HTMLSelectElement) {
        if (overrideFocus || doc.activeElement !== element) element.value = value;
      } else element.textContent = options().find((option) => option.value === value)?.text ?? value;
      if (element instanceof HTMLSelectElement && !overrideFocus && doc.activeElement === element) continue;
      if (element.dataset.value !== undefined && element.dataset.value !== value) animate(element.parentElement!, 'lobby-flash');
      element.dataset.value = value;
    }
    applyChain(values, renderedEditable === true);
    applyRows();
  };
  // The mode row shows with ?storytest or in a story room; the course belongs to the race.
  const applyRows = () => {
    if (!view) return;
    const rowOf = (id: string) => doc.getElementById(id)?.parentElement;
    const modeRow = rowOf('lobby-mode');
    if (modeRow) modeRow.hidden = !view.showMode;
    const courseRow = rowOf('lobby-course');
    if (courseRow) courseRow.hidden = !view.showCourse;
    if (chainRow && !view.showCourse) chainRow.hidden = true;
  };
  let room = '';
  let chainRow: HTMLElement | null = null;
  let chainBox: HTMLInputElement | null = null;
  const applyChain = (values: RoomSettings, editable: boolean) => {
    if (!chainRow || !chainBox) return;
    chainRow.hidden = !chainShown(values.courseId) || values.mode === 'story';
    chainBox.checked = values.chain && chainShown(values.courseId);
    chainBox.disabled = !editable;
  };

  const reducedMotion = () => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const animate = (element: HTMLElement, name: string) => {
    if (reducedMotion()) return;
    element.classList.remove(name);
    void element.offsetWidth;
    element.classList.add(name);
    element.addEventListener('animationend', () => element.classList.remove(name), { once: true });
  };

  const portraitFor = () => {
    const portrait = el('span');
    portrait.className = 'pt';
    portrait.setAttribute('aria-hidden', 'true');
    for (const name of ['legs', 'body', 'stripe', 'under', 'tie', 'head', 'eyes', 'smile', 'hair', 'mou', 'beard', 'glasses', 'hat']) {
      const part = el('i');
      part.className = `pt-${name}`;
      portrait.append(part);
    }
    return portrait;
  };

  const choose = (change: Partial<Appearance>) => {
    if (!lastMessage) return;
    const next = pickerState.choose(lastMessage, localId, change);
    if (!next) return;
    error.textContent = '';
    renderPicker();
    handlers.onAppearance(next);
  };

  const buildPicker = () => {
    const heading = el('h2', undefined, 'Your character');
    cardsBox.setAttribute('role', 'group');
    cardsBox.setAttribute('aria-label', 'Your character');
    picker.append(heading, cardsBox);
    for (const characterId of CHARACTER_IDS) {
      const button = el('button', `lobby-pick-${characterId}`);
      button.type = 'button';
      button.className = 'pick-card';
      const portrait = portraitFor();
      const text = el('span');
      text.className = 'pick-text';
      const name = el('span', undefined, CHARACTER_NAMES[characterId]);
      name.className = 'pick-name';
      const sub = el('span');
      sub.className = 'pick-sub';
      text.append(name, sub);
      button.append(portrait, text);
      button.addEventListener('click', () => choose({ characterId }));
      cardsBox.append(button);
      pickCards.set(characterId, { button, portrait, sub });
    }
    for (const { key, label, choices, swatches } of OPTION_ROWS) {
      const group = el('div');
      group.className = 'pick-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      const caption = el('span', undefined, label);
      caption.className = 'pick-group-label';
      const segments = el('div');
      segments.className = 'pick-segments';
      choices.forEach((choice, index) => {
        const button = el('button', `lobby-pick-${key}-${choice}`, optionText(choice));
        button.type = 'button';
        button.className = 'pick-seg';
        button.title = optionText(choice);
        if (swatches) {
          button.classList.add('swatch');
          button.style.setProperty('--swatch', swatches[index]!);
          button.setAttribute('aria-label', `${label}: ${optionText(choice)}`);
        }
        button.addEventListener('click', () => choose({ [key]: choice }));
        segments.append(button);
        pickSegments.set(`${key}:${choice}`, button);
      });
      group.append(caption, segments);
      picker.append(group);
    }
    picker.append(note);
  };
  buildPicker();

  const renderPicker = () => {
    const shown = lastMessage ? pickerState.view(lastMessage, localId) : null;
    note.textContent = pickerState.note;
    picker.hidden = !shown;
    if (!shown) return;
    for (const card of shown.cards) {
      const parts = pickCards.get(card.characterId)!;
      const own = card.state === 'own';
      parts.button.classList.toggle('own', own);
      parts.button.classList.toggle('taken', card.state === 'taken');
      parts.button.setAttribute('aria-disabled', String(card.state === 'taken'));
      parts.button.setAttribute('aria-label', card.state === 'taken' ? `${card.name}, taken by ${card.holderName}${card.away ? ' (away)' : ''}` : card.name);
      parts.button.setAttribute('aria-pressed', String(own));
      parts.sub.textContent = own ? 'You' : card.state === 'taken' ? `${card.holderName}${card.away ? ' (away)' : ''}` : 'Free';
      paintPortrait(parts.portrait, own ? shown.appearance : defaultAppearance(card.characterId), own);
    }
    for (const { key, choices } of OPTION_ROWS) for (const choice of choices) pickSegments.get(`${key}:${choice}`)!.setAttribute('aria-pressed', String(shown.appearance[key] === choice));
  };

  const makeCard = (): PlayerCard => {
    const item = el('li');
    const swatch = el('span');
    swatch.className = 'lobby-swatch';
    const name = el('span');
    name.className = 'lobby-name';
    const character = el('span');
    character.className = 'lobby-char';
    const status = el('span');
    item.append(swatch, name, character, status);
    return { item, swatch, name, character, status, kick: null };
  };
  const syncKick = (card: PlayerCard, entry: LobbyPlayerView) => {
    if (!entry.canKick) {
      card.kick?.remove();
      card.kick = null;
      return;
    }
    if (card.kick) return;
    const kick = el('button', `lobby-kick-${entry.playerId}`, 'Kick');
    kick.className = 'ui-btn';
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
    if (chainBox) values.chain = chainBox.checked && chainShown(values.courseId);
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
        select.className = 'ui-input';
        for (const option of options()) select.append(new Option(option.text, option.value));
        select.addEventListener('change', () => {
          error.textContent = '';
          select.dataset.value = select.value;
          pending = { ...pending, [key]: select.value };
          if (chainBox && key === 'courseId') applyChain(current(), true);
          handlers.onConfigure(current());
        });
        row.append(select);
      } else {
        row.append(el('span', id));
      }
      settingsBox.append(row);
    }
    chainRow = el('label', 'lobby-chain-row');
    chainRow.className = 'lobby-row lobby-chain';
    chainBox = el('input', 'lobby-chain');
    chainBox.type = 'checkbox';
    chainBox.disabled = !editable;
    chainBox.addEventListener('change', () => {
      error.textContent = '';
      pending = { ...pending, chain: chainBox!.checked };
      handlers.onConfigure(current());
    });
    chainRow.append(chainBox, el('span', undefined, CHAIN_LABEL));
    settingsBox.append(chainRow);
    renderedEditable = editable;
  };

  let resetStep: 'idle' | 'confirm' = 'idle';
  function setResetStep(step: 'idle' | 'confirm') {
    resetStep = step;
    reset.hidden = step === 'confirm';
    resetConfirm.hidden = step === 'idle';
    resetCancel.hidden = step === 'idle';
  }
  for (const [button, event] of [[reset, 'press'], [resetConfirm, 'confirm'], [resetCancel, 'cancel']] as const) {
    button.addEventListener('click', () => {
      const next = nextResetStep(resetStep, event);
      setResetStep(next.step);
      if (next.send) handlers.onResetWeek();
    });
  }

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
    // The run is being built; the scenery stops moving until the lobby shows again.
    root.className = 'starting';
    handlers.onStart();
  });

  return {
    show(message, id) {
      root.className = '';
      view = lobbyView(message, id, { storyEnabled: handlers.storyEnabled });
      lastMessage = message;
      localId = id;
      renderPicker();
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
      storyBox.hidden = view.story === null;
      if (view.story) {
        storyDay.textContent = view.story.dayText;
        storyFinished.textContent = view.story.finishedText;
      }
      resetRow.hidden = !view.showReset;
      if (!view.showReset) setResetStep('idle');
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
        card.character.textContent = entry.character;
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
      if (view.startEnabled && previous && !previous.startEnabled) animate(start, 'go');
      else if (!view.startEnabled) start.classList.remove('go');
      previous = view;
      root.hidden = false;
    },
    hide() {
      pending = {};
      pickerState.reset();
      lastMessage = null;
      note.textContent = '';
      previous = null;
      for (const { id } of SETTINGS) delete doc.getElementById(id)?.dataset.value;
      players.textContent = '';
      cards.clear();
      error.textContent = '';
      root.hidden = true;
    },
    isShown: () => !root.hidden,
    setChat: (lines) => renderChatLines(doc, chatLines, lines.slice(-CHAT_LIMIT)),
    setError(text, reason) {
      // A refusal may be of a change; drop the unconfirmed settings so the next echo restores the server's values.
      pending = {};
      if (server && renderedEditable) applySettings(server, true);
      const refusedLook = pickerState.error(reason, text);
      if (refusedLook) renderPicker();
      error.textContent = refusedLook && reason === 'character_taken' ? '' : text;
    },
  };
}
