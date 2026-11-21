import type { GolfSnapshot, ResultsMessage, StoryStateMessage } from '@lodgy/shared';
import { createGolfHud, createGolfResults } from './golf/golfHud';
import { golfHudView } from './golf/golfHudView';
import { IDLE_SHOT } from './golf/shot';
import { createStoryHud } from './story/storyHud';
import { storyHudModel } from './story/needsView';
import { createStoryUi, type StoryUi } from './story/storyUi';
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

export type HudTestMode = 'hud' | 'drive' | 'menu' | 'shop' | 'results' | 'help' | 'chat' | 'emote' | 'tutorial' | 'story' | 'storydrive' | 'storyphone' | 'storykiosk' | 'storygoals' | 'storysummary' | 'golf' | 'golfboard' | 'golfresults';

const MODES: readonly HudTestMode[] = ['hud', 'drive', 'menu', 'shop', 'results', 'help', 'chat', 'emote', 'tutorial', 'story', 'storydrive', 'storyphone', 'storykiosk', 'storygoals', 'storysummary', 'golf', 'golfboard', 'golfresults'];

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
  dashboard: { kmh: 64, gear: 3, rpm: 4200 },
  slots: [
    { kind: 'jerrycan', label: 'Fuel', selected: true },
    { kind: 'toolbox', label: 'Tools', selected: false },
    { kind: 'healthKit', label: 'Heal', selected: false },
  ],
  combat: { ammo: 12, timers: [{ kind: 'treedent', label: 'Gum', text: '15s' }, { kind: 'shield', label: 'Shield', text: '30' }, { kind: 'koke', label: 'Koke', text: '20s' }] },
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
    ? { seated: true, useVisible: false, reelVisible: true, resetVisible: true, sprintVisible: false, fireVisible: false, slots: ['jerrycan', 'toolbox', 'healthKit'], selected: 0 }
    : { seated: false, useVisible: true, reelVisible: true, resetVisible: true, sprintVisible: true, fireVisible: true, slots: ['jerrycan', 'toolbox', 'healthKit'], selected: 0 };

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

// The story HUD's sample: Luiz at 08:30 with caffeine running, two goals pending and one done.
export const sampleStoryState = (poor = false): StoryStateMessage => ({
  type: 'storyState',
  day: 0,
  clock: 40,
  dayLength: 600,
  night: false,
  goals: [
    { id: 'vibecode', label: 'Vibecode at a laptop', status: 'done' },
    { id: 'eat', label: 'Eat together in the kitchen', status: 'pending' },
    { id: 'outing', label: 'Take the Lodgy to the desert', status: 'pending' },
  ],
  friends: {
    luiz: { health: 100, food: 22, happiness: 64, tiredness: 83, cash: poor ? 40 : 120, bank: poor ? 90 : 1880, items: ['tea', 'treedent'], caffeine: { fast: 38, slow: 0 } },
    alexander: { health: 100, food: 60, happiness: 55, tiredness: 30, cash: poor ? 40 : 120, bank: poor ? 90 : 1880, items: [], caffeine: { fast: 0, slow: 0 } },
  },
});

// PrimeGolf mid-game: Luiz (the local friend) is on turn with one ball hit, three friends play and one has played all six.
export const sampleGolf = (): GolfSnapshot => ({ turn: 'luiz', ball: null, scores: { luiz: [20, 40], rafael: [10, 0, 15], alexander: [50, 25], huu: [0, 150, 30, 15, 20, 10] } });

// The end of the game, for the results panel.
export const sampleGolfEnd = (): GolfSnapshot['scores'] => ({ luiz: [20, 40, 25, 0, 50, 30], rafael: [10, 0, 15, 20, 0, 25], alexander: [50, 25, 15, 150, 0, 40], huu: [0, 20, 30, 15, 20, 10] });

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
    const golfMode = mode === 'golf' || mode === 'golfboard';
    touchUi.update(golfMode ? { ...sampleTouchView(false), useVisible: false, reelVisible: false, resetVisible: false, sprintVisible: false, fireVisible: mode === 'golf', slots: [null, null, null] } : sampleTouchView(mode === 'drive'));
    if (golfMode) touchUi.setFireLabel('Shoot');
  }

  if (mode === 'story' || mode === 'storydrive') {
    const state = sampleStoryState();
    const storyHud = createStoryHud(doc, { touch: parts.touch }, { onPhone() {}, onGoals() {}, onComplain() {} });
    storyHud.setVenue(mode === 'story' ? 'villa' : 'outing');
    storyHud.update(storyHudModel(state, 'luiz'), 1880, 120, true);
  }
  if (mode === 'golf' || mode === 'golfboard') {
    const golf = createGolfHud(doc, { touch: parts.touch });
    const shot = { ...IDLE_SHOT, phase: 'curve' as const, power: 0.72, marker: 0.4, clock: 0.3 };
    // The meter and the board are not shown together in play: the board shows once a ball has landed.
    const sample = mode === 'golfboard' ? { ...sampleGolf(), turn: 'rafael' as const, ball: { x: -12, y: 0, z: -110 } } : sampleGolf();
    golf.update(golfHudView({ golf: sample, local: 'luiz', shot, boardShown: mode === 'golfboard', pop: mode === 'golfboard' ? { text: 'Blue ring +25', tone: 'hit' } : null, touch: parts.touch }), 'luiz');
    golf.setVisible(true);
  }
  if (mode === 'golfresults') {
    // main.ts already built the live panel; the test one replaces it so the ids stay unique.
    doc.getElementById('golf-results')?.remove();
    createGolfResults(doc).show(sampleGolfEnd());
  }
  if (mode === 'storyphone' || mode === 'storykiosk' || mode === 'storygoals' || mode === 'storysummary') {
    // A pick comes back as a win so the chart can be looked at.
    const ui: StoryUi = createStoryUi(doc, { send: (message) => void (message.type === 'phone' && message.action.kind === 'fakeRepublic' && ui.onFakeRepublic({ pick: message.action.pick, outcome: 120 })), onOpenChange() {} });
    ui.setCharacter('alexander');
    ui.onState(sampleStoryState(true));
    if (mode === 'storyphone') ui.togglePhone();
    else if (mode === 'storykiosk') ui.onSpot('shop');
    else if (mode === 'storygoals') ui.onSpot('board');
    else ui.onDaySummary({ type: 'daySummary', day: 0, done: ['vibecode', 'eat'], missed: ['outing'], skipped: [] });
  }

  parts.chatPanel.setToastsAllowed(true);
  parts.chatPanel.setToasts(SAMPLE_CHAT);

  if (mode === 'menu') {
    const menu = createRunMenu(doc, { onResume() {}, onRestartCheckpoint() {}, onRestartCourse() {}, onToLobby() {}, onSkip() {}, onRefill() {}, onFly() {}, onInfinite() {}, onKick() {}, onMute() {}, onHelp() {}, onTutorial() {} });
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
