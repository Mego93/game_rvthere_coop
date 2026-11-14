import {
  NEUTRAL_INPUT,
  PLAYER_EYE_HEIGHT,
  add,
  dot,
  rotate,
  createPredictor,
  getCourse,
  getVehicleConfig,
  holdPoseAt,
  predictedFrom,
  vec3,
  type ClientMessage,
  type EventMessage,
  type InputFields,
  type InteractAction,
  type ItemKind,
  type LobbyMessage,
  type PlayerSnapshot,
  type PropSnapshot,
  type Rapier,
  type SnapshotMessage,
  type Vec3,
  type VehicleState,
} from '@lodgy/shared';
import * as THREE from 'three';
import { engineRate, rainOn, winchOn } from './audio/engine';
import type { GameAudio } from './audio/audio';
import { soundFor } from './audio/soundMap';
import type { GameInput } from './input/source';
import { hasJoystick } from './input/touch';
import { createFixedStepper, createFrameClock } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { predictionActive } from './prediction/gate';
import { createReconciler } from './prediction/reconciler';
import { updateFollowCamera } from './render/followCamera';
import { createPlayerMesh, disposePlayerMesh, placePlayerMesh } from './render/playerMesh';
import { createCoinMeshes } from './render/coinMesh';
import { createPropMesh, disposePropMesh, placePropMesh } from './render/propMesh';
import { applyConditions, conditionsLook } from './render/conditions';
import { createScene } from './render/scene';
import { disposeScene } from './render/disposeScene';
import { cameraPlacement } from './render/shoulderCamera';
import { createWinchMesh, disposeWinchMesh, placeWinchMesh } from './render/winchMesh';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { interactAction, overlayText } from './ui/overlay';
import { CLOSED, createShopMenu, gateControl, menuFeet, menuInput, shopMenuState, type ShopMenuState } from './ui/shopMenu';
import { createRunMenu, inputFrozen, runMenuState, type RunMenuEvent, type RunMenuState } from './ui/runMenu';
import type { TouchUi } from './ui/touchUi';
import { touchView } from './ui/touchView';

// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;

export interface Game {
  setLobby(lobby: LobbyMessage): void;
  pushSnapshot(snapshot: SnapshotMessage): void;
  // Plays the sound of a server event as it arrives.
  onEvent(message: EventMessage): void;
  // Shows the mute state in the run menu.
  setMuted(muted: boolean): void;
  // Shows "Cannot buy" in the shop menu if it is open.
  showShopError(): void;
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
  // The mouse source's click gate; blocked while the shop menu is open.
  pointerGate: { blocked: boolean };
  // The page's one audio; the game turns its loops off when it stops but does not dispose it.
  audio: GameAudio;
  muted: boolean;
  onMute: () => void;
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
  const conditions = applyConditions(scene, conditionsLook(firstLobby.timeOfDay, firstLobby.weather), view.touchUi !== null, vehicleConfig.halfExtents);
  const vehicleMesh = createVehicleMesh(vehicleConfig);
  vehicleMesh.visible = false;
  scene.add(vehicleMesh);
  const winchMesh = createWinchMesh();
  winchMesh.visible = false;
  scene.add(winchMesh);
  const coinMeshes = createCoinMeshes(scene, course.coins);
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
  // What the last frame drew, for resolving an interact press the way the hint does.
  let lastVehicle: VehicleState | null = null;
  let lastPlayers: PlayerSnapshot[] = [];
  let lastProps: PropSnapshot[] = [];
  let lastDrawn: Vec3 | null = null;
  let menuState: ShopMenuState = CLOSED;
  let wasInteract = false;
  let lastSent: InputFields = NEUTRAL_INPUT;

  const gate = gateControl(view.pointerGate);
  let runState: RunMenuState = { open: false };
  const anyOpen = () => menuState.open || runState.open;
  const frozen = () => inputFrozen(anyOpen(), lobby.phase);
  // The lock change this causes is not the player's Esc.
  let releasedByGame = false;
  const releaseLock = () => {
    if (document.pointerLockElement !== renderer.domElement) return;
    releasedByGame = true;
    document.exitPointerLock();
  };
  const applyRun = (event: RunMenuEvent) => {
    const was = runState.open;
    runState = runMenuState(runState, event, menuState.open, lobby.phase === 'playing');
    if (runState.open === was) return;
    runMenu.setOpen(runState.open);
    if (runState.open) {
      if (menuState.open) {
        menuState = { open: false, feet: menuState.feet };
        shopMenu.setOpen(false);
      }
      releaseLock();
    }
    gate.follow(frozen());
  };
  const closeRun = (action: ClientMessage | null) => {
    if (action) send(action);
    applyRun('resume');
  };
  const runMenu = createRunMenu(document, {
    onResume: () => closeRun(null),
    onRestartCheckpoint: () => closeRun({ type: 'restartCheckpoint' }),
    onRestartCourse: () => closeRun({ type: 'restartCourse' }),
    onToLobby: () => closeRun({ type: 'toLobby' }),
    onSkip: () => closeRun({ type: 'adminTool', tool: 'skipCheckpoint' }),
    onRefill: () => closeRun({ type: 'adminTool', tool: 'refill' }),
    onKick: (target) => closeRun({ type: 'kick', playerId: target }),
    onMute: view.onMute,
  });
  runMenu.setMuted(view.muted);
  const { audio } = view;
  // The first snapshot of a game does not count as a win.
  let wasWon: boolean | null = null;
  const forward = new THREE.Vector3();
  // The menu is rebuilt only when its content changes, so a click is not lost to a rebuild.
  let runMenuKey = '';
  const updateRunMenu = () => {
    const isAdmin = lobby.adminId === playerId;
    const kickable = lobby.players.filter((entry) => entry.playerId !== playerId).map((entry) => ({ playerId: entry.playerId, name: entry.name }));
    const key = isAdmin ? JSON.stringify(kickable) : '';
    if (runMenuKey === `${isAdmin}${key}`) return;
    runMenuKey = `${isAdmin}${key}`;
    runMenu.update(isAdmin, kickable);
  };
  // The corner button is only for the run.
  const showMenuButton = () => {
    const button = document.getElementById('touch-menu');
    if (button) button.hidden = lobby.phase !== 'playing';
  };
  updateRunMenu();
  showMenuButton();
  view.touchUi?.onMenu(() => applyRun('button'));
  const refreshMenu = (feet: Vec3 | null, press: InteractAction | null, dismiss: boolean) => {
    const was = menuState.open;
    menuState = shopMenuState(menuState, {
      feet,
      seated: latestLocal === null || latestLocal.seat !== null,
      downed: latestLocal === null || latestLocal.downed !== null,
      won: buffer.latestStatus()?.won ?? false,
      stops: course.stops,
      press,
      dismiss,
    });
    if (menuState.open !== was) {
      shopMenu.setOpen(menuState.open);
      if (menuState.open) {
        applyRun('shopOpened');
        releaseLock();
      }
      gate.follow(frozen());
    }
    if (menuState.open) shopMenu.setWallet(buffer.latestStatus()?.wallet ?? 0);
  };
  const shopMenu = createShopMenu(document, {
    onBuy: (item: ItemKind) => send({ type: 'buy', item }),
    onClose: () => refreshMenu(menuFeet(lastDrawn, latestLocal?.pos ?? null), null, true),
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || event.repeat) return;
    if (menuState.open) refreshMenu(menuFeet(lastDrawn, latestLocal?.pos ?? null), null, true);
    else if (lobby.phase === 'playing') applyRun('esc');
  };
  window.addEventListener('keydown', onKeyDown);
  // Browsers swallow the Esc that releases the lock, so a lock lost on its own opens the menu.
  const onLockChange = () => {
    if (document.pointerLockElement === renderer.domElement) return;
    if (releasedByGame) {
      releasedByGame = false;
      return;
    }
    if (lobby.phase === 'playing' && !anyOpen()) applyRun('button');
  };
  document.addEventListener('pointerlockchange', onLockChange);

  const stepper = createFixedStepper(() => {
    seq += 1;
    const sampled = input.sample();
    const pressed = sampled.interact && !wasInteract;
    wasInteract = sampled.interact;
    const fields = menuInput(frozen(), sampled, lastSent);
    if (!frozen()) lastSent = fields;
    send({ type: 'input', ...fields, seq });
    reconciler.record(seq, fields);
    if (pressed && !frozen() && latestLocal && lastVehicle) {
      const feet = menuFeet(lastDrawn, latestLocal.pos)!;
      const action = interactAction(
        vehicleConfig,
        lastVehicle,
        { ...latestLocal, pos: feet },
        lastPlayers,
        sampled.yaw,
        sampled.pitch,
        lastProps,
        buffer.latestCable(),
        course.anchors,
        course.stops,
      );
      refreshMenu(feet, action, false);
    }
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
    lastVehicle = vehicle;
    lastPlayers = players;
    lastProps = sampled?.props ?? [];
    lastDrawn = drawnPosition;
    coinMeshes.update(new Set(buffer.latestCoinsLeft()), now / 1000);
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
      stops: course.stops,
      targetTime: course.targetTime,
      touch: view.touchUi !== null,
    });
    if (view.touchUi) {
      view.touchUi.update(touchView({ config: vehicleConfig, vehicle, players, localId: playerId, aim, cable: latestCable }));
      view.touchUi.setJoystick(hasJoystick(input) ? input.joystick() : null);
    }
    audio.setListener(camera.position, camera.getWorldDirection(forward));
    const playing = lobby.phase === 'playing';
    if (vehicle && playing) {
      const speed = dot(vehicle.linvel, rotate(vehicle.rot, vec3(0, 0, -1)));
      const seated = latestLocal !== null && latestLocal.seat !== null;
      audio.setLoop('engine', true, { rate: engineRate(speed, vehicleConfig.maxSpeed, vehicle.throttle), volume: seated ? 0.35 : 0.2, at: vehicle.pos });
    } else audio.setLoop('engine', false);
    if (vehicle && winchOn(latestCable)) audio.setLoop('winch', true, { at: add(vehicle.pos, rotate(vehicle.rot, vehicleConfig.winchMount)) });
    else audio.setLoop('winch', false);
    audio.setLoop('rain', rainOn(lobby.weather), { volume: 0.3 });
    conditions.update(camera.position, frameSeconds);
    conditions.setLights(vehicle, players);
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(frame);
  });

  return {
    setLobby(next) {
      lobby = next;
      updateRunMenu();
      showMenuButton();
      if (next.phase === 'playing') {
        gate.follow(frozen());
        return;
      }
      applyRun('phaseLeft');
      releaseLock();
      gate.follow(true);
      if (menuState.open) {
        menuState = { open: false, feet: menuState.feet };
        shopMenu.setOpen(false);
        gate.follow(frozen());
      }
    },
    pushSnapshot(snapshot) {
      buffer.push(snapshot, performance.now() / 1000);
      const won = buffer.latestStatus()?.won ?? false;
      if (wasWon === false && won) audio.play('win');
      wasWon = won;
      predictor.setVehicle(snapshot.vehicle.pos, snapshot.vehicle.rot);
      const held = new Set(snapshot.players.flatMap((player) => (player.hands === null || player.hands === 'hook' ? [] : [player.hands])));
      predictor.setProps(buffer.latestProps().filter((prop) => !held.has(prop.id)));
      const entry = snapshot.players.find((player) => player.playerId === playerId);
      latestLocal = entry ?? null;
      refreshMenu(menuFeet(lastDrawn, latestLocal?.pos ?? null), null, false);
      if (entry && predictionActive(entry)) reconciler.correct(predictedFrom(entry), snapshot.ackSeq);
      else reconciler.suspend();
    },
    onEvent(message) {
      const sound = soundFor(message, playerId);
      if (sound) audio.play(sound.kind, sound.positional ? { at: message.pos } : undefined);
    },
    setMuted: (muted) => runMenu.setMuted(muted),
    showShopError: () => shopMenu.showError(),
    stop() {
      cancelAnimationFrame(frameRequest);
      for (const loop of ['engine', 'winch', 'rain'] as const) audio.setLoop(loop, false);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      view.touchUi?.onMenu(() => {});
      gate.release();
      shopMenu.dispose();
      runMenu.dispose();
      coinMeshes.dispose();
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
      conditions.dispose();
      disposeScene(scene);
    },
  };
}
