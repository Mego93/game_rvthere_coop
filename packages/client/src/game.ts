import { getCourse, getVehicleConfig, type ClientMessage, type LobbyMessage, type WorldSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { createKeyboardSource } from './input/keyboard';
import { createFixedStepper } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { updateFollowCamera } from './render/followCamera';
import { createScene } from './render/scene';
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
}

// Draws one run: sends an input every tick and shows the vehicle from the server's snapshots.
export function createGame(view: GameView, firstLobby: LobbyMessage, send: (message: ClientMessage) => void): Game {
  const { renderer, overlay } = view;
  let lobby = firstLobby;
  const scene = createScene(getCourse(lobby.courseId));
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
  const keyboard = createKeyboardSource(window);
  let seq = 0;
  const stepper = createFixedStepper(() => {
    seq += 1;
    send({ type: 'input', ...keyboard.sample(), seq });
  });

  let last = performance.now();
  let fps = 60;
  let frameRequest = requestAnimationFrame(function frame(now: number) {
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const vehicle = buffer.sample(now / 1000);
    if (vehicle) {
      vehicleMesh.visible = true;
      placeVehicleMesh(vehicleMesh, vehicle);
      updateFollowCamera(camera, vehicle, frameSeconds);
    }
    overlay.textContent = overlayText({ lobby, tick: buffer.latestTick(), fps, vehicle });
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
      keyboard.dispose();
    },
  };
}
