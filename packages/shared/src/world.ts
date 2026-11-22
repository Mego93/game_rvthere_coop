import { castShot } from './shots';
import { createGolf, type GolfShot } from './golf';
import type { CharacterId } from './characters';
import type { GolfSnapshot, GolfState } from './story/primegolf';
import { createRouteIndex, type RouteIndex } from './routeAlong';
import { routeFrame } from './corridor';
import { groundHeightBelow } from './groundProbe';
import { createItemDirector, markDropped, mixSeed, planItemDrops, rearmItems, stepItemDirector, unfireItem, type ItemDropEvent } from './itemDrops';
import { createAnimals, type Animals } from './animals';
import { createEnemies, planEnemies, type Enemies, type EnemyEvent, type EnemySnapshot } from './enemies';
import { hashSeed, planAmbient, type AmbientEvent, type AnimalSnapshot } from './ambient';
import { boxesOverlap, enteredCheckpoint, insideBox, recordState, type CheckpointRecord } from './checkpoints';
import { coinTouched } from './coins';
import { DEFAULT_WEATHER, ENEMY_KNIFE_DAMAGE, ENEMY_SEED_SALT, ENEMY_VEHICLE_DAMAGE, GUN_DAMAGE, KOKE_MULTIPLIER, AMMO_BOX_ROUNDS, AMMO_MAX, GUN_COOLDOWN, GUN_RANGE, TREEDENT_SECONDS, KOKE_SECONDS, SHIELD_HP, SHIELD_SECONDS, TAJINE_HEAL, WEATHER_SEED_SALT, ANIMAL_HEALTH_FLOOR, ITEM_DROP_LIFT, ITEM_DROP_PROBE_LENGTH, ITEM_DROP_PROBE_UP, ANIMAL_HIT_DAMAGE, CORRIDOR_OOB_LANDING_OFFSET, CORRIDOR_OOB_STOP_CLEAR, CORRIDOR_OOB_PROBE_UP, OUT_OF_BOUNDS, DROP_HEIGHT, RAIN_GRIP, GRAVITY, SHOP_PRICES, STOP_OPERATE_RANGE, HEALTH_KIT_HEAL, ITEM_REFUEL, ITEM_REPAIR, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, PLAYER_RESTART_FLOOR, PLAYER_REVIVE_HEALTH, PUSH_MAX_PUSHERS_VEHICLE, RESET_HOLD, RESET_MAX_SPEED, RESET_TIPPED_UP_Y, RESTART_FLOOR, STUCK_DISTANCE, STUCK_WINDOW, TICK_DT, TICK_RATE, type Surface, type Weather, type WeatherSetting, type ShopItem } from './constants';
import { weatherAt, weatherSchedule } from './weather';
import type { BuiltCourse, Spot } from './course';
import type { SpotKind } from './story/days';
import { getCourse } from './courses/index';
import { everyoneDowned, stepDowned } from './health';
import { holdTargetValid, isSelfItem, pressTarget, stepHold, stepOperateHold, type UseContext } from './holds';
import { settleQueries } from './settle';
import { AXIS_Y, add, clamp, length, rotate, scale, sub, vec3, type Vec3 } from './math';
import { createItems } from './items';
import { inShopRange, interactCandidates, resolveInteract, splitCandidates } from './interact';
import type { ItemKind } from './constants';
import { aimRay, clearPowerUps, createPlayers, type PendingDamage, type PlayerState, type StepInputs } from './player';
import { belowWater } from './water';
import { elapsedAfter, finalTime, reachedFinish, vehicleLost } from './rules';
import { requiredPushers, type PushIntent } from './push';
import { createProps, type PropSnapshot } from './props';
import { NEUTRAL_INPUT, type AdminTool, type EventKind, type InputFields, type PlayerSnapshot } from './protocol';
import type { Rapier, RigidBody } from './rapier';
import { buildStatics } from './statics';
import { stopUsable } from './stops';
import { createVehicle, type Vehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';
import { canReel, createWinch, type CableSnapshot, type Winch } from './winch';

// m, the most a player's feet may be above or below a spot and still use it.
const SPOT_REACH_HEIGHT = 1.5;

export interface WorldOptions {
  courseId: string;
  vehicleId: string;
  // Defaults to clear. 'random' follows a seeded schedule that starts at the first step and changes every 150 to 300 s of the run.
  weather?: WeatherSetting;
  // Ambient animals on a course that has `ambient` spans; off by default.
  ambient?: boolean;
  // Tests only: replaces the plan the director follows.
  ambientPlan?: readonly AmbientEvent[];
  // Bonus item drops beside the road ahead of the vehicle, on a course that has `ambient` spans; off by default.
  itemDrops?: boolean;
  // Seed of the drop plan; defaults to the course's first-run seed.
  itemSeed?: number;
  // Tests only: replaces the drop plan, whatever the course.
  itemPlan?: readonly ItemDropEvent[];
  // Knife enemies on foot along the route; off by default.
  enemies?: boolean;
  // Seed of the enemy plan and their slips; defaults to the item seed (the run's) mixed with a salt.
  enemySeed?: number;
  // Tests only: replaces the plan the enemy director follows.
  enemyPlan?: readonly EnemyEvent[];
  // The story villa: no race win, no fuel use, no coins, and `use` at a course spot emits a spot event.
  story?: boolean;
  // A downed player is not auto-respawned: he stays down until revived (story worlds and outings).
  holdDowned?: boolean;
  // The vehicle burns no fuel without the world being a story world (the story's buggy race).
  freeFuel?: boolean;
  // The run time starts when the vehicle first moves more than START_MOVE_METRES from its spawn (the buggy race).
  startOnMove?: boolean;
}

export interface WorldEvent {
  kind: EventKind;
  tick: number;
  playerId?: string;
  pos?: Vec3;
  // 'eat': the item eaten or drunk.
  item?: ItemKind;
  // 'shot': where the ray ended (`pos` is the eye it left from) and whether it hit an enemy.
  to?: Vec3;
  hit?: boolean;
  // 'spot': the spot used.
  spotId?: string;
  spotKind?: SpotKind;
  // 'golfLand': the ring hit (null for none) and the points scored; 'golfEnd': every friend's scores.
  ring?: string | null;
  points?: number;
  scores?: GolfSnapshot['scores'];
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
  // Ambient animals alive; absent when there are none.
  animals?: AnimalSnapshot[];
  // Enemies alive (or lying for a moment); absent when there are none.
  enemies?: EnemySnapshot[];
  // The weather in force; present only when the world's setting is random.
  weather?: Weather;
  // Golf worlds once a game has started.
  golf?: GolfSnapshot;
}

// What a chained run takes from one stage's world into the next; props, items, power-ups and drops stay behind.
export interface WorldCarry {
  fuel: number;
  health: number;
  players: { id: string; health: number; ammo: number; gun: boolean; seat: string | null }[];
  coinsCollected: number;
  // Coins on the stages so far, this one included, so that collected never passes total.
  coinsTotal: number;
  wallet: number;
  respawns: number;
  assisted: boolean;
  elapsed: number;
  restarts: number;
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
  // `by` is the admin's player id; fly and infinite toggle for that player and need it.
  adminTool(tool: AdminTool, by?: string): boolean;
  // Ends fly and infinite for everyone but `keepId` (null: everyone); the room calls it when the admin changes.
  clearAdminModes(keepId: string | null): void;
  teleportPlayer(id: string, pos: Vec3): void;
  // Whether an emote may play: on foot, not downed, not respawning, nothing in the hands.
  canEmote(playerId: string): boolean;
  // Applies at once; the buy event is returned by the next step.
  buy(playerId: string, item: ShopItem): 'ok' | 'cannot_buy';
  status(): WorldStatus;
  // Restarts at the last checkpoint on the next step; does nothing once the run is won.
  restartCheckpoint(): void;
  carryOut(): WorldCarry;
  // For a fresh world: sets the carried values (clamped), continues the timer and counts, and re-records cp-0.
  applyCarry(carry: WorldCarry): void;
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
  // Tests only: puts a player in a seat of the vehicle.
  debugSeat(id: string, seatId: string): void;
  // Tests only: replaces the player's inventory.
  debugSetInventory(id: string, inventory: readonly (ItemKind | null)[]): void;
  // Golf worlds: begins the game for the friends of the roster (player id to character) and puts the first on turn at the tee.
  golfStart(roster: ReadonlyMap<string, CharacterId>): void;
  // A shot from the player on turn, accepted only while no ball is in play; false when refused.
  golfShot(playerId: string, shot: GolfShot): boolean;
  // A friend who left: his remaining balls are dropped, and the turn moves on if it was his.
  golfSkip(playerId: string): void;
  // The golf game as it stands; null outside a golf world or before the start.
  golfState(): GolfState | null;
  // Frees the physics world. The world must not be used afterwards.
  dispose(): void;
}

// The schedule is listed this far ahead; a run longer than two hours keeps the last weather.
const WEATHER_HORIZON_TICKS = 2 * 3600 * TICK_RATE;

// One non-finite number would stay in the physics state for good, so it is treated as no input.
const finite = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) ? value : 0);

// A course passed in is used instead of the id's course; tests add walls and ledges this way.
const START_MOVE_METRES = 2;

export function createWorld(rapier: Rapier, options: WorldOptions, builtCourse?: BuiltCourse): World {
  const course = builtCourse ?? getCourse(options.courseId);
  const vehicleConfig = getVehicleConfig(options.vehicleId);
  const start = course.checkpoints[0];
  if (!start) throw new Error(`Course ${course.id} has no checkpoint`);

  const physics = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  const statics = buildStatics(rapier, physics, course);
  const weatherSetting: WeatherSetting = options.weather ?? DEFAULT_WEATHER;
  const schedule = weatherSetting === 'random' ? weatherSchedule(mixSeed(options.itemSeed ?? mixSeed(hashSeed(course.id), 1), WEATHER_SEED_SALT), WEATHER_HORIZON_TICKS) : null;
  let weather: Weather = schedule ? weatherAt(schedule, 0) : (weatherSetting as Weather);
  const gripOf = (current: Weather): number => (current === 'rain' ? RAIN_GRIP : 1);
  const story = options.story === true;
  const holdDowned = options.holdDowned === true || story;
  const finishByPlayers = course.finishBy === 'players';
  const vehicle = createVehicle(rapier, physics, story || finishByPlayers || options.freeFuel === true ? { ...vehicleConfig, fuelBurn: 0 } : vehicleConfig, start.spawn, statics.surfaceOf, { gripScale: gripOf(weather) });
  // Queries see nothing until the broad phase has run once, and spawn rays are cast before the first tick.
  physics.timestep = 0;
  physics.step();
  physics.timestep = TICK_DT;

  const props = createProps(rapier, physics, course);
  const items = createItems(rapier, physics, course);
  const players = createPlayers(rapier, physics, vehicle, props, course);
  const winch = createWinch(rapier, physics, vehicle, props, course);
  const golf = createGolf(rapier, physics, course, (id, pos) => players.teleport(id, pos));
  const bounded = course.corridor !== undefined;
  const routeIndex: RouteIndex | null = options.ambient === true || options.itemDrops === true || options.enemies === true || bounded ? createRouteIndex(course.route) : null;
  // Out-of-bounds checks: the last nearest segment of each player and of the vehicle, as hints.
  const boundsHints = new Map<string, number>();
  let vehicleHint: number | undefined;
  const ambientPlan = options.ambient === true ? (options.ambientPlan ?? (course.ambient ? planAmbient(hashSeed(course.id), routeIndex!.length, course.ambient.blocked) : undefined)) : undefined;
  const animals: Animals | null = ambientPlan ? createAnimals(rapier, physics, course.route, ambientPlan) : null;
  const animalField = (): { animals?: AnimalSnapshot[] } => {
    const list = animals?.snapshot();
    return list ? { animals: list } : {};
  };
  const enemySeed = mixSeed(options.enemySeed ?? options.itemSeed ?? mixSeed(hashSeed(course.id), 1), ENEMY_SEED_SALT);
  const enemyPlan: readonly EnemyEvent[] | undefined =
    options.enemies === true ? (options.enemyPlan ?? planEnemies(enemySeed, routeIndex!.length, course.enemyCityShare !== undefined ? routeIndex!.length * (1 - course.enemyCityShare) : null, course.enemyDensity)) : undefined;
  const enemies: Enemies | null = enemyPlan ? createEnemies(rapier, physics, course.route, enemyPlan, enemySeed, statics.surfaceOf) : null;
  const enemyField = (): { enemies?: EnemySnapshot[] } => {
    const list = enemies?.snapshot();
    return list ? { enemies: list } : {};
  };
  // Enemies follow the vehicle along the route; on an on-foot course the vehicle stays parked at the end, so they follow the alive player furthest back.
  let lastFocus: Vec3 | null = null;
  const enemyFocus = (): Vec3 => {
    const parked = vehicle.body.translation();
    if (!finishByPlayers || !routeIndex) return parked;
    let back = Infinity;
    for (const player of players.all()) {
      if (player.seat !== null || player.downed !== null || player.respawnIn !== null || player.flying) continue;
      const along = routeIndex.project(player.pos.x, player.pos.z).along;
      if (along < back) {
        back = along;
        lastFocus = vec3(player.pos.x, player.pos.y, player.pos.z);
      }
    }
    return lastFocus ?? parked;
  };
  // Knife damage found by the enemies, applied with the other damage of the tick.
  let knifeDamage: PendingDamage[] = [];
  const dropPlan: readonly ItemDropEvent[] | undefined =
    options.itemDrops !== true
      ? undefined
      : (options.itemPlan ??
        (course.ambient
          ? planItemDrops(
              options.itemSeed ?? mixSeed(hashSeed(course.id), 1),
              routeIndex!.length,
              course.ambient.blocked,
              course.pickups.map((placed) => routeIndex!.project(placed.pose.pos.x, placed.pose.pos.z).along),
            )
          : undefined));
  if (dropPlan?.some((e, i) => i > 0 && e.along < dropPlan[i - 1]!.along)) throw new Error('The item drop plan must be sorted by along');
  const dropDirector = dropPlan ? createItemDirector(dropPlan) : null;
  let dropHint: number | undefined;
  const previous = new Map<string, InputFields>();
  const usePressed = new Set<string>();
  // Players whose interact press this tick resolved to operate, with the stop.
  const operatePressed = new Map<string, string>();
  // Events raised between steps; the next step returns them first.
  const queuedEvents: WorldEvent[] = [];
  let tick = 0;
  let runTicks = 0;
  let timerStarted = options.startOnMove !== true;
  let won = false;
  let restarts = 0;
  let restartPending = false;
  let respawns = 0;
  let coinsLeft: string[] = story ? [] : course.coins.map((coin) => coin.id);
  let wallet = 0;
  let coinsCollected = 0;
  // Coins of earlier stages in a chained run.
  let coinsBase = 0;
  let record: CheckpointRecord;
  let assisted = false;
  // Players whose item uses are free (the admin's infinite toggle).
  const infinite = new Set<string>();
  const held = new Map<string, { health: number; downed: boolean; inventory: (ItemKind | null)[]; ammo: number }>();
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
      // A director's drop is made again by the director, so it is not recorded.
      items: dropDirector ? items.snapshot().filter((item) => !dropDirector.owned.some((owned) => owned.itemId === item.id)) : items.snapshot(),
      players: players.all().map((player) => ({ id: player.id, inventory: player.inventory, health: player.health })),
    });
    players.setFallbackSpawn(checkpoint.spawn.pos);
  };
  recordCheckpoint(0);

  // An on-foot course is won when every alive present player stands in the finish box; with nobody alive it is not.
  const playersInFinish = (): boolean => {
    const alive = players.all().filter((player) => player.downed === null && player.respawnIn === null);
    return alive.length > 0 && alive.every((player) => insideBox(player.pos, course.finish));
  };

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
        result.set(id, { fields: { ...NEUTRAL_INPUT, yaw, pitch, slot: held }, pressed: { jump: false, interact: false, drop: false, crouch: false } });
        continue;
      }
      // Golf: the player on turn stands at the tee and only aims.
      const locked = golf?.onTurn(id) === true;
      const fields: InputFields = {
        ...raw,
        moveX: locked ? 0 : finite(raw.moveX),
        moveY: locked ? 0 : finite(raw.moveY),
        yaw: finite(raw.yaw),
        pitch: finite(raw.pitch),
        ...(locked ? { jump: false, sprint: false, crouch: false } : {}),
      };
      result.set(id, {
        fields,
        pressed: {
          jump: !locked && raw.jump === true && before.jump !== true,
          interact: raw.interact === true && before.interact !== true,
          drop: raw.drop === true && before.drop !== true,
          crouch: !locked && raw.crouch === true && before.crouch !== true,
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
        crouched: player.crouched,
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
        // No vehicle use in a golf world.
        if (golf) continue;
        // No boarding mid-slide.
        if (player.slideTicks > 0) continue;
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
      const { origin, dir } = aimRay(player.pos, fields?.yaw ?? player.yaw, fields?.pitch ?? player.pitch, player.crouched);
      const ctx: UseContext = {
        self: { id: player.id, feet: player.pos, eye: origin, aim: dir, health: player.health, onFoot: !seated && player.downed === null && player.respawnIn === null },
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
      if (!infinite.has(player.id)) player.inventory[completed.slot] = null;
      if (isSelfItem(completed.item)) {
        if (completed.item === 'treedent') player.treedent = TREEDENT_SECONDS;
        else if (completed.item === 'fromageBlanc') {
          player.shield = SHIELD_HP;
          player.shieldTime = SHIELD_SECONDS;
        } else if (completed.item === 'kokeZero') player.koke = KOKE_SECONDS;
        else if (completed.item === 'ammo') player.ammo = Math.min(AMMO_MAX, player.ammo + AMMO_BOX_ROUNDS);
        else player.health = Math.min(PLAYER_MAX_HEALTH, player.health + TAJINE_HEAL);
        events.push({ kind: 'eat', tick: tick + 1, playerId: player.id, pos: { ...player.pos }, item: completed.item });
        continue;
      }
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

  // Whether a point lies inside the chassis box; a shot from inside the vehicle does not stop at its own walls.
  const insideChassis = (point: Vec3): boolean => {
    const centre = vehicle.body.translation();
    const q = vehicle.body.rotation();
    const local = rotate({ ...q, x: -q.x, y: -q.y, z: -q.z }, vec3(point.x - centre.x, point.y - centre.y, point.z - centre.z));
    const half = vehicleConfig.halfExtents;
    return Math.abs(local.x) <= half.x && Math.abs(local.y) <= half.y && Math.abs(local.z) <= half.z;
  };

  // Rule G1 to G3: a held fire button shoots once per GUN_COOLDOWN, on foot with nothing carried, from the eye along this tick's aim.
  const stepGuns = (onFoot: ReadonlyMap<string, StepInputs>, events: WorldEvent[]) => {
    for (const player of players.all()) {
      player.gunCooldown = Math.max(0, player.gunCooldown - TICK_DT);
      const fields = onFoot.get(player.id)?.fields;
      if (fields?.fire !== true || !player.gun || player.gunCooldown > 1e-9) continue;
      if (player.seat !== null || player.downed !== null || player.respawnIn !== null || player.flying) continue;
      if (player.hands !== null && player.hands !== 'hook') continue;
      const free = infinite.has(player.id);
      if (!free && player.ammo <= 0) continue;
      if (!free) player.ammo -= 1;
      player.gunCooldown = GUN_COOLDOWN;
      const { origin, dir } = aimRay(player.pos, fields.yaw, fields.pitch, player.crouched);
      const shot = castShot(rapier, physics, origin, dir, GUN_RANGE, insideChassis(origin) ? vehicle.chassisHandle : null);
      const to = vec3(origin.x + dir.x * shot.distance, origin.y + dir.y * shot.distance, origin.z + dir.z * shot.distance);
      const hit = shot.handle !== null && enemies !== null && enemies.damage(shot.handle, GUN_DAMAGE * (player.koke > 0 ? KOKE_MULTIPLIER : 1));
      events.push({ kind: 'shot', tick: tick + 1, playerId: player.id, pos: origin, to, hit });
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
    // The fromage blanc shield takes damage before health.
    const absorbed = Math.min(player.shield, amount);
    player.shield -= absorbed;
    if (player.shield <= 1e-9) {
      player.shield = 0;
      player.shieldTime = 0;
    }
    amount -= absorbed;
    if (!(amount > 1e-9)) return;
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

  // Whether the feet are within the chassis box, so a player riding in the living area never takes a coin.
  const insideVehicle = (feet: Vec3): boolean => {
    const centre = vehicle.body.translation();
    const q = vehicle.body.rotation();
    const local = rotate({ ...q, x: -q.x, y: -q.y, z: -q.z }, vec3(feet.x - centre.x, feet.y - centre.y, feet.z - centre.z));
    const half = vehicleConfig.halfExtents;
    // A little slack above and around, so feet on the roof or the sill count as riding.
    const slack = 0.25;
    return Math.abs(local.x) <= half.x + slack && Math.abs(local.y) <= half.y + slack && Math.abs(local.z) <= half.z + slack;
  };

  // Rule V1: the first player in join order to touch a coin takes it.
  const stepCoins = (events: WorldEvent[]) => {
    if (won) return;
    for (const player of players.all()) {
      if (player.seat !== null || player.downed !== null || player.respawnIn !== null || player.flying) continue;
      if (player.ground?.bodyId === 'vehicle' || insideVehicle(player.pos)) continue;
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

  // Story worlds: a `use` press within a spot's radius emits a spot event for the nearest one; the director decides what it does.
  const stepSpots = (events: WorldEvent[]) => {
    if (!story || !course.spots) return;
    for (const player of players.all()) {
      if (!usePressed.has(player.id) || player.seat !== null || player.downed !== null || player.respawnIn !== null) continue;
      let best: Spot | null = null;
      let bestDistance = Infinity;
      for (const spot of course.spots) {
        const distance = Math.hypot(spot.pos.x - player.pos.x, spot.pos.z - player.pos.z);
        if (distance <= spot.radius && Math.abs(spot.pos.y - player.pos.y) <= SPOT_REACH_HEIGHT && distance < bestDistance) {
          best = spot;
          bestDistance = distance;
        }
      }
      if (best) events.push({ kind: 'spot', tick: tick + 1, playerId: player.id, pos: { ...best.pos }, spotId: best.id, spotKind: best.kind });
    }
  };

  // Rules H2, H6 and H7, after the characters have moved and before the kill plane.
  const stepHealth = (events: WorldEvent[]) => {
    const justDowned = new Set<string>();
    // Hits before falls; the debug damage last.
    const rank = { vehicle: 0, prop: 0, knife: 0, fall: 1, debug: 2 };
    const pending = [...players.takeDamage(), ...knifeDamage, ...debugDamage];
    debugDamage = [];
    knifeDamage = [];
    for (const player of players.all()) {
      const own = pending.filter((entry) => entry.playerId === player.id).sort((a, b) => rank[a.source] - rank[b.source]);
      for (const entry of own) hurt(player, entry.amount, events, justDowned);
    }
    for (const player of players.all()) {
      if (player.downed === null || player.respawnIn !== null || justDowned.has(player.id)) continue;
      // Rule H6 and J7: a revive hold on this player pauses the timer.
      const paused = players.all().some((other) => other.hold?.action === 'revive' && other.hold.targetId === player.id);
      if (holdDowned) continue;
      const left = stepDowned(player.downed, paused);
      if (left === 'respawn') respawnPlayer(player, events);
      else player.downed = left;
    }
    if (!holdDowned && everyoneDowned(players.all())) for (const player of players.all()) respawnPlayer(player, events);
  };

  const killPlane = (events: WorldEvent[]) => {
    for (const player of players.all()) {
      if (player.seat !== null) continue;
      if (player.respawnIn === null) {
        if (player.pos.y < course.killPlaneY || belowWater(course, player.pos)) {
          player.respawnIn = PLAYER_KILL_RESPAWN_DELAY;
          clearPowerUps(player);
        }
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
      clearPowerUps(player);
      player.hitCooldown.clear();
      if (!won) respawns += 1;
      events.push({ kind: 'respawn', tick, playerId: player.id, pos });
    }
  };

  // Rule 6 with T13: a player beyond OUT_OF_BOUNDS goes back to the road, on the side they left, with no cost.
  const stepBounds = (events: WorldEvent[]) => {
    if (!bounded || !routeIndex) return;
    const frame = routeFrame(course);
    for (const player of players.all()) {
      if (player.seat !== null || player.respawnIn !== null) continue;
      const hit = routeIndex.project(player.pos.x, player.pos.z, boundsHints.get(player.id));
      boundsHints.set(player.id, hit.segment);
      const at = routeIndex.pointAt(hit.along);
      const offX = player.pos.x - at.x;
      const offZ = player.pos.z - at.z;
      if (Math.hypot(offX, offZ) <= OUT_OF_BOUNDS) continue;
      // The right of the travel direction is (-tz, tx).
      const side = offX * -at.tz + offZ * at.tx < 0 ? -1 : 1;
      const x = at.x - at.tz * side * CORRIDOR_OOB_LANDING_OFFSET;
      const z = at.z + at.tx * side * CORRIDOR_OOB_LANDING_OFFSET;
      const onStop = course.stops.some((stop) => Math.hypot(stop.zone.center.x - x, stop.zone.center.z - z) < CORRIDOR_OOB_STOP_CLEAR);
      const spot = (onStop ? null : players.standAt(x, z, frame.heightAtAlong(hit.along) + CORRIDOR_OOB_PROBE_UP)) ?? players.findSpawn(player.id);
      releaseHook(player.id, 'stow');
      // A carried prop goes back to its spawn, and a reset hold in progress is cancelled.
      players.resetHeld(player.id);
      resetHolds.delete(player.id);
      players.teleport(player.id, spot);
      events.push({ kind: 'outOfBounds', tick, playerId: player.id, pos: { ...spot } });
    }
  };

  const vehicleOutOfBounds = (): boolean => {
    if (!bounded || !routeIndex) return false;
    const centre = vehicle.body.translation();
    const hit = routeIndex.project(centre.x, centre.z, vehicleHint);
    vehicleHint = hit.segment;
    const at = routeIndex.pointAt(hit.along);
    return Math.hypot(centre.x - at.x, centre.z - at.z) > OUT_OF_BOUNDS;
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
      clearPowerUps(player);
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
    animals?.rearm(vehicle.body.translation());
    enemies?.rearm(enemyFocus());
    knifeDamage = [];
    rearmDrops();
    restarts += 1;
    historyNext = 0;
    historyCount = 0;
    throttleTicks = 0;
    // A hold in progress starts over; a hold that already fired still needs a fresh press.
    for (const state of resetHolds.values()) state.ticks = 0;
    events.push({ kind: 'vehicleLost', tick });
  };

  const stepDrops = () => {
    if (!dropDirector || !routeIndex) return;
    const pos = vehicle.body.translation();
    const projected = routeIndex.project(pos.x, pos.z, dropHint);
    dropHint = projected.segment;
    const existing = new Set<string>();
    for (const owned of dropDirector.owned) if (items.get(owned.itemId)) existing.add(owned.itemId);
    const { drop, take } = stepItemDirector(dropDirector, { vehicleAlong: projected.along, existing });
    for (const id of take) items.take(id);
    for (const e of drop) {
      const at = routeIndex.pointAt(e.along);
      // The right of the travel direction is (-tz, tx).
      const x = at.x - at.tz * e.lateral;
      const z = at.z + at.tx * e.lateral;
      const ground = groundHeightBelow(rapier, physics, x, z, Math.max(pos.y, course.checkpoints[record.index]!.spawn.pos.y) + ITEM_DROP_PROBE_UP, ITEM_DROP_PROBE_LENGTH);
      if (ground === null) {
        unfireItem(dropDirector, e.id);
        continue;
      }
      markDropped(dropDirector, e.id, items.drop(e.kind, vec3(x, ground + ITEM_DROP_LIFT, z)));
    }
  };

  // Takes every drop the director placed and lets the events ahead fire again.
  const rearmDrops = () => {
    if (!dropDirector || !routeIndex) return;
    dropHint = undefined;
    for (const id of rearmItems(dropDirector, routeIndex.project(vehicle.body.translation().x, vehicle.body.translation().z).along)) items.take(id);
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
      if (schedule) {
        const next = weatherAt(schedule, runTicks);
        if (next !== weather) {
          weather = next;
          vehicle.setGripScale(gripOf(weather));
        }
      }
      const onFoot = stepInputsFor(inputs);
      for (const player of players.all()) player.slot = slotOf(onFoot.get(player.id)?.fields.slot ?? 0) ?? player.slot;
      const events: WorldEvent[] = queuedEvents.splice(0);
      if (golf) events.push(...golf.take(tick + 1));
      resolveInteracts(onFoot, events);
      for (const player of players.all()) if (player.seat === null && onFoot.get(player.id)?.pressed.drop) dropSelected(player);
      stepHolds(onFoot, events);
      stepSpots(events);
      stepGuns(onFoot, events);
      const taut = winch.tautObstacle();
      applyPushes(taut);
      const cable = winch.applyForces(reelInput(onFoot));
      cableTension = cable.tension;
      const driver = players.all().find((player) => player.seat === 'driver');
      const controls = driver ? onFoot.get(driver.id)?.fields : undefined;
      stepReset(onFoot, controls?.moveY ?? 0);
      animals?.step(vehicle.body.translation());
      if (enemies) {
        const targets = players
          .all()
          .filter((player) => player.seat === null && player.downed === null && player.respawnIn === null && !player.flying)
          .map((player) => ({ id: player.id, feet: player.pos }));
        for (const stab of enemies.step(enemyFocus(), targets)) {
          knifeDamage.push({ playerId: stab.playerId, source: 'knife', amount: ENEMY_KNIFE_DAMAGE });
          events.push({ kind: 'stab', tick: tick + 1, playerId: stab.playerId, pos: stab.pos });
        }
      }
      stepDrops();
      const velocityBefore = animals || enemies ? { ...vehicle.body.linvel() } : null;
      vehicle.step({
        throttle: controls?.moveY ?? 0,
        steer: controls?.moveX ?? 0,
        brake: controls?.jump ?? false,
      });
      golf?.beforeStep();
      physics.step();
      tick += 1;
      golf?.afterStep();
      if (golf) events.push(...golf.take(tick));
      players.stepOnFoot(onFoot);
      const impactSpeed = vehicle.afterPhysics();
      if (impactSpeed > 0) events.push({ kind: 'impact', tick, pos: { ...vehicle.body.translation() } });
      if (enemies && velocityBefore && !restartPending && vehicle.health() > 0) {
        const knocked = enemies.knocks({ pos: vehicle.body.translation(), rot: vehicle.body.rotation(), half: vehicleConfig.halfExtents }, Math.hypot(velocityBefore.x, velocityBefore.z));
        if (knocked > 0) vehicle.damage(ENEMY_VEHICLE_DAMAGE * knocked, ANIMAL_HEALTH_FLOOR);
      }
      if (animals && velocityBefore && !restartPending && vehicle.health() > 0) {
        for (const hit of animals.hits({ pos: vehicle.body.translation(), rot: vehicle.body.rotation(), half: vehicleConfig.halfExtents }, velocityBefore)) {
          vehicle.damage(ANIMAL_HIT_DAMAGE, ANIMAL_HEALTH_FLOOR);
          events.push({ kind: hit.kind === 'goat' ? 'goatHit' : 'scooterHit', tick, pos: hit.pos });
        }
      }
      const pulled = winch.afterCharacters((id) => players.holdPose(id));
      if (pulled !== null) players.setHands(pulled, null);
      stepCoins(events);
      stepHealth(events);
      stepBounds(events);
      killPlane(events);
      resetLastTick = new Set(props.killPlane(course.killPlaneY));
      items.killPlane(course.killPlaneY);
      for (const id of resetLastTick) winch.onPropReset(id);
      if (!won) {
        const centre = vehicle.body.translation();
        if (!timerStarted && Math.hypot(centre.x - start.spawn.pos.x, centre.z - start.spawn.pos.z) > START_MOVE_METRES) timerStarted = true;
        if (timerStarted) runTicks += 1;
        const entered = enteredCheckpoint(course, centre, record.index);
        if (entered !== null) {
          recordCheckpoint(entered);
          events.push({ kind: 'checkpoint', tick, pos: vec3(centre.x, centre.y, centre.z) });
        }
        // The pending flag lives only until this check; a manual restart also stops a win on its tick.
        if (vehicleOutOfBounds()) restartPending = true;
        const restarting = vehicleLost(centre, vehicle.health(), course.killPlaneY) || belowWater(course, centre) || restartPending;
        restartPending = false;
        if (restarting) restart(events);
        if (finishByPlayers ? !restarting && playersInFinish() : !story && reachedFinish(centre, course.finish, restarting)) won = true;
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
        ...(player.flying ? { flying: true as const } : {}),
        ...(player.gun ? { gun: true as const, ammo: player.ammo } : {}),
        ...(player.treedent > 1e-9 ? { treedent: Math.min(TREEDENT_SECONDS, Math.ceil(player.treedent * 10 - 1e-9) / 10) } : {}),
        ...(player.koke > 1e-9 ? { koke: Math.min(KOKE_SECONDS, Math.ceil(player.koke * 10 - 1e-9) / 10) } : {}),
        ...(player.shield > 1e-9 ? { shield: Math.min(SHIELD_HP, Math.ceil(player.shield - 1e-9)) } : {}),
        ...(player.slideTicks > 0 ? { stance: 'slide' as const } : player.crouched ? { stance: 'crouch' as const } : {}),
        ...(player.slideTicks > 0 || player.slideCooldown > 0 || player.launch > 0
          ? {
              slide: {
                ticks: player.slideTicks,
                cooldown: player.slideCooldown,
                air: player.slideAir,
                dirX: player.slideDir.x,
                dirZ: player.slideDir.z,
                ...(player.launch > 0 ? { launch: player.launch } : {}),
              },
            }
          : {}),
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
      coinsTotal: coinsBase + course.coins.length,
      assisted,
      ...animalField(),
      ...enemyField(),
      ...(schedule ? { weather } : {}),
      ...(golf?.snapshot() ? { golf: golf.snapshot()! } : {}),
    }),
    restartCheckpoint() {
      if (!won) restartPending = true;
    },
    carryOut: () => ({
      fuel: vehicle.fuel(),
      health: vehicle.health(),
      players: players.all().map((player) => ({ id: player.id, health: player.health, ammo: player.ammo, gun: player.gun, seat: player.seat })),
      coinsCollected,
      coinsTotal: coinsBase + course.coins.length,
      wallet,
      respawns,
      assisted,
      elapsed: elapsedAfter(runTicks),
      restarts,
    }),
    applyCarry(carry) {
      vehicle.addFuel(clamp(carry.fuel, 0, 1) - vehicle.fuel());
      vehicle.repair(clamp(carry.health, 0, 1) - vehicle.health());
      for (const saved of carry.players) {
        const player = players.get(saved.id);
        if (!player) continue;
        player.health = clamp(saved.health, 0, PLAYER_MAX_HEALTH);
        player.ammo = clamp(saved.ammo, 0, AMMO_MAX);
        player.gun = saved.gun;
        // Whoever sat when the stage ended sits in the same seat of the new vehicle.
        if (saved.seat !== null && vehicleConfig.seats.some((seat) => seat.id === saved.seat) && !players.all().some((other) => other.seat === saved.seat)) players.setSeat(saved.id, saved.seat);
      }
      coinsCollected = carry.coinsCollected;
      coinsBase = carry.coinsTotal;
      wallet = carry.wallet;
      respawns = carry.respawns;
      assisted = carry.assisted;
      runTicks = Math.round(carry.elapsed / TICK_DT);
      restarts = carry.restarts;
      recordCheckpoint(0);
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
        coinsTotal: coinsBase + course.coins.length,
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
      state.ammo = entry.ammo;
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
        if (mode === 'hold') held.set(id, { health: leaving.health, downed: leaving.downed !== null, inventory: [...leaving.inventory], ammo: leaving.ammo });
        else dropInventory(id, leaving.inventory);
      }
      players.remove(id);
      previous.delete(id);
      resetHolds.delete(id);
    },
    forgetHeld,
    recordStart: () => recordCheckpoint(0),
    adminTool(tool, by) {
      if (won) return false;
      if (tool === 'fly' || tool === 'infinite') {
        const player = by === undefined ? undefined : players.get(by);
        if (!player) return false;
        if (tool === 'fly') {
          if (player.seat !== null || player.downed !== null || player.respawnIn !== null) return false;
          player.flying = !player.flying;
          // Leaving flight drops the player from rest.
          if (!player.flying) {
            player.vy = 0;
            player.noFall = true;
          }
          if (player.flying) assisted = true;
        } else if (infinite.delete(player.id)) return true;
        else {
          infinite.add(player.id);
          assisted = true;
        }
        return true;
      }
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
      animals?.rearm(vehicle.body.translation());
      enemies?.rearm(enemyFocus());
      knifeDamage = [];
      rearmDrops();
      recordCheckpoint(next);
      const centre = vehicle.body.translation();
      queuedEvents.push({ kind: 'checkpoint', tick: tick + 1, pos: vec3(centre.x, centre.y, centre.z) });
      assisted = true;
      return true;
    },
    clearAdminModes(keepId) {
      for (const id of [...infinite]) if (id !== keepId) infinite.delete(id);
      for (const player of players.all()) {
        if (player.id === keepId || !player.flying) continue;
        player.flying = false;
        player.vy = 0;
        player.noFall = true;
      }
    },
    teleportPlayer: (id, pos) => players.teleport(id, pos),
    canEmote(id) {
      const player = players.get(id);
      return player !== undefined && player.seat === null && player.downed === null && player.respawnIn === null && player.hands === null;
    },
    buy(playerId, item) {
      const player = players.get(playerId);
      if (!Object.hasOwn(SHOP_PRICES, item)) return 'cannot_buy';
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
    golfStart: (roster) => golf?.start(roster),
    golfShot: (playerId, shot) => golf?.shot(playerId, shot) ?? false,
    golfSkip: (playerId) => golf?.skip(playerId),
    golfState: () => golf?.state() ?? null,
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces(), cableTension, wheelFrictionSlips: vehicle.wheelFrictionSlips() }),
    debugBody: (id) => (id === 'vehicle' ? vehicle.body : props.get(id)?.body ?? items.get(id)?.body),
    debugWinch: () => winch,
    debugVehicle: () => vehicle,
    debugPlayerHealth: (id) => players.get(id)!.health,
    debugSetInventory: (id, inventory) => players.restoreInventory(id, inventory),
    debugSeat: (id, seatId) => players.setSeat(id, seatId),
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
