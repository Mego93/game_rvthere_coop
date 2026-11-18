import RAPIER from '@dimforge/rapier3d-compat';
import type { ClientMessage, LobbyMessage, Phase, ResultsMessage, ServerMessage } from '@lodgy/shared';
import * as THREE from 'three';
import './ui/fonts.css';
import { createAudio } from './audio/audio';
import { isMuteKey } from './audio/soundMap';
import { createGame, type Game } from './game';
import { isSoftwareRenderer, pixelRatioFor } from './render/renderScale';
import { preloadAssets } from './render/models';
import { preloadSkies, SKY_COUNT } from './render/environment';
import { preloadGroundTextures } from './render/groundTextures';
import { openSocket, type CloseInfo, type GameSocket } from './net/socket';
import { RECONNECT_IDLE, RECONNECT_WINDOW, SOCKET_OPEN_TIMEOUT, reconnectStep, resumeAction, type ReconnectEvent, type ReconnectState } from './net/reconnect';
import { socketUrl, type SocketIntent } from './net/socketUrl';
import { roomFromPath } from './route';
import { autoReloadAllowed, createMemoryStore, markAutoReload, saveMuted, saveName, savedMuted, savedName, saveRejoin, sessionToken, takeRejoin, type KeyValueStore } from './session';
import { createInputSource } from './input/combined';
import { createKeyboardSource } from './input/keyboard';
import { createMouseLook } from './input/mouse';
import type { GameInput } from './input/source';
import { createTouchSource } from './input/touch';
import { createChatLog, createChatPanel, createChatSender, submitChat } from './ui/chat';
import { createCredits } from './ui/credits';
import { createControlsPanel, isHelpKey } from './ui/controls';
import { createEmoteWheel } from './ui/emoteWheel';
import { createHome, errorText } from './ui/home';
import { createLobby } from './ui/lobby';
import { createResults } from './ui/results';
import { hudTestMode, startHudTest } from './ui/hudTest';
import { installTheme } from './ui/theme';
import { createTouchUi } from './ui/touchUi';
import { createTutorial, shouldAutoShowTutorial } from './ui/tutorial';
import { firstPersonEnabled } from './render/firstPersonCamera';

// Some private browsing modes refuse access to storage; the page then works without remembering anything.
function storage(get: () => Storage): KeyValueStore {
  try {
    const store = get();
    store.getItem('lodgy.probe');
    return store;
  } catch {
    return createMemoryStore();
  }
}

const nameStore = storage(() => localStorage);
// Session storage is per tab, so each tab is its own player and a reload keeps its identity.
const sessionStore = storage(() => sessionStorage);
const token = sessionToken(sessionStore, (bytes) => crypto.getRandomValues(bytes));

// One audio per page; the context is made inside the first gesture, as iOS requires.
const audio = createAudio({
  createContext: () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(),
  load: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.arrayBuffer();
  },
});
let muted = savedMuted(nameStore);
audio.setMuted(muted);
// Kept for the page's life: a call resumes a context that iOS interrupted.
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true });
document.addEventListener(
  'click',
  (event) => {
    if (event.target instanceof Element && event.target.closest('#lobby button, #run-menu button:not(#run-mute), #shop-menu button, #results button')) audio.play('click');
  },
  { capture: true },
);
function toggleMute() {
  muted = !muted;
  audio.setMuted(muted);
  saveMuted(nameStore, muted);
  game?.setMuted(muted);
}
window.addEventListener('keydown', (event) => {
  if (isMuteKey(event, event.target instanceof Element ? event.target.tagName : null)) toggleMute();
});

// The physics module loads once; creating or joining a room waits for it.
const rapierReady = RAPIER.init();
// Models, skies and ground textures load as the page does; both resolve even when a file fails, which only warns.
let modelsProgress = 0;
let skiesProgress = 0;
let texturesProgress = 0;
let assetsLoading = true;
let requesting = false;
const assetsReady = Promise.all([
  preloadAssets((done, total) => {
    modelsProgress = done / total;
    showLoading();
  }),
  preloadSkies((done) => {
    skiesProgress = done / SKY_COUNT;
    showLoading();
  }),
  preloadGroundTextures(!window.matchMedia('(pointer: coarse)').matches, (done, total) => {
    texturesProgress = done / total;
    showLoading();
  }),
]).then(() => {
  assetsLoading = false;
});
function showLoading() {
  if (assetsLoading && requesting) home.setBusy(true, `Loading ${Math.round(((modelsProgress + skiesProgress + texturesProgress) / 3) * 100)}%`);
}

const RAPIER_FAILED = 'The game could not load its physics engine. Reload the page to try again.';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const reconnectOverlay = document.querySelector<HTMLElement>('#reconnect')!;
const crosshair = document.querySelector<HTMLElement>('#crosshair')!;

// Safari's pinch gesture would zoom the page.
document.addEventListener('gesturestart', (event) => event.preventDefault());

// Chosen once at load; the touch UI is made on the first run on a touch device.
const touchDevice = window.matchMedia('(pointer: coarse)').matches;
let touchUi: ReturnType<typeof createTouchUi> | null = null;

// Set by the game while a menu is open, so a click does not take the pointer back.
const pointerGate = { blocked: false };

const CONNECTION_LOST = 'The connection to the server was lost.';
const PLACE_LOST = 'Your place in the room was lost.';
const VIEW_LOST = 'The 3D view was lost. Reload the page to continue.';
// A context lost twice within this many ms of reloading would reload forever.
const AUTO_RELOAD_GUARD = 10_000;

let renderer: THREE.WebGLRenderer | null = null;
let softwareGl = false;
// ?hq keeps the full look on software GL, for screenshots; read at load, before a room's path replaces the address.
const fullQuality = new URLSearchParams(location.search).has('hq');
// ?fp (or localStorage lodgy.fp = 1) turns on the first-person prototype; read at load for the same reason.
const firstPerson = firstPersonEnabled(location.search, (() => { try { return localStorage.getItem('lodgy.fp'); } catch { return null; } })());
// The joined socket, or the one that is joining. It is null while reconnecting.
let socket: GameSocket | null = null;
// The socket of a reconnect attempt, until its welcome makes it the joined socket.
let attempt: GameSocket | null = null;
let reconnect: ReconnectState = RECONNECT_IDLE;
let attemptTimer: number | null = null;
let deadlineTimer: number | null = null;
let autoJoining = false;
let autoJoinRoom = '';
let autoJoinPlayerId = '';
let pageHidden = false;
let currentRoom: string | null = null;
let droppedPlayerId = '';
let game: Game | null = null;
let name = savedName(nameStore);
let playerId = '';
let adminId: string | null = null;
let lastResults: ResultsMessage | null = null;
let phase: Phase | null = null;
// What the home page says when the socket next closes.
let closeReason = CONNECTION_LOST;

const credits = createCredits(document);
// The tutorial first: both close on Escape in the capture phase, and the one on top (the tutorial) must take it.
const tutorial = createTutorial(document, { touch: touchDevice, store: nameStore, onChange: () => game?.setControlsOpen(menuPanelOpen()) });
// The theme goes in before any screen is built, so every component can use its tokens and shared classes.
installTheme(document);

const helpPanel = createControlsPanel(document, () => game?.setControlsOpen(menuPanelOpen()), () => credits.open());
const menuPanelOpen = () => helpPanel.isOpen() || tutorial.isOpen();
// Shown on its own the first time the lobby appears on this page load, unless it was finished or skipped before.
let tutorialOffered = false;
window.addEventListener('keydown', (event) => {
  if (!tutorial.isOpen() && !emoteWheel.isOpen() && isHelpKey(event, event.target instanceof Element ? event.target.tagName : null)) helpPanel.toggle();
});

const home = createHome(document.querySelector<HTMLElement>('#home')!, {
  onCreate(chosenName) {
    name = chosenName;
    request({ type: 'create', name, token });
  },
  onJoin(room, chosenName) {
    name = chosenName;
    request({ type: 'join', room, name, token });
  },
  onCredits: () => credits.open(),
});

// Owned here, not by the game, so lines survive between runs and a reconnect; cleared when the room is left.
const chatLog = createChatLog();
const chatSender = createChatSender();
const sendChat = (text: string) => submitChat(text, chatSender, clock(), (cleaned) => socket?.send({ type: 'chat', text: cleaned }));
// Created after the help panel and the tutorial, so their Escape handlers run first.
const chatPanel = createChatPanel(document, {
  onSubmit: sendChat,
  onOpenChange: (open) => {
    if (open) {
      chatLog.markRead();
      chatPanel.setLines(chatLog.lines());
      tickChat();
    }
    game?.setChatOpen(open);
  },
});
// Created after the chat panel, so the wheel's Escape runs after theirs; one is open at a time.
const emoteWheel = createEmoteWheel(document, {
  onPick: (emote) => socket?.send({ type: 'emote', emote }),
  onOpenChange: (open) => game?.setEmoteOpen(open),
});
let renderedChat = -1;
// Redraws the lines only when the log changed.
function renderChat() {
  if (renderedChat === chatLog.version()) return;
  renderedChat = chatLog.version();
  chatPanel.setLines(chatLog.lines());
  lobby.setChat(chatLog.lines());
}
// Toasts show during a run and its results, not in the lobby, which has its own chat; they expire with time.
function tickChat() {
  const inRun = phase === 'playing' || phase === 'results';
  chatPanel.setToastsAllowed(inRun);
  chatPanel.setToasts(chatLog.recent(clock()));
  touchUi?.setChatUnread(inRun && chatLog.unread() > 0);
}
// The timer runs only while a run or its results show; the lobby needs no expiry.
let chatTimer: number | null = null;
function syncChatTimer() {
  const inRun = phase === 'playing' || phase === 'results';
  if (inRun && chatTimer === null) chatTimer = window.setInterval(tickChat, 500);
  else if (!inRun && chatTimer !== null) {
    clearInterval(chatTimer);
    chatTimer = null;
  }
  tickChat();
}

const lobby = createLobby(document, {
  onReady: (ready) => socket?.send({ type: 'ready', ready }),
  onConfigure: (settings) => socket?.send({ type: 'configure', ...settings }),
  onStart: () => socket?.send({ type: 'start' }),
  onKick: (target) => socket?.send({ type: 'kick', playerId: target }),
  onAppearance: (appearance) => socket?.send({ type: 'appearance', ...appearance }),
  onCredits: () => credits.open(),
  onTutorial: () => tutorial.open(),
  onChat: sendChat,
});

const results = createResults(document.querySelector<HTMLElement>('#results')!, {
  onNext: () => socket?.send({ type: 'next' }),
  onLobby: () => socket?.send({ type: 'toLobby' }),
});

const SOMETHING_WRONG = 'Something went wrong.';

// Stops the run's drawing and input; the lobby and the home page take over the screen.
function stopGame() {
  chatPanel.close();
  emoteWheel.close();
  game?.stop();
  game = null;
  touchUi?.setVisible(false);
  overlay.textContent = '';
}

function onLobby(message: LobbyMessage) {
  phase = message.phase;
  syncChatTimer();
  adminId = message.adminId;
  if (message.phase !== 'results') lastResults = null;
  if (message.phase === 'lobby') {
    stopGame();
    results.hide();
    lobby.show(message, playerId);
    chatLog.markRead();
    if (shouldAutoShowTutorial(nameStore, tutorialOffered)) tutorial.open();
    tutorialOffered = true;
    return;
  }
  lobby.hide();
  // No chat panel outside a run; the toasts still show in the results.
  if (message.phase !== 'playing') {
    chatPanel.close();
    emoteWheel.close();
  }
  if (message.phase === 'playing') {
    results.hide();
    if (game) game.setLobby(message);
    else startGame(message);
    return;
  }
  // Results: a running game stays drawn, frozen; a player who joined now has none and sees only the results.
  game?.setLobby(message);
  // An admin handover during results changes who sees the buttons.
  if (lastResults) results.show(lastResults, adminId === playerId);
}

function onMessage(message: ServerMessage) {
  switch (message.type) {
    case 'welcome':
      if (autoJoining && autoJoinPlayerId !== '' && message.playerId !== autoJoinPlayerId) {
        // The slot expired or was taken; never become a new player silently.
        closeReason = PLACE_LOST;
        reconnectEvent('refused');
        socket?.close();
        return;
      }
      playerId = message.playerId;
      currentRoom = message.room;
      autoJoining = false;
      reconnectEvent('joined');
      reconnectOverlay.hidden = true;
      saveName(nameStore, name);
      // Creating a room, or joining one by name, changes the address to the room's without reloading.
      if (roomFromPath(location.pathname) !== message.room) history.pushState(null, '', `/${message.room}`);
      home.hide();
      return;
    case 'lobby':
    case 'results':
      try {
        if (message.type === 'lobby') onLobby(message);
        else if (phase === 'results') {
          lastResults = message;
          results.show(message, adminId === playerId);
        }
      } catch (error) {
        console.error(error);
        closeReason = SOMETHING_WRONG;
        socket?.close();
      }
      return;
    case 'chat':
      chatLog.add(message, playerId, clock());
      // Read at once while the lobby chat or the open panel shows it.
      if (chatPanel.isOpen() || lobby.isShown()) chatLog.markRead();
      renderChat();
      tickChat();
      return;
    case 'emote':
      game?.onEmote(message);
      return;
    case 'snapshot':
      game?.pushSnapshot(message);
      return;
    case 'event':
      game?.onEvent(message);
      return;
    case 'error':
      // A refused purchase belongs to the shop menu; it never ends the game or reaches the home page.
      if (message.reason === 'cannot_buy') {
        game?.showShopError();
        return;
      }
      if (playerId !== '') {
        // In a room an error never reaches the home page; being kicked ends with the home page's text.
        if (message.reason === 'kicked' || message.reason === 'replaced') {
          closeReason = errorText(message.reason);
          reconnectEvent('kicked');
          socket?.close();
        } else if (lobby.isShown()) lobby.setError(errorText(message.reason), message.reason);
        else console.warn('Refused:', message.reason);
        return;
      }
      if (autoJoining) {
        closeReason = errorText(message.reason);
        socket?.close();
        return;
      }
      home.setBusy(false);
      home.setError(errorText(message.reason));
      return;
  }
}

// The renderer is made when the first run starts, so a browser without WebGL still gets the home page and a clear message.
function startGame(lobby: LobbyMessage) {
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const description = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
      softwareGl = isSoftwareRenderer(description) && !fullQuality;
      renderer.setPixelRatio(pixelRatioFor(window.devicePixelRatio, description, fullQuality));
    }
  } catch (error) {
    console.error(error);
    closeReason = 'This browser cannot show 3D graphics (WebGL is not available).';
    socket?.close();
    return;
  }
  // A context lost outside a run is not restored in time for this one; reload as for a loss during a run.
  if (renderer.getContext().isContextLost()) {
    reloadAfterContextLoss();
    return;
  }
  if (touchDevice && !touchUi) {
    const root = document.createElement('div');
    document.body.append(root);
    touchUi = createTouchUi(root);
    // Opened inside the touch itself, so iOS shows the keyboard.
    touchUi.onChat(() => game?.requestChat());
    touchUi.onEmote(() => game?.requestEmote());
  }
  const controls = touchUi;
  const input = (): GameInput =>
    controls
      ? createTouchSource({ surface: canvas, win: window, doc: document, width: () => window.innerWidth, controls })
      : createInputSource(createKeyboardSource(window), createMouseLook(canvas, document, pointerGate));
  touchUi?.setVisible(true);
  game = createGame({ renderer, overlay, crosshair, rapier: RAPIER, input, touchUi, pointerGate, audio, muted, softwareGl, firstPerson, onMute: toggleMute, onHelp: () => helpPanel.open(), onTutorial: () => tutorial.open(), controlsOpen: menuPanelOpen(), chatOpen: chatPanel.isOpen(), emoteOpen: emoteWheel.isOpen(), onChat: () => chatPanel.open(), onEmoteWheel: () => emoteWheel.open(), onEmoteWheelClose: () => emoteWheel.close() }, playerId, lobby, (outgoing) => socket?.send(outgoing));
}

const clock = () => performance.now() / 1000;

function reconnectEvent(event: ReconnectEvent) {
  const step = reconnectStep(reconnect, event, clock());
  reconnect = step.state;
  return step.action;
}

function clearReconnectTimers() {
  if (attemptTimer !== null) clearTimeout(attemptTimer);
  if (deadlineTimer !== null) clearTimeout(deadlineTimer);
  attemptTimer = null;
  deadlineTimer = null;
}

// Puts the page on the home page after the connection ended.
function showHome(text: string) {
  clearReconnectTimers();
  reconnectOverlay.hidden = true;
  socket = null;
  autoJoining = false;
  stopGame();
  lobby.hide();
  results.hide();
  chatLog.clear();
  chatSender.reset();
  playerId = '';
  adminId = null;
  lastResults = null;
  phase = null;
  renderChat();
  syncChatTimer();
  home.setBusy(false);
  home.show({ room: roomFromPath(location.pathname), name, error: text });
  closeReason = CONNECTION_LOST;
}

// Ends the connection for good, whether it is joined, reconnecting or neither.
function giveUp(text: string) {
  closeReason = text;
  reconnectEvent('left');
  clearReconnectTimers();
  const pending = attempt;
  attempt = null;
  pending?.close();
  if (socket) socket.close();
  else showHome(text);
}

function onClose(info: CloseInfo) {
  socket = null;
  if (!info.byPage && playerId !== '') {
    beginReconnect();
    return;
  }
  reconnectEvent('left');
  showHome(closeReason);
}

function beginReconnect() {
  // A page being hidden loses its sockets; it must not start attempts nobody sees.
  if (pageHidden) return;
  stopGame();
  droppedPlayerId = playerId;
  playerId = '';
  reconnectOverlay.hidden = false;
  const action = reconnectEvent('dropped');
  if (typeof action === 'object') scheduleAttempt(action.connectAt);
  deadlineTimer = window.setTimeout(() => giveUp(CONNECTION_LOST), (RECONNECT_WINDOW + SOCKET_OPEN_TIMEOUT) * 1000);
}

function scheduleAttempt(connectAt: number) {
  attemptTimer = window.setTimeout(startAttempt, Math.max(0, connectAt - clock()) * 1000);
}

function startAttempt() {
  attemptTimer = null;
  if (reconnect.kind !== 'reconnecting' || pageHidden || !currentRoom) return;
  const room = currentRoom;
  const opened = openSocket(socketUrl(location, { noun: room }), {
    onOpen: () => {
      if (opened === attempt) opened.send({ type: 'join', room, name, token });
    },
    onMessage: (message) => onSocketMessage(opened, message),
    onClose: (info) => onSocketClose(opened, info),
  });
  attempt = opened;
}

// Handlers of an old socket do nothing once it is replaced.
function onSocketMessage(from: GameSocket, message: ServerMessage) {
  if (from === socket) {
    onMessage(message);
    return;
  }
  if (from !== attempt) return;
  if (message.type === 'error') {
    reconnectEvent('refused');
    giveUp(errorText(message.reason));
  } else if (message.type === 'welcome') {
    if (message.playerId !== droppedPlayerId) {
      reconnectEvent('refused');
      giveUp(PLACE_LOST);
      return;
    }
    clearReconnectTimers();
    socket = attempt;
    attempt = null;
    onMessage(message);
  }
}

function onSocketClose(from: GameSocket, info: CloseInfo) {
  if (from === socket) {
    onClose(info);
    return;
  }
  if (from !== attempt) return;
  attempt = null;
  const action = reconnectEvent('attemptFailed');
  if (typeof action === 'object') scheduleAttempt(action.connectAt);
  else giveUp(CONNECTION_LOST);
}

// Sends a create or join request once the physics module is ready.
function request(message: ClientMessage) {
  requesting = true;
  home.setBusy(true);
  showLoading();
  // Until the physics module and the assets are ready nothing is sent, so no lobby (and no game) can arrive before them.
  Promise.all([rapierReady, assetsReady]).then(
    () => {
      requesting = false;
      home.setBusy(true);
      send(message);
    },
    () => {
      requesting = false;
      home.setBusy(false);
      home.setError(RAPIER_FAILED);
    },
  );
}

// Opens the socket first if there is none.
function send(message: ClientMessage) {
  if (socket) {
    socket.send(message);
    return;
  }
  // The opening message says which room the socket is for: a create asks for a new one, a join names its room.
  const intent: SocketIntent = message.type === 'create' ? { create: true } : message.type === 'join' ? { noun: message.room } : null;
  const opened = openSocket(socketUrl(location, intent), {
    onOpen: () => opened.send(message),
    onMessage: (incoming) => onSocketMessage(opened, incoming),
    onClose: (info) => onSocketClose(opened, info),
  });
  socket = opened;
}

// Joins the room in the address at once, after the page reloaded itself because the 3D view was lost.
function autoJoin(room: string, rejoinName: string, rejoinPlayerId: string) {
  name = rejoinName;
  autoJoinPlayerId = rejoinPlayerId;
  autoJoining = true;
  autoJoinRoom = room;
  if (pageHidden) return;
  reconnectOverlay.hidden = false;
  Promise.all([rapierReady, assetsReady]).then(
    () => {
      if (pageHidden) return;
      send({ type: 'join', room, name, token });
    },
    () => showHome(RAPIER_FAILED),
  );
}

// The page is going away or into the back/forward cache; its sockets close without anything being wrong.
window.addEventListener('pagehide', () => {
  pageHidden = true;
});

// A page restored from the cache has lost its sockets and timers' purpose; pick the connection up again.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  pageHidden = false;
  const action = resumeAction({
    autoJoining,
    inRoom: playerId !== '',
    hasSocket: socket !== null,
    hasAttempt: attempt !== null,
    hasAttemptTimer: attemptTimer !== null,
    reconnecting: reconnect.kind === 'reconnecting',
  });
  if (action === 'autoJoin') autoJoin(autoJoinRoom, name, autoJoinPlayerId);
  else if (action === 'scheduleAttempt') scheduleAttempt(clock());
  else if (action === 'beginReconnect') beginReconnect();
});

function reloadAfterContextLoss() {
  if (!currentRoom) return;
  const at = Date.now();
  if (!autoReloadAllowed(sessionStore, at, AUTO_RELOAD_GUARD)) {
    giveUp(VIEW_LOST);
    return;
  }
  saveRejoin(sessionStore, { room: currentRoom, name, playerId: playerId || droppedPlayerId, at });
  markAutoReload(sessionStore, at);
  location.reload();
}

canvas.addEventListener('webglcontextlost', () => {
  // Outside a room Three's own listener restores the context.
  if (!currentRoom || (playerId === '' && reconnect.kind !== 'reconnecting')) return;
  reloadAfterContextLoss();
});

// Back and forward change the address without loading the page; reloading puts the page in step with it.
window.addEventListener('popstate', () => location.reload());

// ?hudtest is the layout check's and the screenshots' way in: the HUD on a fixed sample, no room.
const hudTest = hudTestMode(location.search);
const rejoin = hudTest ? null : takeRejoin(sessionStore, roomFromPath(location.pathname));
if (hudTest) startHudTest(hudTest, { touch: touchDevice, chatPanel, emoteWheel, helpPanel, tutorial, results });
else if (rejoin) autoJoin(roomFromPath(location.pathname)!, rejoin.name, rejoin.playerId);
else home.show({ room: roomFromPath(location.pathname), name });
