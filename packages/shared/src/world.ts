import { enteredCheckpoint, recordState, type CheckpointRecord } from './checkpoints';
import { DROP_HEIGHT, GRAVITY, HOOK_RANGE, ITEM_REFUEL, ITEM_REPAIR, PLAYER_KILL_RESPAWN_DELAY, PUSH_HEIGHT, PUSH_MAX_PUSHERS_VEHICLE, TICK_DT, type Surface } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import { stepHold, useTarget } from './holds';
import { add, length, rotate, sub, vec3, type Vec3 } from './math';
import { createItems } from './items';
import { interactCandidates, resolveInteract, splitCandidates } from './interact';
import { createPlayers, type PlayerState, type StepInputs } from './player';
import { elapsedAfter, reachedFinish, vehicleLost } from './rules';
import { requiredPushers, type PushIntent } from './push';
import { createProps, type PropSnapshot } from './props';
import { NEUTRAL_INPUT, type InputFields, type PlayerSnapshot } from './protocol';
import type { Rapier, RigidBody } from './rapier';
import { buildStatics } from './statics';
import { createVehicle, type Vehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';
import { createWinch, type CableSnapshot, type Winch } from './winch';

export interface WorldOptions {
  courseId: string;
  vehicleId: string;
}

export interface WorldEvent {
  kind: string;
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
}

export interface WorldStatus {
  state: 'running' | 'won';
  elapsed: number;
  restarts: number;
  respawns: number;
}

export interface WorldDebug {
  forwardSpeed: number;
  wheelSurfaces: (Surface | null)[];
  // Cable tension of the last tick in newtons; 0 unless attached.
  cableTension: number;
}

export interface World {
  readonly course: BuiltCourse;
  readonly vehicleConfig: VehicleConfig;
  // Advances one fixed tick and returns that tick's events.
  step(inputs: ReadonlyMap<string, InputFields>): WorldEvent[];
  snapshot(): WorldSnapshot;
  // Placed at the first valid spawn slot.
  addPlayer(id: string): void;
  removePlayer(id: string): void;
  teleportPlayer(id: string, pos: Vec3): void;
  status(): WorldStatus;
  debug(): WorldDebug;
  // Tests only: the rigid body of the vehicle ('vehicle') or of a prop.
  debugBody(id: 'vehicle' | string): RigidBody | undefined;
  // Tests only: the winch.
  debugWinch(): Winch;
  // Tests only: the vehicle, to set its fuel and health.
  debugVehicle(): Vehicle;
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
  const vehicle = createVehicle(rapier, physics, vehicleConfig, start.spawn, statics.surfaceOf);
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
  let tick = 0;
  let runTicks = 0;
  let won = false;
  const restarts = 0;
  let respawns = 0;
  let record: CheckpointRecord;

  const recordCheckpoint = (index: number) => {
    const checkpoint = course.checkpoints[index]!;
    const heldIds = new Set(props.all().filter((prop) => prop.heldBy !== null).map((prop) => prop.id));
    record = recordState({
      index,
      fuel: vehicle.fuel(),
      health: vehicle.health(),
      props: props.snapshot(),
      heldIds,
      courseProps: course.props,
      items: items.snapshot(),
      players: players.all().map((player) => ({ id: player.id, inventory: player.inventory })),
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
      previous.set(id, raw);
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
  const resolveInteracts = (onFoot: ReadonlyMap<string, StepInputs>) => {
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
        players.pickUp(player.id, action.propId);
      } else if (action?.kind === 'pickUpItem') {
        const free = player.inventory.indexOf(null);
        if (free >= 0) {
          const kind = items.take(action.itemId);
          if (kind !== null) player.inventory[free] = kind;
        }
      } else if (action?.kind === 'attachHook') {
        if (winch.attach(action.anchorId)) players.setHands(player.id, null);
      } else if (action?.kind === 'dropHook') {
        releaseHook(player.id, 'drop');
      } else if (action?.kind === 'takeHook') {
        winch.take(player.id);
        if (winch.state().holderId === player.id) players.setHands(player.id, 'hook');
      } else if (action?.kind === 'detachHook') {
        winch.detach(player.id);
        if (winch.state().holderId === player.id) players.setHands(player.id, 'hook');
      } else if (action?.kind === 'releaseHook') {
        winch.release();
      }
    }
  };

  // Rules I8 and I9, after interact and drop so a pickup, drop or boarding this tick already counts.
  const stepHolds = (onFoot: ReadonlyMap<string, StepInputs>) => {
    const body = vehicle.body;
    const target = { pos: body.translation(), rot: body.rotation(), half: vehicleConfig.halfExtents, fuel: vehicle.fuel(), health: vehicle.health() };
    for (const player of players.all()) {
      const seated = player.seat !== null;
      const aim = useTarget(player.inventory[player.slot], player.pos, target);
      const { hold, completed } = stepHold(
        player.hold,
        { usePressed: usePressed.has(player.id), useHeld: onFoot.get(player.id)?.fields.use === true, slot: player.slot },
        player.inventory,
        seated ? null : aim,
        seated,
      );
      player.hold = hold;
      if (completed === null) continue;
      player.inventory[completed.slot] = null;
      if (completed.item === 'jerrycan') vehicle.addFuel(ITEM_REFUEL);
      else vehicle.repair(ITEM_REPAIR);
      // A second holder this tick sees the new fuel and health.
      target.fuel = vehicle.fuel();
      target.health = vehicle.health();
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
      if (player.seat !== null) continue;
      const reel = onFoot.get(player.id)?.fields.reel;
      if ((reel !== 1 && reel !== -1) || length(sub(mount, add(player.pos, vec3(0, PUSH_HEIGHT, 0)))) > HOOK_RANGE) continue;
      return reel;
    }
    return 0;
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
      respawns += 1;
      events.push({ kind: 'respawn', tick, playerId: player.id, pos });
    }
  };

  return {
    course,
    vehicleConfig,
    step(inputs) {
      const onFoot = stepInputsFor(inputs);
      for (const player of players.all()) player.slot = slotOf(onFoot.get(player.id)?.fields.slot ?? 0) ?? player.slot;
      resolveInteracts(onFoot);
      for (const player of players.all()) if (player.seat === null && onFoot.get(player.id)?.pressed.drop) dropSelected(player);
      stepHolds(onFoot);
      const taut = winch.tautObstacle();
      applyPushes(taut);
      const cable = winch.applyForces(reelInput(onFoot));
      cableTension = cable.tension;
      const driver = players.all().find((player) => player.seat === 'driver');
      const controls = driver ? onFoot.get(driver.id)?.fields : undefined;
      vehicle.step({
        throttle: controls?.moveY ?? 0,
        steer: controls?.moveX ?? 0,
        brake: controls?.jump ?? false,
      });
      physics.step();
      tick += 1;
      players.stepOnFoot(onFoot);
      vehicle.afterPhysics();
      const pulled = winch.afterCharacters((id) => players.holdPose(id));
      if (pulled !== null) players.setHands(pulled, null);
      const events: WorldEvent[] = [];
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
        const lost = vehicleLost(centre, vehicle.health(), course.killPlaneY);
        if (reachedFinish(centre, course.finish, lost)) won = true;
      }
      return events;
    },
    snapshot: () => ({
      tick,
      vehicle: vehicle.state(),
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
    }),
    status: () => ({ state: won ? 'won' : 'running', elapsed: elapsedAfter(runTicks), restarts, respawns }),
    addPlayer: (id) => void players.add(id),
    removePlayer(id) {
      releaseHook(id, 'drop');
      const leaving = players.get(id);
      if (leaving) {
        // Rule I11: at the first valid spawn slot, stacked upward.
        const spot = players.findSpawn(id);
        let level = 1;
        for (const kind of leaving.inventory) {
          if (kind === null) continue;
          items.drop(kind, vec3(spot.x, spot.y + level * DROP_HEIGHT, spot.z));
          level += 1;
        }
      }
      players.remove(id);
      previous.delete(id);
    },
    teleportPlayer: (id, pos) => players.teleport(id, pos),
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces(), cableTension }),
    debugBody: (id) => (id === 'vehicle' ? vehicle.body : props.get(id)?.body ?? items.get(id)?.body),
    debugWinch: () => winch,
    debugVehicle: () => vehicle,
    dispose() {
      players.dispose();
      props.dispose();
      items.dispose();
      physics.free();
    },
  };
}
