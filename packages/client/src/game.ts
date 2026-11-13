import {
  PLAYER_EYE_HEIGHT,
  createPredictor,
  getCourse,
  getVehicleConfig,
  predictedFrom,
  vec3,
  type ClientMessage,
  type LobbyMessage,
  type PlayerSnapshot,
  type Rapier,
  type SnapshotMessage,
} from '@lodgy/shared';
import * as THREE from 'three';
import { createInputSource } from './input/combined';
import { createKeyboardSource } from './input/keyboard';
import { createMouseLook } from './input/mouse';
import { createFixedStepper, createFrameClock } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { createReconciler } from './prediction/reconciler';
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
  pushSnapshot(snapshot: SnapshotMessage): void;
  // Stops drawing and listening for input.
  stop(): void;
}

export interface GameView {
  renderer: THREE.WebGLRenderer;
  overlay: HTMLElement;
  crosshair: HTMLElement;
  // The initialised Rapier module.
  rapier: Rapier;
}

// Draws one run: sends an input every tick and shows the vehicle and the players from the server's snapshots.
export function createGame(
  view: GameView,
  playerId: string,
  firstLobby: LobbyMessage,
  send: (message: ClientMessage) => void,
): Game {
  const { renderer, overlay, crosshair, rapier } = view;
  let lobby = firstLobby;
  const course = getCourse(lobby.courseId);
  const cameraBoxes = [...course.ground, ...course.walls];
  const scene = createScene(course);
  const vehicleConfig = getVehicleConfig(lobby.vehicleId);
  const vehicleMesh = createVehicleMesh(vehicleConfig);
  vehicleMesh.visible = false;
  scene.add(vehicleMesh);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const predictor = createPredictor(rapier, course, vehicleConfig);
  const reconciler = createReconciler(predictor);
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
  // The local player's entry in the newest snapshot, not interpolated.
  let latestLocal: PlayerSnapshot | null = null;
  let seq = 0;
  const stepper = createFixedStepper(() => {
    seq += 1;
    const sampled = input.sample();
    send({ type: 'input', ...sampled, seq });
    reconciler.record(seq, sampled);
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
    const interpolated = sampled?.players ?? [];
    const drawnPosition = reconciler.active ? (reconciler.view(frameSeconds, stepper.alpha())?.pos ?? null) : null;
    let players = interpolated;
    if (drawnPosition && latestLocal) {
      // Seat and ground come from the newest snapshot so leaving a seat switches the view at once.
      const drawn = { ...latestLocal, pos: drawnPosition, yaw: mouse.yaw(), seat: null, ground: null };
      players = interpolated.some((player) => player.playerId === playerId)
        ? interpolated.map((player) => (player.playerId === playerId ? drawn : player))
        : [...interpolated, drawn];
    }
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
    overlay.textContent = overlayText({
      lobby,
      config: vehicleConfig,
      tick: buffer.latestTick(),
      fps,
      vehicle,
      players: interpolated,
      localId: playerId,
      predicted: drawnPosition,
      server: latestLocal?.pos ?? null,
    });
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(frame);
  });

  return {
    setLobby(next) {
      lobby = next;
    },
    pushSnapshot(snapshot) {
      buffer.push(snapshot, performance.now() / 1000);
      predictor.setVehicle(snapshot.vehicle.pos, snapshot.vehicle.rot);
      const entry = snapshot.players.find((player) => player.playerId === playerId);
      latestLocal = entry ?? null;
      if (entry && entry.seat === null && entry.ground === null) reconciler.correct(predictedFrom(entry), snapshot.ackSeq);
      else reconciler.suspend();
    },
    stop() {
      cancelAnimationFrame(frameRequest);
      window.removeEventListener('resize', resize);
      input.dispose();
      predictor.dispose();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      crosshair.hidden = true;
      for (const entry of playerMeshes.values()) disposePlayerMesh(entry.mesh);
      playerMeshes.clear();
    },
  };
}
