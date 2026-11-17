import {
  NEUTRAL_INPUT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  add,
  dot,
  rotate,
  createPredictor,
  getCourse,
  getCourseDef,
  getVehicleConfig,
  holdPoseAt,
  isCrouchedStance,
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
import { createPlayerMesh, disposePlayerMesh, LABEL_RANGE, placePlayerMesh, setNameVisible } from './render/playerMesh';
import { createCoinMeshes } from './render/coinMesh';
import { createAnimalMeshes } from './render/animalMeshes';
import { createPropMesh, disposePropMesh, placePropMesh } from './render/propMesh';
import { applyConditions, conditionsLook, configureRenderer } from './render/conditions';
import { applySky, hasSky } from './render/environment';
import { createDecorRenderer } from './render/decorRenderer';
import { scatterDecor, seedFromId } from './render/decorScatter';
import { createScene } from './render/scene';
import { disposeScene } from './render/disposeScene';
import { FIRST_PERSON_FOV, onFootPose, seatedPose } from './render/firstPersonCamera';
import { cameraPlacement } from './render/shoulderCamera';
import { createWinchMesh, disposeWinchMesh, placeWinchMesh } from './render/winchMesh';
import { createSeatRing, createVehicleMesh, disposeSeatRing, placeSeatRing, placeVehicleMesh } from './render/vehicleMesh';
import { createEventToast } from './ui/hud/eventToast';
import { createSeatAnnouncer } from './ui/hud/seatToast';
import { interactAction, overlayText, type OverlayData } from './ui/overlay';
import { createHud } from './ui/hud/hud';
import { buildHudModel } from './ui/hud/hudModel';
import { projectMarker } from './ui/hud/downedMarkers';
import { CLOSED, createShopMenu, gateControl, menuFeet, menuInput, shopMenuState, type ShopMenuState } from './ui/shopMenu';
import { createRunMenu, inputFrozen, runMenuState, type RunMenuEvent, type RunMenuState } from './ui/runMenu';
import { isChatKey } from './ui/chat';
import type { TouchUi } from './ui/touchUi';
import { touchView } from './ui/touchView';

// Survives a restart of the run, so an F3 toggle sticks; the stored flag only sets the first value.
let debugShown = (() => {
  try {
    return localStorage.getItem('lodgy.debug') === '1';
  } catch {
    return false;
  }
})();

// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;
// The camera eye eases to a new stance's height in about this long.
const EYE_EASE_SECONDS = 0.1;
const LOOPS = ['engine', 'winch', 'rain'] as const;

export interface Game {
  setLobby(lobby: LobbyMessage): void;
  pushSnapshot(snapshot: SnapshotMessage): void;
  // Plays the sound of a server event as it arrives.
  onEvent(message: EventMessage): void;
  // The controls panel or the tutorial opened or closed: the game stands still, and Esc is not the game's while it is open.
  setControlsOpen(open: boolean): void;
  // The chat panel opened or closed: the game stands still while it is open.
  setChatOpen(open: boolean): void;
  // Opens the chat through the page when no menu or panel is open during a run; the touch Chat button uses it like T does.
  requestChat(): void;
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
  softwareGl?: boolean;
  // The first-person camera prototype (?fp); off by default.
  firstPerson?: boolean;
  onMute: () => void;
  onHelp: () => void;
  onTutorial: () => void;
  // Whether the controls panel is open when the game starts.
  controlsOpen: boolean;
  // Whether the chat panel is open when the game starts.
  chatOpen: boolean;
  // T was pressed in a state where chat may open; the page opens its panel.
  onChat: () => void;
}

const stanceFields = (stance: PlayerSnapshot['stance']): Pick<PlayerSnapshot, 'stance'> | Record<string, never> => (stance === undefined ? {} : { stance });

// Draws one run: sends an input every tick and shows the vehicle and the players from the server's snapshots.
export function createGame(
  view: GameView,
  playerId: string,
  firstLobby: LobbyMessage,
  send: (message: ClientMessage) => void,
): Game {
  const { renderer, overlay, crosshair, rapier } = view;
  let lobby = firstLobby;
  const colourIn = (message: LobbyMessage) => message.players.find((info) => info.playerId === playerId)?.colour ?? '#ffffff';
  let ownColour = colourIn(firstLobby);
  const course = getCourse(lobby.courseId);
  const cameraBoxes = [...course.ground, ...course.walls];
  const scene = createScene(course, { lite: view.touchUi !== null, flat: view.softwareGl === true });
  const decor = createDecorRenderer(scatterDecor(course, getCourseDef(course.id), seedFromId(course.id)), course.route, { touch: view.touchUi !== null, softwareGl: view.softwareGl === true });
  scene.add(decor.group);
  const vehicleConfig = getVehicleConfig(lobby.vehicleId);
  const look = conditionsLook(firstLobby.timeOfDay, firstLobby.weather);
  const isTouch = view.touchUi !== null;
  // Software GL cannot afford shadows or image-based light.
  const shadows = !isTouch && !view.softwareGl;
  const imageLight = hasSky(firstLobby.timeOfDay, firstLobby.weather) && !view.softwareGl;
  const conditions = applyConditions(scene, look, isTouch, vehicleConfig.halfExtents, imageLight, shadows);
  applySky(renderer, scene, look, firstLobby.timeOfDay, imageLight, firstLobby.weather);
  configureRenderer(renderer, look, shadows);
  const vehicleMesh = createVehicleMesh(vehicleConfig, view.softwareGl);
  vehicleMesh.visible = false;
  scene.add(vehicleMesh);
  const seatRing = createSeatRing();
  const seatAnnouncer = createSeatAnnouncer();
  const eventToast = createEventToast();
  const winchMesh = createWinchMesh();
  winchMesh.visible = false;
  scene.add(winchMesh);
  const coinMeshes = createCoinMeshes(scene, course.coins);
  const animalMeshes = createAnimalMeshes(scene);
  const firstPerson = view.firstPerson === true;
  const camera = new THREE.PerspectiveCamera(firstPerson ? FIRST_PERSON_FOV : 60, 1, 0.1, 1000);
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
  const playerMeshes = new Map<string, { mesh: THREE.Group; name: string; colour: string; look: string }>();
  const propMeshes = new Map<string, { mesh: THREE.Object3D; kind: string }>();
  // The local player's entry in the newest snapshot, not interpolated.
  let latestLocal: PlayerSnapshot | null = null;
  let seq = 0;
  // What the last frame drew, for resolving an interact press the way the hint does.
  let lastVehicle: VehicleState | null = null;
  let lastPlayers: PlayerSnapshot[] = [];
  let lastProps: PropSnapshot[] = [];
  let lastDrawn: Vec3 | null = null;
  // The local stance the last frame drew: predicted while the reconciler is active, else the newest snapshot's.
  let drawnStance: PlayerSnapshot['stance'];
  // The camera eye's height above the feet, eased between the standing and crouched heights.
  let eyeHeight = PLAYER_EYE_HEIGHT;
  let menuState: ShopMenuState = CLOSED;
  let wasInteract = false;
  let lastSent: InputFields = NEUTRAL_INPUT;

  const gate = gateControl(view.pointerGate);
  let runState: RunMenuState = { open: false };
  let controlsOpen = view.controlsOpen;
  let chatOpen = view.chatOpen;
  const anyOpen = () => menuState.open || runState.open || controlsOpen || chatOpen;
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
    onHelp: view.onHelp,
    onTutorial: view.onTutorial,
  });
  runMenu.setMuted(view.muted);
  const hudRoot = document.createElement('div');
  document.body.append(hudRoot);
  const hud = createHud(hudRoot, { touch: view.touchUi !== null, route: course.route, finish: { x: course.finish.center.x, z: course.finish.center.z } });
  const markerPoint = new THREE.Vector3();
  const project = (point: Vec3) => markerPoint.set(point.x, point.y, point.z).project(camera);
  const cameraSpaceZ = (point: Vec3) => markerPoint.set(point.x, point.y, point.z).applyMatrix4(camera.matrixWorldInverse).z;
  // The debug overlay keeps updating while hidden.
  overlay.hidden = !debugShown;
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
    for (const id of ['touch-menu', 'touch-chat']) {
      const button = document.getElementById(id);
      if (button) button.hidden = lobby.phase !== 'playing';
    }
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
  const requestChat = () => {
    if (lobby.phase === 'playing' && !anyOpen()) view.onChat();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'F3') {
      event.preventDefault();
      if (!event.repeat) overlay.hidden = debugShown = !debugShown;
      return;
    }
    // anyOpen() covers the run menu, the shop, help, the tutorial and an open chat; the page's own T check skips fields.
    if (isChatKey(event, event.target instanceof Element ? event.target.tagName : null)) {
      // Without this the T would be typed into the input that opening focuses.
      event.preventDefault();
      requestChat();
      return;
    }
    if (event.code !== 'Escape' || event.repeat) return;
    if (menuState.open) refreshMenu(menuFeet(lastDrawn, latestLocal?.pos ?? null), null, true);
    else if (lobby.phase === 'playing') applyRun('esc');
  };
  window.addEventListener('keydown', onKeyDown);
  // The frame loop starts the loops again when the tab is visible.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') for (const loop of LOOPS) audio.setLoop(loop, false);
  };
  document.addEventListener('visibilitychange', onVisibility);
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
        { ...latestLocal, pos: feet, ...stanceFields(drawnStance) },
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

  // Seated players are hidden, not removed; meshes are remade when a player's name, colour or look changes, and dropped when they leave.
  const syncPlayerMeshes = (players: PlayerSnapshot[], seconds: number) => {
    const present = new Set<string>();
    for (const player of players) {
      const info = lobby.players.find((candidate) => candidate.playerId === player.playerId);
      if (!info) continue;
      present.add(player.playerId);
      const { characterId, glasses, top, hat, skin, eyes, smile } = info.appearance;
      const look = `${characterId}|${glasses}|${top}|${hat}|${skin}|${eyes}|${smile}`;
      let entry = playerMeshes.get(player.playerId);
      if (entry && (entry.name !== info.name || entry.colour !== info.colour || entry.look !== look)) {
        scene.remove(entry.mesh);
        disposePlayerMesh(entry.mesh);
        entry = undefined;
      }
      if (!entry) {
        entry = { mesh: createPlayerMesh(info.name, info.colour, info.appearance), name: info.name, colour: info.colour, look };
        playerMeshes.set(player.playerId, entry);
        scene.add(entry.mesh);
      }
      entry.mesh.visible = player.seat === null && !(firstPerson && player.playerId === playerId);
      placePlayerMesh(entry.mesh, player, seconds);
      setNameVisible(entry.mesh, player.playerId !== playerId && Math.hypot(player.pos.x - camera.position.x, player.pos.y - camera.position.y, player.pos.z - camera.position.z) <= LABEL_RANGE);
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
    const predictedView = reconciler.active ? reconciler.view(frameSeconds, stepper.alpha()) : null;
    const drawnPosition = predictedView?.pos ?? null;
    drawnStance = predictedView ? (predictedView.sliding ? 'slide' : predictedView.crouched ? 'crouch' : undefined) : latestLocal?.stance;
    let players = interpolated;
    if (drawnPosition && latestLocal) {
      // Seat and ground come from the newest snapshot so leaving a seat switches the view at once.
      const { stance: _server, ...rest } = latestLocal;
      const drawn: PlayerSnapshot = { ...rest, ...stanceFields(drawnStance), pos: drawnPosition, yaw: aim.yaw, seat: null, ground: null };
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
    syncPlayerMeshes(players, frameSeconds);
    const cable = sampled?.cable;
    winchMesh.visible = vehicle !== null && cable !== undefined;
    if (vehicle && cable) {
      const mount = add(vehicle.pos, rotate(vehicle.rot, vehicleConfig.winchMount));
      const holder = cable.state === 'held' ? players.find((player) => player.playerId === cable.holderId) : undefined;
      const hook = cable.state === 'stowed' ? mount : holder ? holdPoseAt(holder.pos, holder.yaw).pos : cable.hookPos;
      placeWinchMesh(winchMesh, mount, hook, cable.state !== 'stowed');
    }
    syncPropMeshes(sampled?.props ?? [], players);
    animalMeshes.update(sampled?.animals ?? []);

    const local = players.find((player) => player.playerId === playerId);
    const onFoot = local !== undefined && local.seat === null;
    crosshair.hidden = !onFoot;
    if (local && onFoot) {
      const eyeTarget = isCrouchedStance(drawnStance) ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
      eyeHeight += (eyeTarget - eyeHeight) * (1 - Math.exp(-frameSeconds / EYE_EASE_SECONDS));
      const head = vec3(local.pos.x, local.pos.y + eyeHeight, local.pos.z);
      const placement = firstPerson ? onFootPose(local.pos, eyeHeight, aim.yaw, aim.pitch) : cameraPlacement(head, aim.yaw, aim.pitch, cameraBoxes);
      camera.position.set(placement.position.x, placement.position.y, placement.position.z);
      camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    } else if (vehicle) {
      eyeHeight = PLAYER_EYE_HEIGHT;
      const seatedEye = firstPerson && local?.seat ? seatedPose(vehicle.pos, vehicle.rot, vehicleConfig, local.seat, aim.yaw, aim.pitch) : null;
      if (seatedEye) {
        camera.position.set(seatedEye.position.x, seatedEye.position.y, seatedEye.position.z);
        camera.lookAt(seatedEye.target.x, seatedEye.target.y, seatedEye.target.z);
      } else {
        updateFollowCamera(camera, vehicle, frameSeconds);
      }
    }
    const latestCable = buffer.latestCable();
    const overlayData: OverlayData = {
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
      ...(local && onFoot ? { eye: eyeHeight } : {}),
    };
    overlay.textContent = overlayText(overlayData);
    const hudModel = buildHudModel(overlayData, { checkpoints: course.checkpoints, finish: course.finish });
    const announced = seatAnnouncer.update(hudModel.ownSeat, now / 1000);
    placeSeatRing(seatRing, vehicleMesh, vehicleConfig, hudModel.ownSeat?.id ?? null, ownColour, announced.ringAge);
    camera.updateMatrixWorld();
    const markers = hudModel.downedOthers.map((other) => {
      const projected = projectMarker(project, cameraSpaceZ, other.pos, window.innerWidth, window.innerHeight);
      return { id: other.id, name: other.name, seconds: other.seconds, ...projected };
    });
    hud.update(hudModel, markers, announced.toast ?? eventToast.current(now / 1000));
    hud.setVisible(lobby.phase === 'playing' && !anyOpen());
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
    if (vehicle && winchOn(latestCable, lobby.phase)) audio.setLoop('winch', true, { at: add(vehicle.pos, rotate(vehicle.rot, vehicleConfig.winchMount)) });
    else audio.setLoop('winch', false);
    audio.setLoop('rain', rainOn(lobby.weather), { volume: 0.3 });
    decor.update(camera.position, now / 1000);
    conditions.update(camera.position, frameSeconds, local && onFoot ? local.pos : vehicle ? vehicle.pos : camera.position);
    conditions.setLights(vehicle, players);
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(frame);
  });

  return {
    setLobby(next) {
      lobby = next;
      ownColour = colourIn(next);
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
      if (sound) audio.play(sound.kind, { ...(sound.positional ? { at: message.pos } : {}), ...(sound.volume === undefined ? {} : { volume: sound.volume }) });
      eventToast.show(message.kind, performance.now() / 1000);
    },
    setControlsOpen(open) {
      controlsOpen = open;
      if (open) releaseLock();
      gate.follow(frozen());
    },
    requestChat,
    setChatOpen(open) {
      chatOpen = open;
      // Before the lock is released the panel's focus would leave the pointer captured.
      if (open) releaseLock();
      gate.follow(frozen());
    },
    setMuted: (muted) => runMenu.setMuted(muted),
    showShopError: () => shopMenu.showError(),
    stop() {
      cancelAnimationFrame(frameRequest);
      for (const loop of LOOPS) audio.setLoop(loop, false);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      view.touchUi?.onMenu(() => {});
      gate.release();
      shopMenu.dispose();
      runMenu.dispose();
      hud.dispose();
      disposeSeatRing(seatRing);
      coinMeshes.dispose();
      animalMeshes.dispose();
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
      decor.dispose();
      disposeScene(scene);
    },
  };
}
