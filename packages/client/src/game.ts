import {
  PLAYER_EYE_HEIGHT,
  getCourse,
  getVehicleConfig,
  vec3,
  type ClientMessage,
  type LobbyMessage,
  type PlayerSnapshot,
  type WorldSnapshot,
} from '@lodgy/shared';
import * as THREE from 'three';
import { createInputSource } from './input/combined';
import { createKeyboardSource } from './input/keyboard';
import { createMouseLook } from './input/mouse';
import { createFixedStepper, createFrameClock } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { updateFollowCamera } from './render/followCamera';
import { createPlayerMesh, disposePlayerMesh, placePlayerMesh } from './render/playerMesh';
import { createScene } from './render/scene';
import { cameraPlacement } from './render/shoulderCamera';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { overlayText } from './ui/overlay';

// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;

export interface Game {
  setLobby(lobby: LobbyMessage): void;
  pushSnapshot(snapshot: WorldSnapshot): void;
  // Stops drawing and listening for input.
  stop(): void;
}

export interface GameView {
  renderer: THREE.WebGLRenderer;
  overlay: HTMLElement;
  crosshair: HTMLElement;
}

// Draws one run: sends an input every tick and shows the vehicle and the players from the server's snapshots.
export function createGame(
  view: GameView,
  playerId: string,
  firstLobby: LobbyMessage,
  send: (message: ClientMessage) => void,
): Game {
  const { renderer, overlay, crosshair } = view;
  let lobby = firstLobby;
  const course = getCourse(lobby.courseId);
  const cameraBoxes = [...course.ground, ...course.walls];
  const scene = createScene(course);
  const vehicleMesh = createVehicleMesh(getVehicleConfig(lobby.vehicleId));
  vehicleMesh.visible = false;
  scene.add(vehicleMesh);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const buffer = createSnapshotBuffer();
  const mouse = createMouseLook(renderer.domElement, document);
  const input = createInputSource(createKeyboardSource(window), mouse);
  const playerMeshes = new Map<string, { mesh: THREE.Group; name: string; colour: string }>();
  let seq = 0;
  const stepper = createFixedStepper(() => {
    seq += 1;
    send({ type: 'input', ...input.sample(), seq });
  });

  // Seated players are hidden, not removed; meshes are remade when a player's name or colour changes, and dropped when they leave.
  const syncPlayerMeshes = (players: PlayerSnapshot[]) => {
    const present = new Set<string>();
    for (const player of players) {
      const info = lobby.players.find((candidate) => candidate.playerId === player.playerId);
      if (!info) continue;
      present.add(player.playerId);
      let entry = playerMeshes.get(player.playerId);
      if (entry && (entry.name !== info.name || entry.colour !== info.colour)) {
        scene.remove(entry.mesh);
        disposePlayerMesh(entry.mesh);
        entry = undefined;
      }
      if (!entry) {
        entry = { mesh: createPlayerMesh(info.name, info.colour), name: info.name, colour: info.colour };
        playerMeshes.set(player.playerId, entry);
        scene.add(entry.mesh);
      }
      entry.mesh.visible = player.seat === null;
      placePlayerMesh(entry.mesh, player);
    }
    for (const [id, entry] of playerMeshes) {
      if (present.has(id)) continue;
      scene.remove(entry.mesh);
      disposePlayerMesh(entry.mesh);
      playerMeshes.delete(id);
    }
  };

  const frameClock = createFrameClock(MAX_FRAME_SECONDS);
  let fps = 60;
  let frameRequest = requestAnimationFrame(function frame(now: number) {
    const frameSeconds = frameClock(now);
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const sampled = buffer.sample(now / 1000);
    const vehicle = sampled?.vehicle ?? null;
    const players = sampled?.players ?? [];
    if (vehicle) {
      vehicleMesh.visible = true;
      placeVehicleMesh(vehicleMesh, vehicle);
    }
    syncPlayerMeshes(players);

    const local = players.find((player) => player.playerId === playerId);
    const onFoot = local !== undefined && local.seat === null;
    crosshair.hidden = !onFoot;
    if (local && onFoot) {
      const head = vec3(local.pos.x, local.pos.y + PLAYER_EYE_HEIGHT, local.pos.z);
      const placement = cameraPlacement(head, mouse.yaw(), mouse.pitch(), cameraBoxes);
      camera.position.set(placement.position.x, placement.position.y, placement.position.z);
      camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    } else if (vehicle) {
      updateFollowCamera(camera, vehicle, frameSeconds);
    }
    overlay.textContent = overlayText({ lobby, tick: buffer.latestTick(), fps, vehicle, players, localId: playerId });
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(frame);
  });

  return {
    setLobby(next) {
      lobby = next;
    },
    pushSnapshot: (snapshot) => buffer.push(snapshot, performance.now() / 1000),
    stop() {
      cancelAnimationFrame(frameRequest);
      window.removeEventListener('resize', resize);
      input.dispose();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      crosshair.hidden = true;
      for (const entry of playerMeshes.values()) disposePlayerMesh(entry.mesh);
      playerMeshes.clear();
    },
  };
}
