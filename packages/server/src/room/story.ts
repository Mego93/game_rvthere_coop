import {
  CHARACTER_IDS,
  CHARACTER_NAMES,
  COMPLAINT_COUNT,
  GOLF_SCOREBOARD_SECONDS,
  GUN_DAMAGE,
  KITCHEN_WITHDRAW,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RAPH_ANGER_MAX,
  STORY_DAYS,
  STORY_DAY_SECONDS,
  STORY_DOWN_LOSE_SECONDS,
  STORY_PRICES,
  TICK_DT,
  TICK_RATE,
  VIBECODE_TICK,
  buy,
  complain,
  eat,
  endDay,
  fakeRepublic,
  freeMeal,
  goalDone,
  golfResults,
  loseDay,
  minigameAtGate,
  newWeek,
  outingAtGate,
  parseWeek,
  phoneBuy,
  sayPhrase,
  serialiseWeek,
  spotGoalsDone,
  startGoals,
  stepNeeds,
  vibecodeTick,
  withdraw,
  type Activity,
  type CharacterId,
  type DayDef,
  type InputFields,
  type PhoneAction,
  type PlayerSnapshot,
  type Result,
  type ServerMessage,
  type SpotKind,
  type StoryFriendView,
  type StoryItemKind,
  type StoryPriced,
  type Week,
  type World,
  type WorldEvent,
} from '@lodgy/shared';
import type { WeekStore } from './types';

export const VILLA_ID = 'villa';
// Needs are stepped this often (6 ticks = 0.1 s); the clock still moves every tick.
const NEEDS_EVERY_TICKS = 6;
const VIEW_EVERY_TICKS = 30;
// Seconds after night falls at the villa before the day ends without everyone in bed.
const NIGHT_GRACE = 60;
const RAPH_ANGRY_SHOWN = 80;
const SHOT_STEP = 0.2;

export interface StoryPlayer {
  playerId: string;
  characterId: CharacterId;
}

// What the director needs from the room; the room layer owns worlds, players and sockets.
export interface StoryHost {
  noun: string;
  store: WeekStore;
  random: () => number;
  log: (message: string, error?: unknown) => void;
  // The players with a live connection, who are the present friends.
  connected: () => StoryPlayer[];
  // The days of the week; the room's config can replace them (tests).
  days: Record<number, DayDef>;
  // The character of a player in the room, connected or held.
  characterOf: (playerId: string) => CharacterId | undefined;
  world: () => World;
  // A new world with every connected player in it; `story` is the villa's world option.
  buildWorld: (courseId: string, story: boolean) => World;
  // Replaces the room's world: stage message, full snapshot, old world freed.
  swapWorld: (next: World, courseId: string) => void;
  broadcast: (message: ServerMessage) => void;
  send: (playerId: string, message: ServerMessage) => void;
  // The day ended: the room goes back to its lobby.
  toLobby: () => void;
  // The lobby message changed (the week finished loading or was reset).
  changed: () => void;
}

const cheapestFood = (): StoryPriced => (Object.entries(STORY_PRICES).sort((a, b) => a[1] - b[1])[0]![0]) as StoryPriced;

export function createStoryDirector(host: StoryHost) {
  const dayOf = (week: Week): DayDef => host.days[week.day] ?? STORY_DAYS[0]!;
  let week: Week | null = null;
  let loading: Promise<void> | null = null;
  // True once a day was played or the week was reset, so that an untouched room never overwrites the store.
  let touched = false;
  let running = false;
  // Where the group is when it is not at the villa: an outing's stage, an opening world or PrimeGolf.
  let away: { kind: 'outing' | 'opening' | 'golf'; goalId: string; index: number } | null = null;
  // Seconds of scoreboard left once the golf game is over, null while it is played.
  let golfLeaveIn: number | null = null;
  let nightSince: number | null = null;
  const slept = new Set<string>();
  // Clock time each friend was downed, until revived or respawned.
  const downedAt = new Map<string, number>();
  // Players whose world health is already mirrored in the week.
  const mirrored = new Set<string>();
  const pendingHurt = new Map<string, number>();
  const laptops = new Map<string, { spotId: string; held: number }>();
  let ticks = 0;
  let view: PlayerSnapshot[] = [];
  let dirty = false;

  const present = (): CharacterId[] => host.connected().map((player) => player.characterId);
  const character = (playerId: string) => host.connected().find((player) => player.playerId === playerId)?.characterId;

  const save = () => {
    if (!week || !touched) return;
    // Always the morning's week: progress inside a day is not kept, so a save never holds half a day.
    const json = serialiseWeek(loseDay(week));
    host.store.save(host.noun, json).catch((error: unknown) => host.log(`could not save the week of ${host.noun}`, error));
  };

  const ensureLoaded = () => {
    if (loading) return;
    loading = (async () => {
      let json: string | null = null;
      try {
        json = await host.store.load(host.noun);
      } catch (error) {
        host.log(`could not load the week of ${host.noun}; starting a new one`, error);
      }
      const parsed = json === null ? null : parseWeek(json);
      if (json !== null && parsed === null) host.log(`the saved week of ${host.noun} is corrupt; starting a new one`);
      // A reset while loading wins.
      week ??= parsed ?? newWeek();
      host.changed();
    })();
  };

  const refreshView = (world: World) => {
    view = world.snapshot().players;
  };

  const positions = () => {
    const result: Partial<Record<CharacterId, { x: number; y: number; z: number }>> = {};
    for (const player of host.connected()) {
      const snap = view.find((entry) => entry.playerId === player.playerId);
      if (snap) result[player.characterId] = snap.pos;
    }
    return result;
  };

  const completeGoals = (kind: SpotKind, spotPos: { x: number; y: number; z: number }) => {
    const ids = spotGoalsDone(dayOf(week!), week!.goals, kind, spotPos, positions(), present());
    for (const id of ids) {
      week = goalDone(week!, id, present());
      const def = dayOf(week).goals.find((goal) => goal.id === id);
      if (def?.together && def.meal) week = freeMeal(week, present(), def.meal);
    }
    if (ids.length > 0) dirty = true;
  };

  const buildStoryWorld = (courseId: string, story: boolean): World => {
    const next = host.buildWorld(courseId, story);
    // Each present friend takes his health in; the rest of the needs live in the week.
    const base = next.carryOut();
    next.applyCarry({
      ...base,
      players: base.players.map((entry) => {
        const id = host.characterOf(entry.id);
        return id ? { ...entry, health: Math.max(1, Math.round(week!.friends[id].health)) } : entry;
      }),
    });
    return next;
  };

  // Resets what belongs to one world.
  const newWorldState = () => {
    away = null;
    golfLeaveIn = null;
    nightSince = null;
    slept.clear();
    downedAt.clear();
    laptops.clear();
    pendingHurt.clear();
    mirrored.clear();
    for (const player of host.connected()) mirrored.add(player.playerId);
    view = [];
  };

  const setGoals = () => {
    week = { ...week!, goals: startGoals(dayOf(week!), present()) };
  };

  const stateMessage = (): ServerMessage => {
    const day = dayOf(week!);
    const friends: Partial<Record<CharacterId, StoryFriendView>> = {};
    for (const id of present()) {
      const f = week!.friends[id];
      friends[id] = {
        health: Math.round(f.health),
        food: Math.round(f.food),
        happiness: Math.round(f.happiness),
        tiredness: Math.round(f.tiredness),
        cash: f.cash,
        bank: f.bank,
        items: [...f.items],
        caffeine: { fast: f.caffeine.fast, slow: f.caffeine.slow },
        ...(f.anger >= RAPH_ANGRY_SHOWN ? { angry: true as const } : {}),
        ...(f.fakeRepublicDay === week!.day ? { played: true as const } : {}),
      };
    }
    return {
      type: 'storyState',
      day: week!.day,
      clock: week!.clock,
      dayLength: STORY_DAY_SECONDS,
      night: nightSince !== null,
      goals: week!.goals.map((goal) => ({ id: goal.id, label: day.goals.find((def) => def.id === goal.id)?.label ?? goal.id, status: goal.status })),
      friends,
    };
  };

  const sendState = () => {
    dirty = false;
    host.broadcast(stateMessage());
  };

  const startOuting = (goalId: string, courseId: string) => {
    const absent = CHARACTER_IDS.filter((id) => !present().includes(id));
    const next = buildStoryWorld(courseId, false);
    host.swapWorld(next, courseId);
    newWorldState();
    away = { kind: 'outing', goalId, index: 0 };
    for (const id of absent) host.broadcast({ type: 'toast', text: `${CHARACTER_NAMES[id]} is at the WC` });
    sendState();
  };

  // The stage's health comes home with the group.
  const bringHealthHome = (current: World) => {
    for (const entry of current.carryOut().players) {
      const id = host.characterOf(entry.id);
      if (id && present().includes(id)) week!.friends[id].health = entry.health;
    }
  };

  const goToVilla = (current: World) => {
    bringHealthHome(current);
    host.swapWorld(buildStoryWorld(VILLA_ID, true), VILLA_ID);
    newWorldState();
    sendState();
  };

  const returnToVilla = (finished: boolean, current: World) => {
    const was = away;
    if (finished && was) week = goalDone(week!, was.goalId, present());
    goToVilla(current);
  };

  const enterOpening = (index: number) => {
    away = { kind: 'opening', goalId: dayOf(week!).opening![index]!.goalId, index };
  };

  // An opening world is not a story world, so that the arrival's on-foot win and its enemies work.
  const startOpening = (index: number) => {
    host.swapWorld(buildStoryWorld(dayOf(week!).opening![index]!.courseId, false), dayOf(week!).opening![index]!.courseId);
    newWorldState();
    enterOpening(index);
  };

  const startGolf = (goalId: string) => {
    const next = buildStoryWorld('primegolf', true);
    host.swapWorld(next, 'primegolf');
    newWorldState();
    away = { kind: 'golf', goalId, index: 0 };
    next.golfStart(new Map(host.connected().map((player) => [player.playerId, player.characterId])));
    sendState();
  };

  // Finishing an opening world marks its goal done and moves on; the last one leads to the villa.
  const openingDone = (current: World) => {
    const finished = away!;
    week = goalDone(week!, finished.goalId, present());
    const opening = dayOf(week).opening!;
    if (finished.index + 1 >= opening.length) return goToVilla(current);
    bringHealthHome(current);
    startOpening(finished.index + 1);
    sendState();
  };

  // The game is over: the week takes the results and the goal is done; the group leaves after the scoreboard.
  const golfOver = (world: World) => {
    const state = world.golfState();
    if (state) week = golfResults(state, week!);
    week = goalDone(week!, away!.goalId, present());
    golfLeaveIn = GOLF_SCOREBOARD_SECONDS;
    dirty = true;
  };

  const endOfDay = () => {
    const w = week!;
    const done = w.goals.filter((goal) => goal.status === 'done').map((goal) => goal.id);
    const missed = w.goals.filter((goal) => goal.status === 'pending').map((goal) => goal.id);
    const skipped = w.goals.filter((goal) => goal.status === 'skipped').map((goal) => goal.id);
    const summary: ServerMessage = { type: 'daySummary', day: w.day, done, missed, skipped };
    week = endDay(w, missed, present());
    save();
    running = false;
    host.broadcast(summary);
    host.toLobby();
  };

  const dayLost = () => {
    week = loseDay(week!);
    setGoals();
    save();
    if (dayOf(week).opening) startOpening(0);
    else {
      host.swapWorld(buildStoryWorld(VILLA_ID, true), VILLA_ID);
      newWorldState();
    }
    host.broadcast({ type: 'toast', text: 'Day lost' });
    sendState();
  };

  const startNight = () => {
    nightSince = week!.clock;
    host.broadcast({ type: 'toast', text: 'Go to bed' });
    sendState();
  };

  // Rafael's shots can hit an ally while his anger is full: the first one along the ray takes the gun's damage.
  const friendlyFire = (world: World, event: WorldEvent, shooter: string) => {
    if (!event.pos || !event.to) return;
    refreshView(world);
    const from = event.pos;
    const to = event.to;
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / SHOT_STEP));
    const allies = view.filter((snap) => snap.playerId !== shooter && snap.downed === null && snap.seat === null && host.characterOf(snap.playerId) !== undefined && present().includes(host.characterOf(snap.playerId)!));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      const hit = allies.find((snap) => Math.hypot(x - snap.pos.x, z - snap.pos.z) <= PLAYER_RADIUS + 0.1 && y >= snap.pos.y - 0.05 && y <= snap.pos.y + PLAYER_HEIGHT);
      if (hit) {
        world.debugHurt(hit.playerId, GUN_DAMAGE);
        return;
      }
    }
  };

  const onSpot = (world: World, event: WorldEvent) => {
    if (away || !event.playerId || !event.spotId || !event.spotKind) return;
    const id = character(event.playerId);
    if (!id) return;
    const spot = world.course.spots?.find((entry) => entry.id === event.spotId);
    if (!spot) return;
    refreshView(world);
    switch (event.spotKind) {
      case 'kitchen': {
        // Nandan eats only pizza, so the kitchen has nothing for him.
        if (id === 'nandan') return;
        // A pending free-meal goal needs no purchase: the group's meal is the goal's.
        const freeGoal = dayOf(week!).goals.some((goal) => goal.spot === 'kitchen' && goal.meal && week!.goals.some((entry) => entry.id === goal.id && entry.status === 'pending'));
        if (freeGoal) return completeGoals('kitchen', spot.pos);
        const item = cheapestFood();
        const bought = buy(week!, id, item);
        if (!bought.ok) return;
        const ate = eat(bought.week, id, item);
        if (!ate.ok) return;
        week = ate.week;
        dirty = true;
        completeGoals('kitchen', spot.pos);
        return;
      }
      case 'chef': {
        if (id !== 'nandan') return;
        const ate = eat(week!, id, 'pizza');
        if (!ate.ok) return;
        week = ate.week;
        dirty = true;
        // The chef is the kitchen's: his pizza counts as the meal.
        completeGoals('kitchen', spot.pos);
        return;
      }
      case 'laptop':
        if (!laptops.has(event.playerId)) laptops.set(event.playerId, { spotId: event.spotId, held: 0 });
        completeGoals('laptop', spot.pos);
        return;
      case 'atm': {
        const bank = week!.friends[id].bank;
        if (bank <= 0) return;
        const result = withdraw(week!, id, Math.min(KITCHEN_WITHDRAW, bank));
        if (!result.ok) return;
        week = result.week;
        dirty = true;
        completeGoals('atm', spot.pos);
        return;
      }
      case 'gate': {
        const outingGoal = outingAtGate(dayOf(week!), week!.goals);
        if (outingGoal?.courseId) return startOuting(outingGoal.id, outingGoal.courseId);
        const minigame = minigameAtGate(dayOf(week!), week!.goals);
        if (minigame?.minigame === 'primegolf') startGolf(minigame.id);
        return;
      }
      case 'bed':
        if (nightSince === null) return;
        slept.add(event.playerId);
        return;
      default:
        // Couch, board and shop: the client reacts to the event; a goal on them is done by the use.
        completeGoals(event.spotKind, spot.pos);
    }
  };

  const stepNeedsNow = (world: World, inputs: ReadonlyMap<string, InputFields>) => {
    const players = host.connected();
    const activity: Partial<Record<CharacterId, Activity>> = {};
    for (const player of players) {
      const input = inputs.get(player.playerId);
      const seat = view.find((snap) => snap.playerId === player.playerId)?.seat;
      if (laptops.has(player.playerId)) activity[player.characterId] = 'vibecoding';
      else if (seat === 'driver' || (input?.sprint === true && (input.moveX !== 0 || input.moveY !== 0))) activity[player.characterId] = 'exerting';
    }
    // The world owns health; the week mirrors it and hands back what hunger cost.
    for (const player of players) {
      const exact = world.debugPlayerHealth(player.playerId);
      const friend = week!.friends[player.characterId];
      if (!mirrored.has(player.playerId)) {
        mirrored.add(player.playerId);
        if (exact > friend.health) pendingHurt.set(player.playerId, (pendingHurt.get(player.playerId) ?? 0) + exact - friend.health);
        else friend.health = exact;
      } else friend.health = exact;
    }
    for (const id of [...mirrored]) if (!players.some((player) => player.playerId === id)) mirrored.delete(id);
    const before = new Map(players.map((player) => [player.playerId, week!.friends[player.characterId].health]));
    week = stepNeeds(week!, NEEDS_EVERY_TICKS * TICK_DT, present(), activity);
    for (const player of players) {
      const lost = before.get(player.playerId)! - week.friends[player.characterId].health;
      const owed = Math.min(100, (pendingHurt.get(player.playerId) ?? 0) + Math.max(0, lost));
      const whole = Math.floor(owed);
      if (whole >= 1) world.debugHurt(player.playerId, whole);
      pendingHurt.set(player.playerId, owed - whole);
    }
  };

  return {
    ensureLoaded,
    loaded: () => week !== null,
    active: () => running,
    lobbyInfo: () => (week ? { day: week.day, finishedDays: [...week.finishedDays] } : undefined),

    reset() {
      week = newWeek();
      touched = true;
      loading ??= Promise.resolve();
      save();
      host.changed();
    },

    // The room built the villa world and is in play.
    begin() {
      running = true;
      touched = true;
      setGoals();
      newWorldState();
      if (dayOf(week!).opening) enterOpening(0);
      sendState();
    },

    // The world the day starts in: the first of its opening, or the villa.
    firstStage: (): { courseId: string; story: boolean } => {
      const first = dayOf(week!).opening?.[0];
      return first ? { courseId: first.courseId, story: false } : { courseId: VILLA_ID, story: true };
    },

    buildWorld: (courseId: string, story: boolean) => buildStoryWorld(courseId, story),

    // The friends nobody plays sit on the couch while the group is at the villa.
    absent: (): CharacterId[] => (away ? [] : CHARACTER_IDS.filter((id) => !present().includes(id))),

    // The room is leaving the run (admin back to lobby, or the room is freed): the morning is kept.
    abandon() {
      running = false;
      save();
    },

    save,

    // A friend's player is about to leave the world: his health at that moment is the one that freezes.
    leaving(playerId: string) {
      if (!running || !week) return;
      const id = host.characterOf(playerId);
      if (!id) return;
      try {
        if (mirrored.has(playerId)) week.friends[id].health = host.world().debugPlayerHealth(playerId);
      } catch {
        // The player was not in the world; the week keeps what it has.
      }
      if (away?.kind === 'golf') host.world().golfSkip(playerId);
      mirrored.delete(playerId);
      downedAt.delete(playerId);
      laptops.delete(playerId);
      pendingHurt.delete(playerId);
      dirty = true;
    },

    say(playerId: string) {
      const id = character(playerId);
      if (!running || !id) return;
      const result = sayPhrase(week!, id, week!.clock);
      if (result.ok) week = result.week;
    },

    // The complain button; the line shown is picked here so that everyone sees the same one.
    complain(playerId: string): boolean {
      const id = character(playerId);
      if (!running || !id) return false;
      const result = complain(week!, id, week!.clock);
      if (!result.ok) return false;
      week = result.week;
      host.broadcast({ type: 'complain', playerId, line: Math.min(COMPLAINT_COUNT - 1, Math.floor(host.random() * COMPLAINT_COUNT)) });
      dirty = true;
      return true;
    },

    phone(playerId: string, action: PhoneAction): boolean {
      const id = character(playerId);
      if (!running || !id) return false;
      let result: Result;
      switch (action.kind) {
        case 'withdraw':
          result = withdraw(week!, id, action.amount);
          break;
        case 'phoneBuy':
          result = phoneBuy(week!, id, action.item);
          break;
        case 'buy':
          result = buy(week!, id, action.item);
          break;
        case 'eat':
          result = eat(week!, id, action.item as StoryItemKind);
          break;
        case 'fakeRepublic': {
          const played = fakeRepublic(week!, id, action.pick, host.random);
          if (!played.ok) return false;
          week = played.week;
          host.send(playerId, { type: 'fakeRepublic', pick: action.pick, outcome: played.outcome });
          dirty = true;
          return true;
        }
      }
      if (!result.ok) return false;
      week = result.week;
      dirty = true;
      return true;
    },

    // PrimeGolf: a shot from the player on turn; false when refused.
    golfShot(playerId: string, shot: { yaw: number; power: number; curve: number }): boolean {
      if (!running || away?.kind !== 'golf' || golfLeaveIn !== null) return false;
      return host.world().golfShot(playerId, shot);
    },

    // After the world stepped; `events` are its events and `inputs` the ones it ran on.
    afterStep(world: World, events: readonly WorldEvent[], inputs: ReadonlyMap<string, InputFields>) {
      const w = week!;
      // The clock is paused in PrimeGolf.
      if (away?.kind !== 'golf') w.clock += TICK_DT;
      ticks += 1;
      if (ticks % VIEW_EVERY_TICKS === 0) refreshView(world);
      for (const event of events) {
        if (event.kind === 'downed' && event.playerId) downedAt.set(event.playerId, week!.clock);
        else if ((event.kind === 'revive' || event.kind === 'respawn') && event.playerId) downedAt.delete(event.playerId);
        else if (event.kind === 'golfEnd' && away?.kind === 'golf' && golfLeaveIn === null) golfOver(world);
        else if (event.kind === 'spot') {
          onSpot(world, event);
          // A goal done or a change of world: the rest of this tick's events belong to the old world.
          if (host.world() !== world) return;
        } else if (event.kind === 'shot' && event.playerId && character(event.playerId) === 'rafael' && week!.friends.rafael.anger >= RAPH_ANGER_MAX) friendlyFire(world, event, event.playerId);
      }
      for (const [playerId, session] of laptops) {
        if (inputs.get(playerId)?.use !== true) {
          laptops.delete(playerId);
          continue;
        }
        session.held += TICK_DT;
        if (session.held >= VIBECODE_TICK - 1e-6) {
          session.held -= VIBECODE_TICK;
          const id = character(playerId);
          if (id) week = vibecodeTick(week!, id);
          dirty = true;
        }
      }
      if (ticks % NEEDS_EVERY_TICKS === 0 && away?.kind !== 'golf') {
        stepNeedsNow(world, inputs);
        // A laptop session ends when the friend walks away.
        for (const [playerId, session] of laptops) {
          const spot = world.course.spots?.find((entry) => entry.id === session.spotId);
          const snap = view.find((entry) => entry.playerId === playerId);
          if (spot && snap && Math.hypot(snap.pos.x - spot.pos.x, snap.pos.z - spot.pos.z) > spot.radius + 1.5) laptops.delete(playerId);
        }
      }
      for (const [playerId, since] of downedAt) {
        if (week!.clock - since >= STORY_DOWN_LOSE_SECONDS && character(playerId)) return dayLost();
      }
      if (away?.kind === 'golf') {
        if (golfLeaveIn !== null) {
          golfLeaveIn -= TICK_DT;
          if (golfLeaveIn <= 1e-9) return goToVilla(world);
        }
      } else if (away?.kind === 'opening') {
        // One move per tick: a win and night at once is a single step.
        if (world.status().state === 'won') return openingDone(world);
        // Night: the group goes to the villa and the rest of the opening counts as missed.
        if (week!.clock >= STORY_DAY_SECONDS) return returnToVilla(false, world);
      } else if (away) {
        if (world.status().state === 'won') return returnToVilla(true, world);
        if (week!.clock >= STORY_DAY_SECONDS) return returnToVilla(false, world);
      } else {
        if (nightSince === null && week!.clock >= STORY_DAY_SECONDS) startNight();
        if (nightSince !== null) {
          const everyoneInBed = host.connected().length > 0 && host.connected().every((player) => slept.has(player.playerId));
          if (everyoneInBed || week!.clock - nightSince >= NIGHT_GRACE) return endOfDay();
        }
      }
      if (dirty || ticks % TICK_RATE === 0) sendState();
    },

    // Tests only.
    debugWeek: () => week,
  };
}

export type StoryDirector = ReturnType<typeof createStoryDirector>;
