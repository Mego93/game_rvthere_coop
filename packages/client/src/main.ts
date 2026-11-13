import type { ClientMessage, LobbyMessage, ServerMessage } from '@lodgy/shared';
import * as THREE from 'three';
import { createGame, type Game } from './game';
import { openSocket, type GameSocket } from './net/socket';
import { roomFromPath, socketUrl } from './route';
import { createMemoryStore, saveName, savedName, sessionToken, type KeyValueStore } from './session';
import { createHome, errorText } from './ui/home';

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
const token = sessionToken(
  storage(() => sessionStorage),
  (bytes) => crypto.getRandomValues(bytes),
);

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const crosshair = document.querySelector<HTMLElement>('#crosshair')!;
const CONNECTION_LOST = 'The connection to the server was lost.';

let renderer: THREE.WebGLRenderer | null = null;
let socket: GameSocket | null = null;
let game: Game | null = null;
let name = savedName(nameStore);
let playerId = '';
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

function onMessage(message: ServerMessage) {
  switch (message.type) {
    case 'welcome':
      playerId = message.playerId;
      saveName(nameStore, name);
      // Creating a room, or joining one by name, changes the address to the room's without reloading.
      if (roomFromPath(location.pathname) !== message.room) history.pushState(null, '', `/${message.room}`);
      home.hide();
      return;
    case 'lobby':
      if (game) game.setLobby(message);
      else startGame(message);
      return;
    case 'snapshot':
      game?.pushSnapshot(message);
      return;
    case 'error':
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
  } catch {
    closeReason = 'This browser cannot show 3D graphics (WebGL is not available).';
    socket?.close();
    return;
  }
  game = createGame({ renderer, overlay, crosshair }, playerId, lobby, (outgoing) => socket?.send(outgoing));
}

function onClose() {
  socket = null;
  game?.stop();
  game = null;
  overlay.textContent = '';
  home.setBusy(false);
  home.show({ room: roomFromPath(location.pathname), name, error: closeReason });
  closeReason = CONNECTION_LOST;
}

// Sends a create or join request, opening the socket first if there is none.
function request(message: ClientMessage) {
  home.setBusy(true);
  if (socket) {
    socket.send(message);
    return;
  }
  const opened = openSocket(socketUrl(location), {
    onOpen: () => opened.send(message),
    onMessage,
    onClose,
  });
  socket = opened;
}

// Back and forward change the address without loading the page; reloading puts the page in step with it.
window.addEventListener('popstate', () => location.reload());

home.show({ room: roomFromPath(location.pathname), name });
