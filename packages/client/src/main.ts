import RAPIER from '@dimforge/rapier3d-compat';
import type { ClientMessage, LobbyMessage, Phase, ResultsMessage, ServerMessage } from '@lodgy/shared';
import * as THREE from 'three';
import { createGame, type Game } from './game';
import { openSocket, type CloseInfo, type GameSocket } from './net/socket';
import { RECONNECT_IDLE, RECONNECT_WINDOW, SOCKET_OPEN_TIMEOUT, reconnectStep, resumeAction, type ReconnectEvent, type ReconnectState } from './net/reconnect';
import { roomFromPath, socketUrl } from './route';
import { autoReloadAllowed, createMemoryStore, markAutoReload, saveName, savedName, saveRejoin, sessionToken, takeRejoin, type KeyValueStore } from './session';
import { createInputSource } from './input/combined';
import { createKeyboardSource } from './input/keyboard';
import { createMouseLook } from './input/mouse';
import type { GameInput } from './input/source';
import { createTouchSource } from './input/touch';
import { createHome, errorText } from './ui/home';
import { createLobby } from './ui/lobby';
import { createResults } from './ui/results';
import { createTouchUi } from './ui/touchUi';

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

// The physics module loads once; creating or joining a room waits for it.
const rapierReady = RAPIER.init();
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
// The joined socket, or the one that is joining. It is null while reconnecting.
let socket: GameSocket | null = null;
// The socket of a reconnect attempt, until its welcome makes it the joined socket.
let attempt: GameSocket | null = null;
let reconnect: ReconnectState = RECONNECT_IDLE;
let attemptTimer: number | null = null;
let deadlineTimer: number | null = null;
let autoJoining = false;
let autoJoinRoom = '';
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

const home = createHome(document.querySelector<HTMLElement>('#home')!, {
  onCreate(chosenName) {
    name = chosenName;
    request({ type: 'create', name, token });
  },
  onJoin(room, chosenName) {
    name = chosenName;
    request({ type: 'join', room, name, token });
  },
});

const lobby = createLobby(document, {
  onReady: (ready) => socket?.send({ type: 'ready', ready }),
  onConfigure: (settings) => socket?.send({ type: 'configure', ...settings }),
  onStart: () => socket?.send({ type: 'start' }),
  onKick: (target) => socket?.send({ type: 'kick', playerId: target }),
});

const results = createResults(document.querySelector<HTMLElement>('#results')!, {
  onNext: () => socket?.send({ type: 'next' }),
  onLobby: () => socket?.send({ type: 'toLobby' }),
});

const SOMETHING_WRONG = 'Something went wrong.';

// Stops the run's drawing and input; the lobby and the home page take over the screen.
function stopGame() {
  game?.stop();
  game = null;
  touchUi?.setVisible(false);
  overlay.textContent = '';
}

function onLobby(message: LobbyMessage) {
  phase = message.phase;
  adminId = message.adminId;
  if (message.phase !== 'results') lastResults = null;
  if (message.phase === 'lobby') {
    stopGame();
    results.hide();
    lobby.show(message, playerId);
    return;
  }
  lobby.hide();
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
    case 'snapshot':
      game?.pushSnapshot(message);
      return;
    case 'error':
      // A refused purchase belongs to the shop menu; it never ends the game or reaches the home page.
      if (message.reason === 'cannot_buy') {
        game?.showShopError();
        return;
      }
      if (playerId !== '') {
        // In a room an error never reaches the home page; being kicked ends with the home page's text.
        if (message.reason === 'kicked') {
          closeReason = errorText('kicked');
          reconnectEvent('kicked');
          socket?.close();
        } else if (lobby.isShown()) lobby.setError(errorText(message.reason));
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  } catch (error) {
    console.error(error);
    closeReason = 'This browser cannot show 3D graphics (WebGL is not available).';
    socket?.close();
    return;
  }
  if (touchDevice && !touchUi) {
    const root = document.createElement('div');
    document.body.append(root);
    touchUi = createTouchUi(root);
  }
  const controls = touchUi;
  const input = (): GameInput =>
    controls
      ? createTouchSource({ surface: canvas, win: window, doc: document, width: () => window.innerWidth, controls })
      : createInputSource(createKeyboardSource(window), createMouseLook(canvas, document, pointerGate));
  touchUi?.setVisible(true);
  game = createGame({ renderer, overlay, crosshair, rapier: RAPIER, input, touchUi, pointerGate }, playerId, lobby, (outgoing) => socket?.send(outgoing));
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
  playerId = '';
  adminId = null;
  lastResults = null;
  phase = null;
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
  const opened = openSocket(socketUrl(location), {
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
  home.setBusy(true);
  // Until the physics module is ready nothing is sent, so no lobby (and no game) can arrive before it.
  rapierReady.then(
    () => send(message),
    () => {
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
  const opened = openSocket(socketUrl(location), {
    onOpen: () => opened.send(message),
    onMessage: (incoming) => onSocketMessage(opened, incoming),
    onClose: (info) => onSocketClose(opened, info),
  });
  socket = opened;
}

// Joins the room in the address at once, after the page reloaded itself because the 3D view was lost.
function autoJoin(room: string, rejoinName: string) {
  name = rejoinName;
  autoJoining = true;
  autoJoinRoom = room;
  if (pageHidden) return;
  reconnectOverlay.hidden = false;
  rapierReady.then(
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
  if (action === 'autoJoin') autoJoin(autoJoinRoom, name);
  else if (action === 'scheduleAttempt') scheduleAttempt(clock());
  else if (action === 'beginReconnect') beginReconnect();
});

canvas.addEventListener('webglcontextlost', () => {
  // Outside a room Three's own listener restores the context.
  if (!currentRoom || (playerId === '' && reconnect.kind !== 'reconnecting')) return;
  const at = Date.now();
  if (!autoReloadAllowed(sessionStore, at, AUTO_RELOAD_GUARD)) {
    reconnectEvent('left');
    giveUp(VIEW_LOST);
    return;
  }
  saveRejoin(sessionStore, { room: currentRoom, name, at });
  markAutoReload(sessionStore, at);
  location.reload();
});

// Back and forward change the address without loading the page; reloading puts the page in step with it.
window.addEventListener('popstate', () => location.reload());

const rejoin = takeRejoin(sessionStore, roomFromPath(location.pathname));
if (rejoin) autoJoin(roomFromPath(location.pathname)!, rejoin.name);
else home.show({ room: roomFromPath(location.pathname), name });
