import type { ResultsMessage } from '@lodgy/shared';
import { type ChatLine, type ChatPanel } from './chat';
import type { ControlsPanel } from './controls';
import type { EmoteWheel } from './emoteWheel';
import { createHud, type HudMarker } from './hud/hud';
import type { HudModel } from './hud/hudModel';
import type { ResultsScreen } from './results';
import { createRunMenu } from './runMenu';
import { createShopMenu } from './shopMenu';
import type { Tutorial } from './tutorial';
import { createTouchUi } from './touchUi';
import type { TouchView } from './touchView';

export type HudTestMode = 'hud' | 'drive' | 'menu' | 'shop' | 'results' | 'help' | 'chat' | 'emote' | 'tutorial';

const MODES: readonly HudTestMode[] = ['hud', 'drive', 'menu', 'shop', 'results', 'help', 'chat', 'emote', 'tutorial'];

// ?hudtest shows the HUD on a fixed sample for the layout check and the screenshots; ?hudtest=menu (and the others) also opens that panel.
export function hudTestMode(search: string): HudTestMode | null {
  const params = new URLSearchParams(search);
  if (!params.has('hudtest')) return null;
  const value = params.get('hudtest') as HudTestMode;
  return MODES.includes(value) ? value : 'hud';
}

const ROUTE: [number, number][] = [[0, 0], [40, -20], [80, -10], [120, -60], [150, -120], [140, -180], [100, -220]];

export const sampleModel = (touch: boolean): HudModel => ({
  heading: 0,
  compass: { marker: 0.62, label: '1.2 km', side: 0 },
  vehicle: { fuel: 0.15, health: 0.62, fuelLow: true, healthLow: false },
  timer: '1:23',
  wallet: 120,
  ownHealth: 55,
  ownSeat: { id: 'driver', label: 'Driver' },
  slots: [
    { kind: 'jerrycan', label: 'Fuel', selected: true },
    { kind: 'toolbox', label: 'Tools', selected: false },
    { kind: 'healthKit', label: 'Heal', selected: false },
  ],
  prompt: touch ? 'Act to board   Hold Use to refuel' : 'E to board   Hold F to refuel',
  canReset: true,
  hold: 0.4,
  downedSelf: 7,
  downedOthers: [],
  mapEntities: [
    { id: 'vehicle', kind: 'vehicle', x: 40, z: -20 },
    { id: 'me', kind: 'self', x: 36, z: -16, yaw: 0.6 },
    { id: 'p2', kind: 'player', x: 50, z: -22 },
    { id: 'fuel', kind: 'stop', x: 80, z: -10, stopKind: 'fuel' },
    { id: 'garage', kind: 'stop', x: 120, z: -60, stopKind: 'garage' },
    { id: 'jerry', kind: 'item', x: 30, z: -10, itemKind: 'jerrycan' },
    { id: 'tool', kind: 'item', x: 60, z: -30, itemKind: 'toolbox' },
    { id: 'cp1', kind: 'checkpoint', x: 80, z: -10, reached: true },
    { id: 'cp2', kind: 'checkpoint', x: 150, z: -120, reached: false },
  ],
});

export const sampleTouchView = (driving: boolean): TouchView =>
  driving
    ? { seated: true, useVisible: false, reelVisible: true, resetVisible: true, sprintVisible: false, slots: ['jerrycan', 'toolbox', 'healthKit'], selected: 0 }
    : { seated: false, useVisible: true, reelVisible: true, resetVisible: true, sprintVisible: true, slots: ['jerrycan', 'toolbox', 'healthKit'], selected: 0 };

const SAMPLE_CHAT: ChatLine[] = [
  { id: 1, playerId: 'p2', name: 'Badr', text: 'Left at the fork!', at: 0, own: false, receivedAt: 0 },
  { id: 2, playerId: 'p1', name: 'Amal', text: 'On my way', at: 1, own: true, receivedAt: 0 },
  { id: 3, playerId: 'p3', name: 'Chams', text: 'Need fuel', at: 2, own: false, receivedAt: 0 },
];

const SAMPLE_RESULTS: ResultsMessage = {
  type: 'results',
  courseId: 'medina',
  vehicleId: 'lodgy',
  timeOfDay: 'midday',
  weather: 'clear',
  elapsed: 312.4,
  restarts: 1,
  respawns: 2,
  wallet: 120,
  coinsCollected: 14,
  coinsTotal: 20,
  finalTime: 327.4,
  stars: [true, true, false],
  assisted: false,
};

export interface HudTestParts {
  touch: boolean;
  chatPanel: ChatPanel;
  emoteWheel: EmoteWheel;
  helpPanel: ControlsPanel;
  tutorial: Tutorial;
  results: ResultsScreen;
}

export function startHudTest(mode: HudTestMode, parts: HudTestParts): void {
  const doc = document;
  const still = doc.createElement('style');
  // The chat toasts fade after a few seconds; the sample stays put for the measurements and the screenshots.
  still.textContent = '.chat-toast, .ui-toast, #chat-panel, #emote-ring, #results-panel { animation: none !important; }';
  doc.body.append(still);

  const hudRoot = doc.createElement('div');
  doc.body.append(hudRoot);
  const hud = createHud(hudRoot, { touch: parts.touch, route: ROUTE, finish: { x: 100, z: -220 } });
  const markers: HudMarker[] = [];
  hud.update(sampleModel(parts.touch), markers, 'You are the Driver');

  if (parts.touch) {
    const root = doc.createElement('div');
    doc.body.append(root);
    const touchUi = createTouchUi(root);
    touchUi.setVisible(true);
    touchUi.update(sampleTouchView(mode === 'drive'));
  }

  parts.chatPanel.setToastsAllowed(true);
  parts.chatPanel.setToasts(SAMPLE_CHAT);

  if (mode === 'menu') {
    const menu = createRunMenu(doc, { onResume() {}, onRestartCheckpoint() {}, onRestartCourse() {}, onToLobby() {}, onSkip() {}, onRefill() {}, onKick() {}, onMute() {}, onHelp() {}, onTutorial() {} });
    menu.update(true, [{ playerId: 'p2', name: 'Badr' }]);
    menu.setOpen(true);
  } else if (mode === 'shop') {
    const shop = createShopMenu(doc, { onBuy() {}, onClose() {} });
    shop.setWallet(120);
    shop.setOpen(true);
  } else if (mode === 'results') parts.results.show(SAMPLE_RESULTS, true);
  else if (mode === 'help') parts.helpPanel.open();
  else if (mode === 'tutorial') parts.tutorial.open();
  else if (mode === 'chat') {
    parts.chatPanel.setLines(SAMPLE_CHAT);
    parts.chatPanel.open();
  } else if (mode === 'emote') parts.emoteWheel.open();
}
