import { boxesOverlap, enteredCheckpoint, recordState, type CheckpointRecord } from './checkpoints';
import { coinTouched } from './coins';
import { DEFAULT_WEATHER, DROP_HEIGHT, RAIN_GRIP, GRAVITY, SHOP_PRICES, STOP_OPERATE_RANGE, HEALTH_KIT_HEAL, ITEM_REFUEL, ITEM_REPAIR, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, PLAYER_RESTART_FLOOR, PLAYER_REVIVE_HEALTH, PUSH_MAX_PUSHERS_VEHICLE, RESET_HOLD, RESET_MAX_SPEED, RESET_TIPPED_UP_Y, RESTART_FLOOR, STUCK_DISTANCE, STUCK_WINDOW, TICK_DT, TICK_RATE, type Surface, type Weather } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import { everyoneDowned, stepDowned } from './health';
import { holdTargetValid, pressTarget, stepHold, stepOperateHold, type UseContext } from './holds';
import { settleQueries } from './settle';
import { AXIS_Y, add, length, rotate, scale, sub, vec3, type Vec3 } from './math';
import { createItems } from './items';
import { inShopRange, interactCandidates, resolveInteract, splitCandidates } from './interact';
import type { ItemKind } from './constants';
import { aimRay, createPlayers, type PendingDamage, type PlayerState, type StepInputs } from './player';
import { elapsedAfter, finalTime, reachedFinish, vehicleLost } from './rules';
import { requiredPushers, type PushIntent } from './push';
import { createProps, type PropSnapshot } from './props';
import { NEUTRAL_INPUT, type EventKind, type InputFields, type PlayerSnapshot } from './protocol';
import type { Rapier, RigidBody } from './rapier';
import { buildStatics } from './statics';
import { stopUsable } from './stops';
import { createVehicle, type Vehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';
import { canReel, createWinch, type CableSnapshot, type Winch } from './winch';

export interface WorldOptions {
  courseId: string;
  vehicleId: string;
  // Defaults to clear.
  weather?: Weather;
}

export interface WorldEvent {
  kind: EventKind;
  tick: number;
  playerId?: string;
  pos?: Vec3;
}

export interface WorldSnapshot {
  tick: number;
  vehicle: VehicleState;
  // In join order.
  players: PlayerSnapshot[];
  // Every prop in course order, then every item; pos is the box centre.
  props: PropSnapshot[];
  cable: CableSnapshot;
  // Seconds of the run; it stops at the win.
  elapsed: number;
  // Index of the last recorded checkpoint.
  checkpoint: number;
  checkpointCount: number;
  restarts: number;
  respawns: number;
  won: boolean;
  // Ids of the coins still on the course, in course order.
  coinsLeft: string[];
  wallet: number;
  coinsCollected: number;
  coinsTotal: number;
  // True once an admin tool has been used in this run.
  assisted: boolean;
}

export interface WorldStatus {
  state: 'running' | 'won';
  elapsed: number;
  restarts: number;
  respawns: number;
  wallet: number;
  coinsCollected: number;
  coinsTotal: number;
  finalTime: number;
  assisted: boolean;
}

export interface WorldDebug {
  forwardSpeed: number;
  wheelSurfaces: (Surface | null)[];
  // Cable tension of the last tick in newtons; 0 unless attached.
  cableTension: number;
  wheelFrictionSlips: number[];
}

export interface World {
  readonly course: BuiltCourse;
  readonly vehicleConfig: VehicleConfig;
  // Advances one fixed tick and returns that tick's events.
  step(inputs: ReadonlyMap<string, InputFields>): WorldEvent[];
  snapshot(): WorldSnapshot;
  // Placed at the first valid spawn slot.
  addPlayer(id: string): void;
  // 'leave' drops the inventory at a spawn slot; 'hold' keeps health, downed and inventory for addPlayer.
  removePlayer(id: string, mode?: 'leave' | 'hold'): void;
  // Drops a held player's inventory at a spawn slot and forgets them; nothing for an unknown id.
  forgetHeld(id: string): void;
  // Re-records cp-0 with the players present.
  recordStart(): void;
  // Applies at once; false when it did nothing (won, or no next checkpoint).
  adminTool(tool: 'skipCheckpoint' | 'refill'): boolean;
  teleportPlayer(id: string, pos: Vec3): void;
  // Applies at once; the buy event is returned by the next step.
  buy(playerId: string, item: ItemKind): 'ok' | 'cannot_buy';
  status(): WorldStatus;
  // Restarts at the last checkpoint on the next step; does nothing once the run is won.
  restartCheckpoint(): void;
  debug(): WorldDebug;
  // Tests only: the rigid body of the vehicle ('vehicle') or of a prop.
  debugBody(id: 'vehicle' | string): RigidBody | undefined;
  // Tests only: the winch.
  debugWinch(): Winch;
  // Tests only: the vehicle, to set its fuel and health.
  debugVehicle(): Vehicle;
  // Tests only: queues damage for the player, applied on the next step.
  debugHurt(id: string, amount: number): void;
  // Tests only: the player's health before the snapshot rounds it down.
  debugPlayerHealth(id: string): number;
  // Tests only: replaces the player's inventory.
  debugSetInventory(id: string, inventory: readonly (ItemKind | null)[]): void;
  // Frees the physics world. The world must not be used afterwards.
  dispose(): void;
}

// One non-finite number would stay in the physics state for good, so it is treated as no input.
const finite = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) ? value : 0);

// A course passed in is used instead of the id's course; tests add walls and ledges this way.
export function createWorld(rapier: Rapier, options: WorldOptions, builtCourse?: BuiltCourse): World {
  const course = builtCourse ?? getCourse(options.courseId);
  const vehicleConfig = getVehicleConfig(options.vehicleId);
  const start = course.checkpoints[0];
  if (!start) throw new Error(`Course ${course.id} has no checkpoint`);

  const physics = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  const statics = buildStatics(rapier, physics, course);
  const vehicle = createVehicle(rapier, physics, vehicleConfig, start.spawn, statics.surfaceOf, {
    gripScale: (options.weather ?? DEFAULT_WEATHER) === 'rain' ? RAIN_GRIP : 1,
  });
  // Queries see nothing until the broad phase has run once, and spawn rays are cast before the first tick.
  physics.timestep = 0;
  physics.step();
  physics.timestep = TICK_DT;

  const props = createProps(rapier, physics, course);
  const items = createItems(rapier, physics, course);
  const players = createPlayers(rapier, physics, vehicle, props, course);
  const winch = createWinch(rapier, physics, vehicle, props, course);
  const previous = new Map<string, InputFields>();
  const usePressed = new Set<string>();
  // Players whose interact press this tick resolved to operate, with the stop.
  const operatePressed = new Map<string, string>();
  // Events raised between steps; the next step returns them first.
  const queuedEvents: WorldEvent[] = [];
  let tick = 0;
  let runTicks = 0;
  let won = false;
  let restarts = 0;
  let restartPending = false;
  let respawns = 0;
  let coinsLeft = course.coins.map((coin) => coin.id);
  let wallet = 0;
  let coinsCollected = 0;
  let record: CheckpointRecord;
  let assisted = false;
  const held = new Map<string, { health: number; downed: boolean; inventory: (ItemKind | null)[] }>();
  let debugDamage: PendingDamage[] = [];
  // Each player's reset hold, private to the world; `spent` waits for a release before it can count again.
  const resetHolds = new Map<string, { ticks: number; spent: boolean }>();
  const stuckWindowTicks = Math.round(STUCK_WINDOW * TICK_RATE);
  const resetHoldTicks = Math.round(RESET_HOLD * TICK_RATE);
  // The vehicle centre over the last window as a ring: the slot at `historyNext` is the oldest once the ring is full; emptied by a restart.
  const centreHistory: Vec3[] = Array.from({ length: stuckWindowTicks + 1 }, () => vec3(0, 0, 0));
  let historyNext = 0;
  let historyCount = 0;
  let throttleTicks = 0;
  let resetReady = false;

  const recordCheckpoint = (index: number) => {
    const checkpoint = course.checkpoints[index]!;
    const heldIds = new Set(props.all().filter((prop) => prop.heldBy !== null).map((prop) => prop.id));
    record = recordState({
      index,
      fuel: vehicle.fuel(),
      health: vehicle.health(),
      coinsLeft,
      wallet,
      coinsCollected,
      props: props.snapshot(),
      heldIds,
      courseProps: course.props,
      items: items.snapshot(),
      players: players.all().map((player) => ({ id: player.id, inventory: player.inventory, health: player.health })),
    });
    players.setFallbackSpawn(checkpoint.spawn.pos);
  };
  recordCheckpoint(0);

  const stepInputsFor = (inputs: ReadonlyMap<string, InputFields>): Map<string, StepInputs> => {
    const result = new Map<string, StepInputs>();
    usePressed.clear();
    for (const { id, slot } of players.all()) {
      const raw = inputs.get(id) ?? { ...NEUTRAL_INPUT, slot };
      const before = previous.get(id) ?? NEUTRAL_INPUT;
      previous.set(id, raw);
      const downed = players.get(id)!.downed !== null;
      if (downed) {
        // Rule H5: a downed player's input is neutral; previous still records the raw one.
        const { yaw, pitch, slot: held } = players.get(id)!;
        result.set(id, { fields: { ...NEUTRAL_INPUT, yaw, pitch, slot: held }, pressed: { jump: false, interact: false, drop: false } });
        continue;
      }
      const fields: InputFields = {
        ...raw,
        moveX: finite(raw.moveX),
        moveY: finite(raw.moveY),
        yaw: finite(raw.yaw),
        pitch: finite(raw.pitch),
      };
      result.set(id, {
        fields,
        pressed: {
          jump: raw.jump === true && before.jump !== true,
          interact: raw.interact === true && before.interact !== true,
          drop: raw.drop === true && before.drop !== true,
        },
      });
      if (raw.use === true && before.use !== true) usePressed.add(id);
    }
    return result;
  };

  // Rule V6: the world owns the hook. A player's hook is stowed or dropped at their feet, then their hands are cleared.
  const releaseHook = (id: string, how: 'stow' | 'drop') => {
    const player = players.get(id);
    if (!player || player.hands !== 'hook') return;
    if (how === 'stow') winch.stow();
    else winch.drop(player.pos);
    players.setHands(id, null);
  };

  const slotOf = (value: number): 0 | 1 | 2 | null => (value === 0 || value === 1 || value === 2 ? value : null);

  // Rule I10: the selected item appears at the feet, at rest.
  const dropSelected = (player: PlayerState) => {
    const kind = player.inventory[player.slot];
    if (kind === null || kind === undefined) return;
    player.inventory[player.slot] = null;
    items.drop(kind, vec3(player.pos.x, player.pos.y + DROP_HEIGHT, player.pos.z));
  };

  // Rules I1, V3, K1 and K2: in join order, so of two players pressing for one seat or crate the earlier gets it.
  // The aim is this tick's input (R6), not the yaw the player ended the last tick with.
  const stopById = (id: string) => course.stops.find((stop) => stop.id === id);

  const stopsContext = () => {
    const centre = vehicle.body.translation();
    return course.stops.map((stop) => ({
      id: stop.id,
      kind: stop.kind,
      operatePoint: stop.operatePoint,
      shopCounter: stop.shopCounter,
      usable: stopUsable(stop, centre, vehicle.fuel(), vehicle.health()),
    }));
  };

  const resolveInteracts = (onFoot: ReadonlyMap<string, StepInputs>, events: WorldEvent[]) => {
    operatePressed.clear();
    for (const player of players.all()) {
      const step = onFoot.get(player.id);
      if (!step?.pressed.interact) continue;
      const taken = new Set<string>();
      for (const other of players.all()) if (other.seat !== null) taken.add(other.seat);
      const heldProps = new Set(props.all().filter((prop) => prop.heldBy !== null).map((prop) => prop.id));
      const found = interactCandidates({
        config: vehicleConfig,
        vehiclePos: vehicle.body.translation(),
        vehicleRot: vehicle.body.rotation(),
        feet: player.pos,
        yaw: step.fields.yaw,
        pitch: step.fields.pitch,
        seat: player.seat,
        hands: player.hands,
        takenSeats: taken,
        props: props.snapshot(),
        items: items.snapshot(),
        freeSlot: player.inventory.includes(null),
        heldProps,
        cable: winch.state(),
        anchors: course.anchors,
        stops: stopsContext(),
      });
      const action = resolveInteract({
        seat: player.seat,
        hands: player.hands,
        holdsHook: player.hands === 'hook',
        ...splitCandidates(found),
      });
      if (action?.kind === 'board') {
        // Unreachable with the hook in the hands (interact drops it first); kept so a seat never holds it.
        releaseHook(player.id, 'stow');
        players.setSeat(player.id, action.seatId);
      } else if (action?.kind === 'exitSeat') {
        const seat = vehicleConfig.seats.find((candidate) => candidate.id === player.seat);
        players.setSeat(player.id, null, (seat && players.findExit(seat)) ?? players.findSpawn(player.id));
      } else if (action?.kind === 'throw') {
        players.throwHeld(player.id, step.fields.yaw, step.fields.pitch);
      } else if (action?.kind === 'pickUp') {
        const prop = props.get(action.propId);
        const at = prop ? { ...prop.body.translation() } : undefined;
        if (players.pickUp(player.id, action.propId) && at) events.push({ kind: 'pickup', tick: tick + 1, playerId: player.id, pos: at });
      } else if (action?.kind === 'pickUpItem') {
        const free = player.inventory.indexOf(null);
        if (free >= 0) {
          const item = items.get(action.itemId);
          const at = item ? { ...item.body.translation() } : undefined;
          const kind = items.take(action.itemId);
          if (kind !== null) {
            player.inventory[free] = kind;
            events.push({ kind: 'pickup', tick: tick + 1, playerId: player.id, ...(at ? { pos: at } : {}) });
          }
        }
      } else if (action?.kind === 'attachHook') {
        if (winch.attach(action.anchorId)) {
          players.setHands(player.id, null);
          events.push({ kind: 'hookAttach', tick: tick + 1, playerId: player.id, pos: { ...winch.state().hookPos } });
        }
      } else if (action?.kind === 'dropHook') {
        releaseHook(player.id, 'drop');
      } else if (action?.kind === 'takeHook') {
        winch.take(player.id);
        if (winch.state().holderId === player.id) players.setHands(player.id, 'hook');
      } else if (action?.kind === 'detachHook') {
        const before = winch.state();
        winch.detach(player.id);
        if (before.state === 'attached') events.push({ kind: 'hookDetach', tick: tick + 1, playerId: player.id, pos: { ...before.hookPos } });
        if (winch.state().holderId === player.id) players.setHands(player.id, 'hook');
      } else if (action?.kind === 'releaseHook') {
        const before = winch.state();
        winch.release();
        if (before.state === 'attached') events.push({ kind: 'hookDetach', tick: tick + 1, playerId: player.id, pos: { ...before.hookPos } });
      } else if (action?.kind === 'operate') {
        // Rule V6: an item hold running blocks it, as does an operate hold already running.
        if (player.hold === null) operatePressed.set(player.id, action.stopId);
      }
      // A 'shop' action does nothing on the server (rule V5a).
    }
  };

  // Rules I8, I9, H9, H10 and J1, after interact and drop so a pickup, drop or boarding this tick already counts.
  const stepHolds = (onFoot: ReadonlyMap<string, StepInputs>, events: WorldEvent[]) => {
    const body = vehicle.body;
    const vehicleView = { pos: body.translation(), rot: body.rotation(), half: vehicleConfig.halfExtents, fuel: vehicle.fuel(), health: vehicle.health() };
    for (const player of players.all()) {
      const seated = player.seat !== null;
      const fields = onFoot.get(player.id)?.fields;
      // The aim is this tick's input, as for interact (R6).
      const { origin, dir } = aimRay(player.pos, fields?.yaw ?? player.yaw, fields?.pitch ?? player.pitch);
      const ctx: UseContext = {
        self: { id: player.id, feet: player.pos, eye: origin, aim: dir, health: player.health },
        vehicle: vehicleView,
        players: players
          .all()
          .filter((other) => other.id !== player.id)
          .map((other) => ({ id: other.id, feet: other.pos, health: other.health, downed: other.downed, seated: other.seat !== null })),
      };
      const operating = player.hold?.action === 'operate' || (player.hold === null && operatePressed.has(player.id));
      if (operating) {
        const stopId = player.hold ? player.hold.targetId : operatePressed.get(player.id)!;
        const stop = stopById(stopId);
        const usable = stop !== undefined && stopUsable(stop, body.translation(), vehicle.fuel(), vehicle.health());
        const near = stop !== undefined && length(sub(stop.operatePoint, player.pos)) <= STOP_OPERATE_RANGE;
        const { hold, completed } = stepOperateHold(
          player.hold?.action === 'operate' ? player.hold : null,
          { interactPressed: operatePressed.has(player.id), interactHeld: fields?.interact === true },
          usable && near ? stopId : null,
          seated || player.downed !== null,
        );
        player.hold = hold;
        if (completed !== null && stop) {
          if (stop.kind === 'fuel') vehicle.addFuel(1);
          else vehicle.repair(1);
          vehicleView.fuel = vehicle.fuel();
          vehicleView.health = vehicle.health();
          events.push({ kind: 'use', tick: tick + 1, playerId: player.id, pos: { ...stop.operatePoint } });
        }
        continue;
      }
      const running = player.hold?.action === 'operate' ? null : player.hold;
      const target = running
        ? holdTargetValid(running, ctx) ? { id: running.targetId, revive: running.action === 'revive' } : null
        : pressTarget(player.inventory[player.slot], ctx);
      const { hold, completed } = stepHold(
        running,
        { usePressed: usePressed.has(player.id), useHeld: fields?.use === true, slot: player.slot },
        player.inventory,
        seated ? null : target,
        seated || player.downed !== null,
      );
      player.hold = hold;
      if (completed === null) continue;
      player.inventory[completed.slot] = null;
      if (completed.targetId === 'vehicle') {
        if (completed.item === 'jerrycan') vehicle.addFuel(ITEM_REFUEL);
        else vehicle.repair(ITEM_REPAIR);
        // A second holder this tick sees the new fuel and health.
        vehicleView.fuel = vehicle.fuel();
        vehicleView.health = vehicle.health();
        events.push({ kind: 'use', tick: tick + 1, playerId: player.id, pos: { ...body.translation() } });
        continue;
      }
      const patient = players.get(completed.targetId);
      if (!patient) continue;
      if (completed.action === 'revive') {
        players.revive(patient.id, PLAYER_REVIVE_HEALTH);
        // Stamped with the tick this step produces, like every other event.
        events.push({ kind: 'revive', tick: tick + 1, playerId: patient.id, pos: { ...patient.pos } });
      } else {
        patient.health = Math.min(PLAYER_MAX_HEALTH, patient.health + HEALTH_KIT_HEAL);
        if (patient.downed === null) events.push({ kind: 'use', tick: tick + 1, playerId: player.id, pos: { ...patient.pos } });
      }
    }
  };

  let resetLastTick = new Set<string>();
  let cableTension = 0;

  // Rule H4 with R10: the pushes found last tick, minus those whose body or player has changed since.
  const applyPushes = (taut: string | null) => {
    const live = players.takePushIntents().filter((intent) => {
      const player = players.get(intent.playerId);
      if (!player || player.seat !== null) return false;
      if (intent.bodyId === 'vehicle') return true;
      const prop = props.get(intent.bodyId);
      return prop !== undefined && prop.heldBy === null && !resetLastTick.has(prop.id);
    });
    const apply = (intent: PushIntent, body: RigidBody) =>
      body.applyImpulseAtPoint({ x: intent.force.x * TICK_DT, y: 0, z: intent.force.z * TICK_DT }, intent.point, true);
    const vehicleIntents = live.filter((intent) => intent.bodyId === 'vehicle').slice(0, PUSH_MAX_PUSHERS_VEHICLE);
    for (const intent of vehicleIntents) apply(intent, vehicle.body);
    const needed = requiredPushers(players.all().length);
    for (const prop of props.all()) {
      const own = live.filter((intent) => intent.bodyId === prop.id);
      if (prop.config.class === 'heavy') {
        const unlocked = prop.id === taut || new Set(own.map((intent) => intent.playerId)).size >= needed;
        if (unlocked === prop.locked) props.setLocked(prop.id, !unlocked);
        if (!unlocked) continue;
      }
      for (const intent of own) apply(intent, prop.body);
    }
  };

  // Rule W5: the driver's reel wins, else the first player on foot at the winch box.
  const reelInput = (onFoot: ReadonlyMap<string, StepInputs>): -1 | 0 | 1 => {
    const driver = players.all().find((player) => player.seat === 'driver');
    const driverReel = driver ? onFoot.get(driver.id)?.fields.reel : 0;
    if (driverReel === 1 || driverReel === -1) return driverReel;
    const body = vehicle.body;
    const mount = add(body.translation(), rotate(body.rotation(), vehicleConfig.winchMount));
    for (const player of players.all()) {
      if (!canReel(player, mount)) continue;
      const reel = onFoot.get(player.id)?.fields.reel;
      if (reel === 1 || reel === -1) return reel;
    }
    return 0;
  };

  // Rule H2.
  const hurt = (player: PlayerState, amount: number, events: WorldEvent[], justDowned: Set<string>) => {
    if (!(amount > 0) || player.seat !== null || player.downed !== null || player.respawnIn !== null) return;
    player.health = Math.max(0, player.health - amount);
    events.push({ kind: 'hurt', tick, playerId: player.id, pos: { ...player.pos } });
    if (player.health > 0) return;
    releaseHook(player.id, 'drop');
    players.setDowned(player.id);
    justDowned.add(player.id);
    events.push({ kind: 'downed', tick, playerId: player.id, pos: { ...player.pos } });
  };

  const respawnPlayer = (player: PlayerState, events: WorldEvent[]) => {
    const pos = players.respawn(player.id);
    if (!won) respawns += 1;
    events.push({ kind: 'respawn', tick, playerId: player.id, pos });
  };

  // Rule R1: slow, and upturned, stuck under throttle for a full window, or out of fuel.
  const resetConditions = (driverThrottle: number): boolean => {
    const centre = vehicle.body.translation();
    centreHistory[historyNext] = vec3(centre.x, centre.y, centre.z);
    historyNext = (historyNext + 1) % centreHistory.length;
    historyCount = Math.min(historyCount + 1, centreHistory.length);
    throttleTicks = driverThrottle > 0 ? throttleTicks + 1 : 0;
    const v = vehicle.body.linvel();
    if (Math.hypot(v.x, v.y, v.z) >= RESET_MAX_SPEED) return false;
    if (rotate(vehicle.body.rotation(), AXIS_Y).y < RESET_TIPPED_UP_Y) return true;
    if (vehicle.fuel() <= 0) return true;
    return throttleTicks >= stuckWindowTicks && historyCount === centreHistory.length && length(sub(centre, centreHistory[historyNext]!)) < STUCK_DISTANCE;
  };

  // Rule R2: a seated player holding reset while the conditions hold restarts from the checkpoint.
  const stepReset = (onFoot: ReadonlyMap<string, StepInputs>, driverThrottle: number) => {
    resetReady = false;
    if (won) {
      resetHolds.clear();
      return;
    }
    const eligible = resetConditions(driverThrottle);
    let fire = false;
    for (const player of players.all()) {
      const pressing = onFoot.get(player.id)?.fields.reset === true;
      const able = eligible && player.seat !== null && player.downed === null;
      if (able) resetReady = true;
      const entry = resetHolds.get(player.id);
      if (!pressing) {
        resetHolds.delete(player.id);
        continue;
      }
      const state = entry ?? { ticks: 0, spent: false };
      resetHolds.set(player.id, state);
      if (state.spent) continue;
      state.ticks = able ? state.ticks + 1 : 0;
      if (state.ticks >= resetHoldTicks) fire = true;
    }
    if (!fire) return;
    restartPending = true;
    // Whoever is still holding needs a fresh press for the next reset.
    for (const state of resetHolds.values()) Object.assign(state, { ticks: 0, spent: true });
  };

  // Rule V1: the first player in join order to touch a coin takes it.
  const stepCoins = (events: WorldEvent[]) => {
    if (won) return;
    for (const player of players.all()) {
      if (player.seat !== null || player.downed !== null || player.respawnIn !== null) continue;
      for (const id of coinsLeft) {
        const coin = course.coins.find((candidate) => candidate.id === id)!;
        if (!coinTouched(player.pos, coin.pose.pos)) continue;
        coinsLeft = coinsLeft.filter((left) => left !== id);
        wallet += 1;
        coinsCollected += 1;
        events.push({ kind: 'coin', tick, playerId: player.id, pos: { ...coin.pose.pos } });
      }
    }
  };

  // Rules H2, H6 and H7, after the characters have moved and before the kill plane.
  const stepHealth = (events: WorldEvent[]) => {
    const justDowned = new Set<string>();
    // Hits before falls; the debug damage last.
    const rank = { vehicle: 0, prop: 0, fall: 1, debug: 2 };
    const pending = [...players.takeDamage(), ...debugDamage];
    debugDamage = [];
    for (const player of players.all()) {
      const own = pending.filter((entry) => entry.playerId === player.id).sort((a, b) => rank[a.source] - rank[b.source]);
      for (const entry of own) hurt(player, entry.amount, events, justDowned);
    }
    for (const player of players.all()) {
      if (player.downed === null || player.respawnIn !== null || justDowned.has(player.id)) continue;
      // Rule H6 and J7: a revive hold on this player pauses the timer.
      const paused = players.all().some((other) => other.hold?.action === 'revive' && other.hold.targetId === player.id);
      const left = stepDowned(player.downed, paused);
      if (left === 'respawn') respawnPlayer(player, events);
      else player.downed = left;
    }
    if (everyoneDowned(players.all())) for (const player of players.all()) respawnPlayer(player, events);
  };

  const killPlane = (events: WorldEvent[]) => {
    for (const player of players.all()) {
      if (player.seat !== null) continue;
      if (player.respawnIn === null) {
        if (player.pos.y < course.killPlaneY) player.respawnIn = PLAYER_KILL_RESPAWN_DELAY;
        continue;
      }
      player.respawnIn -= TICK_DT;
      if (player.respawnIn > 1e-9) continue;
      const pos = players.findSpawn(player.id);
      releaseHook(player.id, 'stow');
      players.resetHeld(player.id);
      players.setSeat(player.id, null, pos);
      player.health = PLAYER_REVIVE_HEALTH;
      player.downed = null;
      player.hitCooldown.clear();
      if (!won) respawns += 1;
      events.push({ kind: 'respawn', tick, playerId: player.id, pos });
    }
  };

  // Steps shared by restart and skipCheckpoint; `between` runs after the vehicle moves and before the physics steps.
  const placeCrew = (index: number, fuel: number, health: number, between: () => void) => {
    const checkpoint = course.checkpoints[index]!;
    winch.stow();
    for (const player of players.all()) {
      releaseHook(player.id, 'stow');
      players.setHands(player.id, null);
      player.hold = null;
      player.respawnIn = null;
    }
    players.takePushIntents();
    for (const player of players.all()) players.setSeat(player.id, null);
    vehicle.resetTo(checkpoint.spawn, fuel, health);
    between();
    // Assumes the probe sees the scene after the retries; if not, findSpawn falls back to the checkpoint spawn.
    settleQueries(rapier, physics, () => vehicle.body.translation(), TICK_DT);
    players.setFallbackSpawn(checkpoint.spawn.pos);
    for (const player of players.all()) {
      players.setSeat(player.id, null, players.findSpawn(player.id));
      player.hitCooldown.clear();
    }
    resetLastTick = new Set();
    cableTension = 0;
  };

  const spawnBox = (index: number) => {
    const { spawn } = course.checkpoints[index]!;
    return {
      center: add(spawn.pos, rotate(spawn.rot, scale(AXIS_Y, vehicleConfig.rideHeight))),
      halfExtents: vehicleConfig.halfExtents,
      rot: spawn.rot,
    };
  };

  // Rule K3 in the order of Q1 and Q7: the world is put right first, the players last.
  const restart = (events: WorldEvent[]) => {
    const checkpoint = course.checkpoints[record.index]!;
    placeCrew(record.index, Math.max(record.fuel, RESTART_FLOOR), Math.max(record.health, RESTART_FLOOR), () => {
      const vehicleBox = spawnBox(record.index);
      for (const prop of props.all()) {
        const recorded = record.props.get(prop.id);
        if (recorded && !boxesOverlap({ center: recorded.centre, halfExtents: prop.config.halfExtents, rot: recorded.rot }, vehicleBox)) {
          props.placeAtRest(prop.id, recorded.centre, recorded.rot);
        } else {
          props.resetToSpawn(prop.id);
        }
      }
      items.restore(record.items);
      // A purchase queued before the restart is rolled back with the wallet, so it emits nothing.
      for (let i = events.length - 1; i >= 0; i--) if (events[i]!.kind === 'buy') events.splice(i, 1);
      coinsLeft = [...record.coinsLeft];
      wallet = record.wallet;
      coinsCollected = record.coinsCollected;
    });
    for (const player of players.all()) {
      const saved = record.players.get(player.id);
      players.restoreInventory(player.id, saved?.inventory ?? []);
      player.health = saved ? Math.max(saved.health, PLAYER_RESTART_FLOOR) : PLAYER_MAX_HEALTH;
      player.downed = null;
    }
    // A held player is restored like a present one.
    for (const [id, entry] of held) {
      const saved = record.players.get(id);
      entry.inventory = saved ? [...saved.inventory] : [null, null, null];
      entry.health = saved ? Math.max(saved.health, PLAYER_RESTART_FLOOR) : PLAYER_MAX_HEALTH;
      entry.downed = false;
    }
    let level = 1;
    for (const [id, saved] of record.players) {
      if (players.get(id) || held.has(id)) continue;
      for (const kind of saved.inventory) {
        if (kind === null) continue;
        const at = checkpoint.spawn.pos;
        items.drop(kind, vec3(at.x, at.y + level * DROP_HEIGHT, at.z));
        level += 1;
      }
    }
    restarts += 1;
    historyNext = 0;
    historyCount = 0;
    throttleTicks = 0;
    // A hold in progress starts over; a hold that already fired still needs a fresh press.
    for (const state of resetHolds.values()) state.ticks = 0;
    events.push({ kind: 'vehicleLost', tick });
  };

  // Rule I11: at the first valid spawn slot, stacked upward.
  const dropInventory = (id: string, inventory: readonly (ItemKind | null)[]) => {
    const spot = players.findSpawn(id);
    let level = 1;
    for (const kind of inventory) {
      if (kind === null) continue;
      items.drop(kind, vec3(spot.x, spot.y + level * DROP_HEIGHT, spot.z));
      level += 1;
    }
  };

  const forgetHeld = (id: string) => {
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    dropInventory(id, entry.inventory);
  };

  return {
    course,
    vehicleConfig,
    step(inputs) {
      const onFoot = stepInputsFor(inputs);
      for (const player of players.all()) player.slot = slotOf(onFoot.get(player.id)?.fields.slot ?? 0) ?? player.slot;
      const events: WorldEvent[] = queuedEvents.splice(0);
      resolveInteracts(onFoot, events);
      for (const player of players.all()) if (player.seat === null && onFoot.get(player.id)?.pressed.drop) dropSelected(player);
      stepHolds(onFoot, events);
      const taut = winch.tautObstacle();
      applyPushes(taut);
      const cable = winch.applyForces(reelInput(onFoot));
      cableTension = cable.tension;
      const driver = players.all().find((player) => player.seat === 'driver');
      const controls = driver ? onFoot.get(driver.id)?.fields : undefined;
      stepReset(onFoot, controls?.moveY ?? 0);
      vehicle.step({
        throttle: controls?.moveY ?? 0,
        steer: controls?.moveX ?? 0,
        brake: controls?.jump ?? false,
      });
      physics.step();
      tick += 1;
      players.stepOnFoot(onFoot);
      const impactSpeed = vehicle.afterPhysics();
      if (impactSpeed > 0) events.push({ kind: 'impact', tick, pos: { ...vehicle.body.translation() } });
      const pulled = winch.afterCharacters((id) => players.holdPose(id));
      if (pulled !== null) players.setHands(pulled, null);
      stepCoins(events);
      stepHealth(events);
      killPlane(events);
      resetLastTick = new Set(props.killPlane(course.killPlaneY));
      items.killPlane(course.killPlaneY);
      for (const id of resetLastTick) winch.onPropReset(id);
      if (!won) {
        runTicks += 1;
        const centre = vehicle.body.translation();
        const entered = enteredCheckpoint(course, centre, record.index);
        if (entered !== null) {
          recordCheckpoint(entered);
          events.push({ kind: 'checkpoint', tick, pos: vec3(centre.x, centre.y, centre.z) });
        }
        // The pending flag lives only until this check; a manual restart also stops a win on its tick.
        const restarting = vehicleLost(centre, vehicle.health(), course.killPlaneY) || restartPending;
        restartPending = false;
        if (restarting) restart(events);
        if (reachedFinish(centre, course.finish, restarting)) won = true;
      }
      return events;
    },
    snapshot: () => ({
      tick,
      vehicle: resetReady ? { ...vehicle.state(), resetReady: true } : vehicle.state(),
      players: players.all().map((player) => ({
        playerId: player.id,
        pos: { ...player.pos },
        yaw: player.yaw,
        seat: player.seat,
        hands: player.hands,
        ground: player.ground ? { bodyId: player.ground.bodyId, localPos: { ...player.ground.localPos } } : null,
        walk: { ...player.walk },
        carry: { ...player.carry },
        vy: player.vy,
        grounded: player.grounded,
        inventory: [...player.inventory],
        slot: player.slot,
        health: Math.floor(player.health),
        downed: player.downed,
        hold: player.hold ? { action: player.hold.action, targetId: player.hold.targetId, progress: player.hold.progress } : null,
      })),
      props: [...props.snapshot(), ...items.snapshot()],
      cable: winch.state(),
      elapsed: elapsedAfter(runTicks),
      checkpoint: record.index,
      checkpointCount: course.checkpoints.length,
      restarts,
      respawns,
      won,
      coinsLeft: [...coinsLeft],
      wallet,
      coinsCollected,
      coinsTotal: course.coins.length,
      assisted,
    }),
    restartCheckpoint() {
      if (!won) restartPending = true;
    },
    status() {
      const elapsed = elapsedAfter(runTicks);
      return {
        state: won ? 'won' : 'running',
        elapsed,
        restarts,
        respawns,
        wallet,
        coinsCollected,
        coinsTotal: course.coins.length,
        finalTime: finalTime({ elapsed, restarts, respawns, wallet }),
        assisted,
      };
    },
    addPlayer(id) {
      const entry = held.get(id);
      held.delete(id);
      const state = players.add(id);
      if (!entry) return;
      players.restoreInventory(id, entry.inventory);
      if (!entry.downed) {
        state.health = entry.health;
        return;
      }
      state.health = PLAYER_REVIVE_HEALTH;
      if (!won) respawns += 1;
      queuedEvents.push({ kind: 'respawn', tick: tick + 1, playerId: id, pos: { ...state.pos } });
    },
    removePlayer(id, mode = 'leave') {
      releaseHook(id, 'drop');
      const leaving = players.get(id);
      // A held id has no character; leaving it for good frees what it held.
      if (!leaving && mode === 'leave') forgetHeld(id);
      if (leaving) {
        if (mode === 'hold') held.set(id, { health: leaving.health, downed: leaving.downed !== null, inventory: [...leaving.inventory] });
        else dropInventory(id, leaving.inventory);
      }
      players.remove(id);
      previous.delete(id);
      resetHolds.delete(id);
    },
    forgetHeld,
    recordStart: () => recordCheckpoint(0),
    adminTool(tool) {
      if (won) return false;
      if (tool === 'refill') {
        vehicle.addFuel(1);
        vehicle.repair(1);
        assisted = true;
        return true;
      }
      const next = record.index + 1;
      if (next >= course.checkpoints.length) return false;
      placeCrew(next, vehicle.fuel(), vehicle.health(), () => {
        const vehicleBox = spawnBox(next);
        for (const prop of props.all()) {
          const box = { center: prop.body.translation(), halfExtents: prop.config.halfExtents, rot: prop.body.rotation() };
          if (prop.heldBy !== null || boxesOverlap(box, vehicleBox)) props.resetToSpawn(prop.id);
        }
      });
      recordCheckpoint(next);
      const centre = vehicle.body.translation();
      queuedEvents.push({ kind: 'checkpoint', tick: tick + 1, pos: vec3(centre.x, centre.y, centre.z) });
      assisted = true;
      return true;
    },
    teleportPlayer: (id, pos) => players.teleport(id, pos),
    buy(playerId, item) {
      const player = players.get(playerId);
      if (!player || player.seat !== null || player.downed !== null || player.respawnIn !== null || won) return 'cannot_buy';
      const stop = course.stops.find((candidate) => inShopRange(player.pos, candidate));
      const free = player.inventory.indexOf(null);
      if (!stop?.shopCounter || wallet < SHOP_PRICES[item] || free < 0) return 'cannot_buy';
      wallet -= SHOP_PRICES[item];
      player.inventory[free] = item;
      // Stamped with the tick the next step produces, like every other event.
      queuedEvents.push({ kind: 'buy', tick: tick + 1, playerId, pos: { ...stop.shopCounter } });
      return 'ok';
    },
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces(), cableTension, wheelFrictionSlips: vehicle.wheelFrictionSlips() }),
    debugBody: (id) => (id === 'vehicle' ? vehicle.body : props.get(id)?.body ?? items.get(id)?.body),
    debugWinch: () => winch,
    debugVehicle: () => vehicle,
    debugPlayerHealth: (id) => players.get(id)!.health,
    debugSetInventory: (id, inventory) => players.restoreInventory(id, inventory),
    debugHurt(id, amount) {
      debugDamage.push({ playerId: id, source: 'debug', amount });
    },
    dispose() {
      players.dispose();
      props.dispose();
      items.dispose();
      physics.free();
    },
  };
}
