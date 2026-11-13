import {
  PLAYER_EYE_HEIGHT,
  add,
  rotate,
  createPredictor,
  getCourse,
  getVehicleConfig,
  holdPoseAt,
  predictedFrom,
  vec3,
  type ClientMessage,
  type LobbyMessage,
  type PlayerSnapshot,
  type PropSnapshot,
  type Rapier,
  type SnapshotMessage,
} from '@lodgy/shared';
import * as THREE from 'three';
import type { GameInput } from './input/source';
import { hasJoystick } from './input/touch';
import { createFixedStepper, createFrameClock } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { predictionActive } from './prediction/gate';
import { createReconciler } from './prediction/reconciler';
import { updateFollowCamera } from './render/followCamera';
import { createPlayerMesh, disposePlayerMesh, placePlayerMesh } from './render/playerMesh';
import { createPropMesh, disposePropMesh, placePropMesh } from './render/propMesh';
import { createScene } from './render/scene';
import { cameraPlacement } from './render/shoulderCamera';
import { createWinchMesh, disposeWinchMesh, placeWinchMesh } from './render/winchMesh';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { overlayText } from './ui/overlay';
import type { TouchUi } from './ui/touchUi';
import { touchView } from './ui/touchView';

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
  // Makes the run's input source; chosen once at load by the page.
  input: () => GameInput;
  // The touch buttons, or null on a device without touch.
  touchUi: TouchUi | null;
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
  const winchMesh = createWinchMesh();
  winchMesh.visible = false;
  scene.add(winchMesh);
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
  const input = view.input();
  const playerMeshes = new Map<string, { mesh: THREE.Group; name: string; colour: string }>();
  const propMeshes = new Map<string, { mesh: THREE.Mesh; kind: string }>();
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

  // A prop in a player's hands is drawn at that player's hold pose; the rest where the snapshot puts them.
  const syncPropMeshes = (props: PropSnapshot[], players: PlayerSnapshot[]) => {
    const held = new Map<string, PlayerSnapshot>();
    for (const player of players) if (player.hands !== null && player.hands !== 'hook') held.set(player.hands, player);
    const present = new Set<string>();
    for (const prop of props) {
      present.add(prop.id);
      let entry = propMeshes.get(prop.id);
      if (entry && entry.kind !== prop.kind) {
        scene.remove(entry.mesh);
        disposePropMesh(entry.mesh);
        propMeshes.delete(prop.id);
        entry = undefined;
      }
      if (!entry) {
        entry = { mesh: createPropMesh(prop.kind), kind: prop.kind };
        propMeshes.set(prop.id, entry);
        scene.add(entry.mesh);
      }
      const holder = held.get(prop.id);
      placePropMesh(entry.mesh, holder ? holdPoseAt(holder.pos, holder.yaw) : prop);
    }
    for (const [id, entry] of propMeshes) {
      if (present.has(id)) continue;
      scene.remove(entry.mesh);
      disposePropMesh(entry.mesh);
      propMeshes.delete(id);
    }
  };

  const frameClock = createFrameClock(MAX_FRAME_SECONDS);
  let fps = 60;
  let frameRequest = requestAnimationFrame(function frame(now: number) {
    const frameSeconds = frameClock(now);
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const aim = input.aim();
    const sampled = buffer.sample(now / 1000);
    const vehicle = sampled?.vehicle ?? null;
    const interpolated = sampled?.players ?? [];
    const drawnPosition = reconciler.active ? (reconciler.view(frameSeconds, stepper.alpha())?.pos ?? null) : null;
    let players = interpolated;
    if (drawnPosition && latestLocal) {
      // Seat and ground come from the newest snapshot so leaving a seat switches the view at once.
      const drawn = { ...latestLocal, pos: drawnPosition, yaw: aim.yaw, seat: null, ground: null };
      players = interpolated.some((player) => player.playerId === playerId)
        ? interpolated.map((player) => (player.playerId === playerId ? drawn : player))
        : [...interpolated, drawn];
    }
    if (vehicle) {
      vehicleMesh.visible = true;
      placeVehicleMesh(vehicleMesh, vehicle);
    }
    syncPlayerMeshes(players);
    const cable = sampled?.cable;
    winchMesh.visible = vehicle !== null && cable !== undefined;
    if (vehicle && cable) {
      const mount = add(vehicle.pos, rotate(vehicle.rot, vehicleConfig.winchMount));
      const holder = cable.state === 'held' ? players.find((player) => player.playerId === cable.holderId) : undefined;
      const hook = cable.state === 'stowed' ? mount : holder ? holdPoseAt(holder.pos, holder.yaw).pos : cable.hookPos;
      placeWinchMesh(winchMesh, mount, hook, cable.state !== 'stowed');
    }
    syncPropMeshes(sampled?.props ?? [], players);

    const local = players.find((player) => player.playerId === playerId);
    const onFoot = local !== undefined && local.seat === null;
    crosshair.hidden = !onFoot;
    if (local && onFoot) {
      const head = vec3(local.pos.x, local.pos.y + PLAYER_EYE_HEIGHT, local.pos.z);
      const placement = cameraPlacement(head, aim.yaw, aim.pitch, cameraBoxes);
      camera.position.set(placement.position.x, placement.position.y, placement.position.z);
      camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    } else if (vehicle) {
      updateFollowCamera(camera, vehicle, frameSeconds);
    }
    const latestCable = buffer.latestCable();
    overlay.textContent = overlayText({
      lobby,
      config: vehicleConfig,
      tick: buffer.latestTick(),
      fps,
      vehicle,
      players,
      localId: playerId,
      predicted: drawnPosition,
      server: latestLocal?.pos ?? null,
      aim,
      propPoses: sampled?.props ?? [],
      cable: latestCable,
      anchors: course.anchors,
      status: buffer.latestStatus(),
      touch: view.touchUi !== null,
    });
    if (view.touchUi) {
      view.touchUi.update(touchView({ config: vehicleConfig, vehicle, players, localId: playerId, aim, cable: latestCable }));
      view.touchUi.setJoystick(hasJoystick(input) ? input.joystick() : null);
    }
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
      const held = new Set(snapshot.players.flatMap((player) => (player.hands === null || player.hands === 'hook' ? [] : [player.hands])));
      predictor.setProps(buffer.latestProps().filter((prop) => !held.has(prop.id)));
      const entry = snapshot.players.find((player) => player.playerId === playerId);
      latestLocal = entry ?? null;
      if (entry && predictionActive(entry)) reconciler.correct(predictedFrom(entry), snapshot.ackSeq);
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
      for (const entry of propMeshes.values()) disposePropMesh(entry.mesh);
      propMeshes.clear();
      scene.remove(winchMesh);
      disposeWinchMesh(winchMesh);
    },
  };
}
