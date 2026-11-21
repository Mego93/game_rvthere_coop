import type { CharacterId } from './characters';
import { TICK_DT } from './constants';
import type { BuiltCourse } from './course';
import { GROUP_GROUND, GROUP_ITEM, groups } from './groups';
import { add, clamp, degToRad, vec3, type Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import {
  GOLF_BALL_RADIUS, GOLF_CURVE_ACCEL, GOLF_LAUNCH_PITCH, GOLF_MAX_SPEED, GOLF_RINGS, GOLF_SCOREBOARD_SECONDS, GOLF_SETTLE_SECONDS, golfTurn, recordBall, scoreLanding, skipFriend, startGolf,
  type GolfSnapshot, type GolfState,
} from './story/primegolf';
import type { WorldEvent } from './world';

// m above the tee, where the club meets the ball; clear of the mat so the ball does not start in contact.
export const GOLF_LAUNCH_HEIGHT = 1;
// kg, a golf ball.
const BALL_MASS = 0.0459;

export interface GolfShot {
  yaw: number;
  power: number;
  curve: number;
}

type DraftEvent = Omit<WorldEvent, 'tick'>;

interface Ball {
  // Null once the ball has landed and is only reported.
  body: RigidBody | null;
  collider: ReturnType<RapierWorld['createCollider']>;
  owner: CharacterId;
  // The right of the heading, a unit vector on the ground plane.
  right: Vec3;
  curve: number;
  age: number;
  // Seconds the landed ball stays reported while the scoreboard shows; null while in flight.
  shown: number | null;
  pos: Vec3;
}

export interface Golf {
  // Begins the game for the friends in the roster (player id to character); the player on turn is put at the tee.
  start(roster: ReadonlyMap<string, CharacterId>): void;
  // Launches a ball for the player on turn when none is in play; false when refused.
  shot(playerId: string, shot: GolfShot): boolean;
  // A friend who left: his remaining balls are dropped.
  skip(playerId: string): void;
  // Whether the player is on turn: he cannot walk.
  onTurn(playerId: string): boolean;
  state(): GolfState | null;
  // Before the physics step: the curve.
  beforeStep(): void;
  // After the physics step: contact, settle, scoring and the turn.
  afterStep(): void;
  snapshot(): GolfSnapshot | undefined;
  // Events raised since the last call, stamped with `tick`.
  take(tick: number): WorldEvent[];
}

// Golf in a world whose course has a tee; `place` puts a player at a position.
export function createGolf(rapier: Rapier, physics: RapierWorld, course: BuiltCourse, place: (playerId: string, pos: Vec3) => void): Golf | null {
  const tee = course.golf?.tee;
  if (!tee) return null;
  const ballGroups = groups(GROUP_ITEM, GROUP_GROUND);
  let state: GolfState | null = null;
  let roster = new Map<string, CharacterId>();
  let ball: Ball | null = null;
  let placed: CharacterId | null = null;
  let drafts: DraftEvent[] = [];

  const playerOf = (id: CharacterId): string | undefined => [...roster].find(([, character]) => character === id)?.[0];

  const removeBall = () => {
    if (ball?.body) physics.removeRigidBody(ball.body);
    ball = null;
  };

  let ended = false;

  // Puts whoever is on turn at the tee, once per turn; raises golfEnd once when nobody has a ball left.
  const settleTurn = () => {
    if (!state) return;
    const turn = golfTurn(state);
    if (turn === null) {
      placed = null;
      if (ended) return;
      ended = true;
      // A ball still in flight is dropped; one that has landed stays reported while the scoreboard shows.
      if (ball?.body) removeBall();
      drafts.push({ kind: 'golfEnd', scores: JSON.parse(JSON.stringify(state.scores)) as GolfState['scores'] });
      return;
    }
    if (placed === turn) return;
    placed = turn;
    const id = playerOf(turn);
    if (id !== undefined) place(id, tee);
  };

  const land = (at: Vec3, miss: boolean) => {
    if (!ball || !state) return;
    const result = miss ? { ring: null, points: 0 } : scoreLanding({ x: at.x - tee.x, z: at.z - tee.z }, GOLF_RINGS);
    const owner = ball.owner;
    drafts.push({ kind: 'golfLand', playerId: playerOf(owner), pos: at, ring: result.ring, points: result.points });
    state = recordBall(state, owner, result.points);
    ball.shown = GOLF_SCOREBOARD_SECONDS;
    ball.pos = at;
    // The body is no longer needed; the ball is only reported until the scoreboard has shown.
    physics.removeRigidBody(ball.body!);
    ball.body = null;
    settleTurn();
  };

  return {
    start(next) {
      removeBall();
      roster = new Map(next);
      state = startGolf([...roster.values()]);
      placed = null;
      ended = false;
      settleTurn();
    },
    shot(playerId, request) {
      if (!state || ball) return false;
      const character = roster.get(playerId);
      if (character === undefined || golfTurn(state) !== character) return false;
      if (!Number.isFinite(request.yaw) || !Number.isFinite(request.power) || !Number.isFinite(request.curve)) return false;
      const power = clamp(request.power, 0, 1);
      const curve = clamp(request.curve, -1, 1);
      const pitch = degToRad(GOLF_LAUNCH_PITCH);
      const speed = power * GOLF_MAX_SPEED;
      const sin = Math.sin(request.yaw);
      const cos = Math.cos(request.yaw);
      const start = add(tee, vec3(0, GOLF_LAUNCH_HEIGHT, 0));
      const body = physics.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(start.x, start.y, start.z)
          .setLinvel(-sin * Math.cos(pitch) * speed, Math.sin(pitch) * speed, -cos * Math.cos(pitch) * speed)
          .setCcdEnabled(true),
      );
      const collider = physics.createCollider(rapier.ColliderDesc.ball(GOLF_BALL_RADIUS).setMass(BALL_MASS).setRestitution(0).setCollisionGroups(ballGroups), body);
      ball = { body, collider, owner: character, right: vec3(cos, 0, -sin), curve, age: 0, shown: null, pos: start };
      return true;
    },
    skip(playerId) {
      const character = roster.get(playerId);
      if (!state || character === undefined) return;
      state = skipFriend(state, character);
      settleTurn();
    },
    onTurn: (playerId) => state !== null && golfTurn(state) !== null && roster.get(playerId) === golfTurn(state),
    state: () => state,
    beforeStep() {
      if (!ball?.body || ball.curve === 0) return;
      // The sideways push stops at the first touch of the ground, which ends the flight.
      const push = BALL_MASS * GOLF_CURVE_ACCEL * ball.curve * TICK_DT;
      ball.body.applyImpulse({ x: ball.right.x * push, y: 0, z: ball.right.z * push }, true);
    },
    afterStep() {
      if (!ball) return;
      if (ball.shown !== null) {
        ball.shown -= TICK_DT;
        if (ball.shown <= 1e-9) ball = null;
        return;
      }
      ball.age += TICK_DT;
      const at = ball.body!.translation();
      const pos = vec3(at.x, at.y, at.z);
      ball.pos = pos;
      let touched = false;
      physics.contactPairsWith(ball.collider, (other) => {
        physics.contactPair(ball!.collider, other, (manifold) => {
          if (manifold.numContacts() > 0) touched = true;
        });
      });
      if (touched) land(pos, false);
      else if (ball.age >= GOLF_SETTLE_SECONDS) land(pos, true);
    },
    snapshot() {
      if (!state) return undefined;
      return { turn: golfTurn(state), ball: ball ? { ...ball.pos } : null, scores: JSON.parse(JSON.stringify(state.scores)) as GolfSnapshot['scores'] };
    },
    take(tick) {
      const taken = drafts.map((draft): WorldEvent => ({ ...draft, tick }));
      drafts = [];
      return taken;
    },
  };
}
