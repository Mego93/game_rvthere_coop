import { GRAVITY, PLAYER_KILL_RESPAWN_DELAY, TICK_DT, type Surface } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import type { Vec3 } from './math';
import { resolveInteract } from './interact';
import { createPlayers, type StepInputs } from './player';
import { createProps, type PropSnapshot } from './props';
import { NEUTRAL_INPUT, type InputFields, type PlayerSnapshot } from './protocol';
import type { Rapier, RigidBody } from './rapier';
import { chooseSeat } from './seats';
import { buildStatics } from './statics';
import { createVehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';

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
  // Every prop, course order; pos is the box centre.
  props: PropSnapshot[];
}

export interface WorldDebug {
  forwardSpeed: number;
  wheelSurfaces: (Surface | null)[];
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
  debug(): WorldDebug;
  // Tests only: the rigid body of the vehicle ('vehicle') or of a prop.
  debugBody(id: 'vehicle' | string): RigidBody | undefined;
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
  const players = createPlayers(rapier, physics, vehicle, course);
  const previous = new Map<string, InputFields>();
  let tick = 0;

  const stepInputsFor = (inputs: ReadonlyMap<string, InputFields>): Map<string, StepInputs> => {
    const result = new Map<string, StepInputs>();
    for (const { id } of players.all()) {
      const raw = inputs.get(id) ?? NEUTRAL_INPUT;
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
      previous.set(id, raw);
    }
    return result;
  };

  // Rules I1 and V3: in join order, so of two players pressing for one seat the earlier gets it.
  const resolveInteracts = (onFoot: ReadonlyMap<string, StepInputs>) => {
    for (const player of players.all()) {
      if (!onFoot.get(player.id)?.pressed.interact) continue;
      const taken = new Set<string>();
      for (const other of players.all()) if (other.seat !== null) taken.add(other.seat);
      const seatChoice =
        player.seat === null
          ? chooseSeat(vehicleConfig, vehicle.body.translation(), vehicle.body.rotation(), player.pos, taken)
          : null;
      const action = resolveInteract({ seat: player.seat, seatChoice });
      if (action?.kind === 'board') {
        players.setSeat(player.id, action.seatId);
      } else if (action?.kind === 'exitSeat') {
        const seat = vehicleConfig.seats.find((candidate) => candidate.id === player.seat);
        players.setSeat(player.id, null, (seat && players.findExit(seat)) ?? players.findSpawn(player.id));
      }
    }
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
      players.setSeat(player.id, null, pos);
      events.push({ kind: 'respawn', tick, playerId: player.id, pos });
    }
  };

  return {
    course,
    vehicleConfig,
    step(inputs) {
      const onFoot = stepInputsFor(inputs);
      resolveInteracts(onFoot);
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
      const events: WorldEvent[] = [];
      killPlane(events);
      props.killPlane(course.killPlaneY);
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
        ground: player.ground ? { bodyId: player.ground.bodyId, localPos: { ...player.ground.localPos } } : null,
        walk: { ...player.walk },
        carry: { ...player.carry },
        vy: player.vy,
        grounded: player.grounded,
      })),
      props: props.snapshot(),
    }),
    addPlayer: (id) => void players.add(id),
    removePlayer(id) {
      players.remove(id);
      previous.delete(id);
    },
    teleportPlayer: (id, pos) => players.teleport(id, pos),
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces() }),
    debugBody: (id) => (id === 'vehicle' ? vehicle.body : props.get(id)?.body),
    dispose() {
      players.dispose();
      props.dispose();
      physics.free();
    },
  };
}
