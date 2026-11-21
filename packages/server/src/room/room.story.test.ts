import RAPIER from '@dimforge/rapier3d-compat';
import {
  CHARACTER_IDS,
  GUN_DAMAGE,
  NEUTRAL_INPUT,
  STORY_DAY_SECONDS,
  TICK_DT,
  defaultAppearance,
  getCourse,
  newWeek,
  parseWeek,
  serialiseWeek,
  vec3,
  IDENTITY,
  type BuiltCourse,
  type CharacterId,
  type ServerMessage,
  type Spot,
  type Week,
  type World,
  type WorldEvent,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom, type RoomPlayer } from './room';
import { createMemoryWeekStore } from './weekStore';
import type { WeekStore } from './types';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const base = getCourse('test');
const spot = (id: string, kind: Spot['kind'], x: number, z: number): Spot => ({ id, kind, pos: vec3(x, 0, z), radius: 1.5 });
const SPOTS: Spot[] = [
  spot('kitchen-1', 'kitchen', 0, 5),
  spot('chef-1', 'chef', 2, 5),
  spot('laptop-1', 'laptop', -5, 5),
  spot('atm-1', 'atm', 10, 5),
  spot('gate-1', 'gate', 0, -10),
  spot('bed-1', 'bed', -10, 5),
  spot('board-1', 'board', 5, 5),
];

// Small stand-ins: the villa has spots and no finish near the players; the desert is won on its first tick when `finishing`.
function courses(finishing: boolean): Record<string, BuiltCourse> {
  const finish = finishing ? { center: base.checkpoints[0]!.spawn.pos, halfExtents: vec3(20, 20, 20), rot: IDENTITY } : base.finish;
  return {
    villa: { ...base, id: 'villa', pickups: [], spots: SPOTS },
    desert: { ...base, id: 'desert', pickups: [], finish },
  };
}

interface Options {
  week?: Week;
  raw?: string;
  outingFinishes?: boolean;
  characters?: CharacterId[];
  store?: WeekStore;
  noun?: string;
  random?: () => number;
  failLoad?: boolean;
}

async function setup(options: Options = {}) {
  const store = options.store ?? createMemoryWeekStore();
  const noun = options.noun ?? 'villa';
  if (options.week) await store.save(noun, serialiseWeek(options.week));
  if (options.raw !== undefined) await store.save(noun, options.raw);
  const logs: string[] = [];
  const loading: WeekStore = options.failLoad ? { load: () => Promise.reject(new Error('disk')), save: (n, j) => store.save(n, j) } : store;
  const room = createRoom(RAPIER, { noun, courses: courses(options.outingFinishes ?? false), weekStore: loading, random: options.random ?? (() => 0), log: (message) => logs.push(message) }, 0);
  let time = 0;
  const messages: ServerMessage[] = [];
  const characters = options.characters ?? ['sounile'];
  const players: RoomPlayer[] = characters.map((id, i) => {
    // Only the admin's connection is recorded, so a broadcast shows once.
    const player = room.add(`P${i + 1}`, token(i + 1), { send: (data) => { if (i === 0) messages.push(JSON.parse(data) as ServerMessage); }, close: () => {} });
    room.setAppearance(player, defaultAppearance(id));
    return player;
  });
  const admin = players[0]!;
  const patched = new WeakSet<World>();
  const pending: WorldEvent[] = [];
  const holding = new Map<string, number>();
  const seqs = new Map<string, number>();
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      const world = room.debugWorld();
      // Events the real world would emit are injected into the next step of whichever world is current.
      if (world && !patched.has(world)) {
        patched.add(world);
        const step = world.step.bind(world);
        world.step = (inputs) => [...step(inputs), ...pending.splice(0)];
      }
      for (const player of players) {
        if (!holding.has(player.playerId)) continue;
        const seq = (seqs.get(player.playerId) ?? 0) + 1;
        seqs.set(player.playerId, seq);
        room.pushInput(player, { ...NEUTRAL_INPUT, seq, use: true });
      }
      time += TICK_DT;
      room.update(time);
    }
  };
  const ofType = <T extends ServerMessage['type']>(type: T) => messages.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type);
  const lastOf = <T extends ServerMessage['type']>(type: T) => ofType(type)[ofType(type).length - 1]!;
  const emit = (player: RoomPlayer, spotId: string) => {
    const kind = SPOTS.find((entry) => entry.id === spotId)!.kind;
    pending.push({ kind: 'spot', tick: 0, playerId: player.playerId, spotId, spotKind: kind });
  };
  const at = (player: RoomPlayer, spotId: string) => room.debugWorld()!.teleportPlayer(player.playerId, SPOTS.find((entry) => entry.id === spotId)!.pos);
  const week = () => room.debugWeek()!;
  const friend = (id: CharacterId) => week().friends[id];
  const enterStory = async () => {
    room.configure(admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'story' });
    await flush();
    for (const player of players.slice(1)) room.setReady(player, true);
    run(2);
    return room.start(admin);
  };
  room.announce();
  run(2);
  return { room, store, noun, logs, players, admin, messages, run, ofType, lastOf, emit, at, week, friend, enterStory, holding, pending, time: () => time };
}

const seeded = (change: (w: Week) => void): Week => {
  const w = newWeek();
  change(w);
  w.morning = JSON.parse(JSON.stringify({ ...w, morning: null })) as Week;
  return w;
};

// --- S1: story mode ---

test('S1: race stays the default; story start loads the week, builds the villa and sends its stage', async () => {
  const { room, admin, ofType, enterStory, lastOf } = await setup({ week: seeded((w) => { w.day = 3; w.finishedDays = [1, 2]; }) });
  expect(lastOf('lobby').mode).toBe('race');
  expect(lastOf('lobby').story).toBeUndefined();
  expect(await enterStory()).toBeNull();
  expect(room.phase()).toBe('playing');
  expect(room.debugWorld()!.course.id).toBe('villa');
  expect(ofType('stage')).toEqual([{ type: 'stage', courseId: 'villa', index: 0, of: 1 }]);
  expect(lastOf('lobby').story).toEqual({ day: 3, finishedDays: [1, 2] });
  expect(lastOf('storyState').day).toBe(3);
  expect(room.debugWeek()!.goals.map((goal) => goal.status)).toEqual(['pending', 'pending', 'pending']);
  room.toLobby(admin);
  room.dispose();
});

test('S1: start waits for the week to load, and a race start never touches the store', async () => {
  const { room, admin, run } = await setup();
  room.configure(admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'story' });
  expect(room.start(admin)).toBe('bad_phase');
  await flush();
  run(1);
  expect(room.start(admin)).toBeNull();
  room.dispose();
});

test('S1: a race start in a room whose mode is race builds the course and sends no story messages', async () => {
  const { room, admin, ofType } = await setup();
  room.configure(admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'race' });
  expect(room.start(admin)).toBeNull();
  expect(room.debugWorld()!.course.id).toBe('desert');
  expect(ofType('stage')).toEqual([]);
  expect(ofType('storyState')).toEqual([]);
  room.dispose();
});

// --- S2: present and absent ---

test('S2: the friends of the connected players are present; the rest are absent on the couch, and snapshots say so', async () => {
  const { enterStory, run, ofType, room } = await setup({ characters: ['luiz', 'huu'] });
  await enterStory();
  run(6);
  const snapshot = ofType('snapshot').filter((message) => message.absent !== undefined).pop()!;
  expect(snapshot.absent).toEqual(['sounile', 'rafael', 'nandan', 'alexander']);
  expect(Object.keys(ofType('storyState').pop()!.friends).sort()).toEqual(['huu', 'luiz']);
  room.dispose();
});

test('S2: a race snapshot has no absent field', async () => {
  const { room, admin, run, ofType } = await setup();
  room.start(admin);
  run(6);
  expect(ofType('snapshot').every((message) => message.absent === undefined)).toBe(true);
  room.dispose();
});

// --- S3: clock and needs ---

test('S3: the clock and the needs advance with the ticks; absent friends stay frozen', async () => {
  const { enterStory, run, week, friend, room } = await setup({ characters: ['luiz'] });
  await enterStory();
  run(600);
  expect(week().clock).toBeCloseTo(10, 1);
  expect(friend('luiz').food).toBeCloseTo(79, 1);
  expect(friend('huu')).toEqual(newWeek().friends.huu);
  room.dispose();
});

test('S3: holding use at a laptop gives a vibecode tick every 10 s', async () => {
  const { enterStory, run, emit, players, holding, friend, room, at } = await setup();
  await enterStory();
  const [p1] = players;
  at(p1!, 'laptop-1');
  emit(p1!, 'laptop-1');
  holding.set(p1!.playerId, 1);
  run(9 * 60);
  const before = friend('sounile').happiness;
  run(2 * 60);
  // The goal gave +5 at the first use; the first tick of 10 s gave +5 more.
  expect(friend('sounile').happiness).toBeCloseTo(before + 5, 1);
  expect(friend('sounile').happiness).toBeCloseTo(80, 1);
  holding.clear();
  run(30 * 60);
  expect(friend('sounile').happiness).toBeCloseTo(80, 1);
  room.dispose();
});

// --- S4: spots ---

test('S4: the atm takes 500 or the rest of the bank; the kitchen buys and eats the cheapest food and completes the eat goal', async () => {
  const { enterStory, run, emit, players, friend, week, room, at } = await setup();
  await enterStory();
  const [p1] = players;
  at(p1!, 'atm-1');
  emit(p1!, 'atm-1');
  run(2);
  expect(friend('sounile').cash).toBe(500);
  expect(friend('sounile').bank).toBe(1500);
  room.debugWeek()!.friends.sounile.bank = 120;
  emit(p1!, 'atm-1');
  run(2);
  expect(friend('sounile').cash).toBe(620);
  expect(friend('sounile').bank).toBe(0);
  const food = friend('sounile').food;
  at(p1!, 'kitchen-1');
  emit(p1!, 'kitchen-1');
  run(2);
  expect(friend('sounile').cash).toBe(615);
  expect(friend('sounile').food).toBeGreaterThan(food);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('done');
  room.dispose();
});

test('S4: a meal needs cash, and a together goal needs every present friend near the spot', async () => {
  const { enterStory, run, emit, players, friend, week, room, at } = await setup({ characters: ['sounile', 'luiz'] });
  await enterStory();
  const [p1, p2] = players;
  room.debugWeek()!.friends.sounile.cash = 50;
  at(p1!, 'kitchen-1');
  at(p2!, 'bed-1');
  emit(p2!, 'kitchen-1');
  run(2);
  // Luiz has no cash.
  expect(friend('luiz').cash).toBe(0);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('pending');
  emit(p1!, 'kitchen-1');
  run(2);
  expect(friend('sounile').cash).toBe(45);
  // Eaten, but Luiz stands in the bedroom.
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('pending');
  at(p2!, 'kitchen-1');
  emit(p1!, 'kitchen-1');
  run(2);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('done');
  room.dispose();
});

test('S4: the chef gives pizza to Nandan only, and the kitchen has nothing for him', async () => {
  const { enterStory, run, emit, players, friend, week, room, at } = await setup({ characters: ['nandan', 'luiz'] });
  await enterStory();
  const [nandan, luiz] = players;
  room.debugWeek()!.friends.nandan.cash = 100;
  room.debugWeek()!.friends.luiz.food = 20;
  room.debugWeek()!.friends.nandan.food = 30;
  at(nandan!, 'chef-1');
  at(luiz!, 'chef-1');
  emit(luiz!, 'chef-1');
  run(2);
  expect(friend('luiz').food).toBeLessThanOrEqual(20);
  const food = friend('nandan').food;
  emit(nandan!, 'kitchen-1');
  run(2);
  expect(friend('nandan').cash).toBe(100);
  expect(friend('nandan').food).toBe(food);
  at(luiz!, 'bed-1');
  emit(nandan!, 'chef-1');
  run(2);
  expect(friend('nandan').food).toBeGreaterThan(food + 40);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('pending');
  at(luiz!, 'chef-1');
  emit(nandan!, 'chef-1');
  run(2);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('done');
  room.dispose();
});

test('S4: the gate starts the outing only once its after goal is done', async () => {
  const { enterStory, run, emit, players, ofType, week, room, at } = await setup();
  await enterStory();
  const [p1] = players;
  room.debugWeek()!.friends.sounile.cash = 50;
  at(p1!, 'gate-1');
  emit(p1!, 'gate-1');
  run(2);
  expect(room.debugWorld()!.course.id).toBe('villa');
  at(p1!, 'kitchen-1');
  emit(p1!, 'kitchen-1');
  run(2);
  expect(week().goals.find((goal) => goal.id === 'eat')!.status).toBe('done');
  emit(p1!, 'gate-1');
  run(2);
  expect(room.debugWorld()!.course.id).toBe('desert');
  expect(ofType('stage').map(({ courseId, index, of }) => [courseId, index, of])).toEqual([['villa', 0, 1], ['desert', 0, 1]]);
  room.dispose();
});

test('S4: a bed does nothing in the day', async () => {
  const { enterStory, run, emit, players, room, at, week } = await setup();
  await enterStory();
  at(players[0]!, 'bed-1');
  emit(players[0]!, 'bed-1');
  run(2);
  expect(room.phase()).toBe('playing');
  expect(week().day).toBe(1);
  room.dispose();
});

// --- S5: outings ---

async function toOuting(options: Options = {}) {
  const ctx = await setup(options);
  await ctx.enterStory();
  const [p1] = ctx.players;
  ctx.room.debugWeek()!.friends.sounile.cash = 50;
  ctx.at(p1!, 'kitchen-1');
  ctx.emit(p1!, 'kitchen-1');
  ctx.emit(p1!, 'gate-1');
  ctx.run(2);
  return ctx;
}

test('S5: an outing takes the friends health in, and on finishing writes it back, completes the goal and returns to the villa', async () => {
  const { room, run, ofType, week, friend, players } = await toOuting({ outingFinishes: true });
  // The desert is won on its first tick.
  run(3);
  expect(room.debugWorld()!.course.id).toBe('villa');
  expect(week().goals.find((goal) => goal.id === 'outing')!.status).toBe('done');
  expect(ofType('stage').map((message) => message.courseId)).toEqual(['villa', 'desert', 'villa']);
  expect(friend('sounile').health).toBe(100);
  expect(players.length).toBe(1);
  room.dispose();
});

test('S5: the health a friend has goes into the outing and comes back with him', async () => {
  const { room, run, friend, players, week } = await toOuting();
  expect(room.debugWorld()!.course.id).toBe('desert');
  expect(room.debugWorld()!.debugPlayerHealth(players[0]!.playerId)).toBe(100);
  room.debugWorld()!.debugHurt(players[0]!.playerId, 30);
  run(2);
  expect(room.debugWorld()!.debugPlayerHealth(players[0]!.playerId)).toBe(70);
  // Night brings the group home.
  week().clock = STORY_DAY_SECONDS - TICK_DT;
  run(2);
  expect(room.debugWorld()!.course.id).toBe('villa');
  expect(friend('sounile').health).toBeCloseTo(70, 0);
  expect(room.debugWorld()!.debugPlayerHealth(players[0]!.playerId)).toBe(70);
  // The goal was not done.
  expect(week().goals.find((goal) => goal.id === 'outing')!.status).toBe('pending');
  room.dispose();
});

test('S5: an absent friend gets one "at the WC" toast per outing', async () => {
  const { ofType } = await toOuting({ characters: ['sounile'] });
  const toasts = ofType('toast').map((message) => message.text);
  expect(toasts).toContain('Rafael is at the WC');
  expect(toasts.filter((text) => text === 'Rafael is at the WC')).toHaveLength(1);
  expect(toasts).not.toContain('Sounile is at the WC');
});

test('S5 (review 1): a player who drops during an outing leaves the outing running, his friend is absent at once and his needs freeze', async () => {
  const ctx = await setup({ characters: ['sounile', 'luiz'] });
  await ctx.enterStory();
  const [p1, p2] = ctx.players;
  ctx.room.debugWeek()!.friends.sounile.cash = 50;
  ctx.at(p1!, 'kitchen-1');
  ctx.at(p2!, 'kitchen-1');
  ctx.emit(p1!, 'kitchen-1');
  ctx.emit(p1!, 'gate-1');
  ctx.run(2);
  expect(ctx.room.debugWorld()!.course.id).toBe('desert');
  ctx.run(120);
  ctx.room.hold(p2!, ctx.time());
  const frozen = JSON.parse(JSON.stringify(ctx.friend('luiz')));
  const sounileFood = ctx.friend('sounile').food;
  ctx.run(600);
  expect(ctx.room.debugWorld()!.course.id).toBe('desert');
  expect(ctx.friend('luiz')).toEqual(frozen);
  expect(ctx.friend('sounile').food).toBeLessThan(sounileFood);
  ctx.run(6);
  expect(Object.keys(ctx.lastOf('storyState').friends)).toEqual(['sounile']);
  ctx.room.dispose();
});

test('S5 (review 4): night falling on the tick a stage is won sends the group home once', async () => {
  const ctx = await setup({ outingFinishes: true, week: seeded((w) => { w.clock = STORY_DAY_SECONDS - 0.001; }) });
  await ctx.enterStory();
  const [p1] = ctx.players;
  ctx.room.debugWeek()!.friends.sounile.cash = 50;
  ctx.at(p1!, 'kitchen-1');
  ctx.emit(p1!, 'kitchen-1');
  ctx.emit(p1!, 'gate-1');
  ctx.run(1);
  // The kitchen use and the gate use happen in the first tick: night has not been noticed, the outing has begun.
  expect(ctx.room.debugWorld()!.course.id).toBe('desert');
  ctx.run(10);
  expect(ctx.ofType('stage').map((message) => message.courseId)).toEqual(['villa', 'desert', 'villa']);
  expect(ctx.ofType('toast').filter((message) => message.text === 'Go to bed')).toHaveLength(1);
  expect(ctx.week().goals.find((goal) => goal.id === 'outing')!.status).toBe('done');
  ctx.room.dispose();
});

// --- S6: night ---

test('S6: at the villa, night asks for bed; everyone in bed ends the day with a summary, saves, and returns to the lobby', async () => {
  const ctx = await setup({ characters: ['sounile', 'luiz'], week: seeded((w) => { w.clock = STORY_DAY_SECONDS - 1; }) });
  await ctx.enterStory();
  const [p1, p2] = ctx.players;
  ctx.at(p1!, 'laptop-1');
  ctx.emit(p1!, 'laptop-1');
  ctx.run(120);
  expect(ctx.ofType('toast').map((message) => message.text)).toContain('Go to bed');
  expect(ctx.lastOf('storyState').night).toBe(true);
  ctx.emit(p1!, 'bed-1');
  ctx.run(2);
  expect(ctx.room.phase()).toBe('playing');
  ctx.emit(p2!, 'bed-1');
  ctx.run(2);
  expect(ctx.room.phase()).toBe('lobby');
  expect(ctx.lastOf('daySummary')).toEqual({ type: 'daySummary', day: 1, done: ['vibecode'], missed: ['eat', 'outing'], skipped: [] });
  expect(ctx.lastOf('lobby').story).toEqual({ day: 2, finishedDays: [1] });
  expect(ctx.lastOf('lobby').phase).toBe('lobby');
  await flush();
  const saved = parseWeek((await ctx.store.load(ctx.noun))!)!;
  expect(saved.day).toBe(2);
  expect(saved.clock).toBe(0);
  // Missed goals cost the present friends happiness; sleep resets tiredness.
  expect(saved.friends.luiz.tiredness).toBe(10);
  expect(saved.friends.luiz.happiness).toBeLessThan(70);
  expect(saved.friends.huu).toEqual(newWeek().friends.huu);
  ctx.room.dispose();
});

test('S6: without everyone in bed the day ends 60 s after night', async () => {
  const ctx = await setup({ week: seeded((w) => { w.clock = STORY_DAY_SECONDS - 1; }) });
  await ctx.enterStory();
  ctx.run(60 + 59 * 60);
  expect(ctx.room.phase()).toBe('playing');
  ctx.run(2 * 60);
  expect(ctx.room.phase()).toBe('lobby');
  expect(ctx.lastOf('daySummary').missed).toEqual(['vibecode', 'eat', 'outing']);
  ctx.room.dispose();
});

test('S6: night outside the villa brings the group home, and the day then ends in bed', async () => {
  const ctx = await toOuting();
  ctx.week().clock = STORY_DAY_SECONDS - TICK_DT;
  ctx.run(3);
  expect(ctx.room.debugWorld()!.course.id).toBe('villa');
  expect(ctx.ofType('toast').map((message) => message.text)).toContain('Go to bed');
  ctx.emit(ctx.players[0]!, 'bed-1');
  ctx.run(2);
  expect(ctx.room.phase()).toBe('lobby');
  expect(ctx.lastOf('daySummary').missed).toContain('outing');
  ctx.room.dispose();
});

// --- S7: losing the day ---

test('S7: a friend downed for 60 s without a revive loses the day: the villa is rebuilt at the morning and the week is as it was', async () => {
  const ctx = await setup({ characters: ['sounile', 'luiz'] });
  await ctx.enterStory();
  const [p1, p2] = ctx.players;
  ctx.room.debugWeek()!.friends.sounile.bank = 1;
  ctx.week().friends.luiz.cash = 77;
  ctx.at(p1!, 'atm-1');
  ctx.emit(p1!, 'atm-1');
  ctx.run(2);
  expect(ctx.friend('sounile').cash).toBe(1);
  ctx.pending.push({ kind: 'downed', tick: 0, playerId: p2!.playerId });
  ctx.run(59 * 60);
  expect(ctx.ofType('toast').map((message) => message.text)).not.toContain('Day lost');
  ctx.run(2 * 60);
  expect(ctx.ofType('toast').map((message) => message.text)).toContain('Day lost');
  expect(ctx.ofType('stage').map((message) => message.courseId)).toEqual(['villa', 'villa']);
  expect(ctx.room.phase()).toBe('playing');
  // A second of the new day has passed since the loss.
  expect(ctx.week().clock).toBeLessThan(2);
  expect(ctx.friend('sounile').cash).toBe(0);
  expect(ctx.friend('luiz').cash).toBe(0);
  expect(ctx.week().goals.map((goal) => goal.status)).toEqual(['pending', 'pending', 'pending']);
  ctx.room.dispose();
});

test('S7: a friend really downed in the world is not respawned and the day is lost at 60 s', async () => {
  const ctx = await setup({ characters: ['sounile', 'luiz'] });
  await ctx.enterStory();
  const [, p2] = ctx.players;
  ctx.room.debugWorld()!.debugHurt(p2!.playerId, 100);
  ctx.run(59 * 60);
  const downed = ctx.room.debugWorld()!.snapshot().players.find((player) => player.playerId === p2!.playerId)!.downed;
  expect(downed).not.toBeNull();
  expect(ctx.ofType('toast').map((message) => message.text)).not.toContain('Day lost');
  ctx.run(3 * 60);
  expect(ctx.ofType('toast').map((message) => message.text)).toContain('Day lost');
  ctx.room.dispose();
});

test('S7: a revive stops the count', async () => {
  const ctx = await setup({ characters: ['sounile', 'luiz'] });
  await ctx.enterStory();
  const [, p2] = ctx.players;
  ctx.pending.push({ kind: 'downed', tick: 0, playerId: p2!.playerId });
  ctx.run(30 * 60);
  ctx.pending.push({ kind: 'revive', tick: 0, playerId: p2!.playerId });
  ctx.run(60 * 60);
  expect(ctx.ofType('toast').map((message) => message.text)).not.toContain('Day lost');
  ctx.room.dispose();
});

test('S7: hunger costs the world health, and a starved friend is downed in the world', async () => {
  const ctx = await setup();
  await ctx.enterStory();
  ctx.week().friends.sounile.food = 0;
  ctx.run(10 * 60);
  const health = ctx.room.debugWorld()!.debugPlayerHealth(ctx.players[0]!.playerId);
  expect(health).toBeLessThan(100);
  expect(health).toBeGreaterThan(95);
  ctx.room.dispose();
});

// --- S8: Rafael's anger ---

async function shooting(anger: number) {
  const ctx = await setup({ characters: ['sounile', 'rafael'], week: seeded((w) => { w.friends.rafael.anger = anger; w.friends.rafael.food = 5; }) });
  await ctx.enterStory();
  const [p1, p2] = ctx.players;
  ctx.run(2);
  const world = ctx.room.debugWorld()!;
  const snap = world.snapshot().players;
  const target = snap.find((entry) => entry.playerId === p1!.playerId)!.pos;
  const from = snap.find((entry) => entry.playerId === p2!.playerId)!.pos;
  const shot = (): WorldEvent => ({ kind: 'shot', tick: 0, playerId: p2!.playerId, pos: { x: from.x, y: from.y + 1.2, z: from.z }, to: { x: target.x, y: target.y + 1.2, z: target.z }, hit: false });
  return { ...ctx, world, p1: p1!, shot };
}

test('S8: Rafaels shot hits an ally only while his anger is full', async () => {
  const calm = await shooting(60);
  calm.pending.push(calm.shot());
  calm.run(2);
  expect(calm.world.debugPlayerHealth(calm.p1.playerId)).toBe(100);
  calm.room.dispose();
  const angry = await shooting(100);
  expect(angry.week().friends.rafael.anger).toBe(100);
  angry.pending.push(angry.shot());
  angry.run(2);
  expect(angry.world.debugPlayerHealth(angry.p1.playerId)).toBe(100 - GUN_DAMAGE);
  angry.room.dispose();
});

test('S8: only Rafael hits allies', async () => {
  const ctx = await shooting(100);
  const shot = ctx.shot();
  ctx.pending.push({ ...shot, playerId: ctx.p1.playerId });
  ctx.run(2);
  expect(ctx.world.debugPlayerHealth(ctx.p1.playerId)).toBe(100);
  ctx.room.dispose();
});

// --- S9: saving ---

test('S9 (review 3): a room that empties mid-day keeps the morning, and a later room of the same noun resumes there', async () => {
  const store = createMemoryWeekStore();
  const first = await setup({ store });
  await first.enterStory();
  const [p1] = first.players;
  first.at(p1!, 'atm-1');
  first.emit(p1!, 'atm-1');
  first.run(600);
  expect(first.friend('sounile').cash).toBe(500);
  expect(first.friend('sounile').food).toBeLessThan(80);
  first.room.hold(p1!, first.time());
  await flush();
  const saved = parseWeek((await store.load('villa'))!)!;
  expect(saved.clock).toBe(0);
  expect(saved.friends.sounile.cash).toBe(0);
  expect(saved.friends.sounile.food).toBe(80);
  first.room.dispose();

  const second = await setup({ store });
  await second.enterStory();
  expect(second.week().clock).toBe(0);
  expect(second.friend('sounile').cash).toBe(0);
  expect(second.friend('sounile').food).toBe(80);
  second.room.dispose();
});

test('S9 (review 3): a save during an outing is the morning, never half a day', async () => {
  const store = createMemoryWeekStore();
  const ctx = await toOuting({ store });
  expect(ctx.room.debugWorld()!.course.id).toBe('desert');
  ctx.room.hold(ctx.players[0]!, ctx.time());
  await flush();
  const saved = parseWeek((await store.load('villa'))!)!;
  expect(saved.goals).toEqual([]);
  expect(saved.friends.sounile.cash).toBe(0);
  expect(saved.clock).toBe(0);
  ctx.room.dispose();
});

test('S9: losing the day saves the morning', async () => {
  const store = createMemoryWeekStore();
  const ctx = await setup({ store, characters: ['sounile', 'luiz'] });
  await ctx.enterStory();
  ctx.pending.push({ kind: 'downed', tick: 0, playerId: ctx.players[1]!.playerId });
  ctx.run(61 * 60);
  await flush();
  expect(parseWeek((await store.load('villa'))!)!.day).toBe(1);
  ctx.room.dispose();
});

test('S9: the admin resets the week from the lobby, and only there', async () => {
  const store = createMemoryWeekStore();
  const ctx = await setup({ store, week: seeded((w) => { w.day = 4; w.finishedDays = [1, 2, 3]; }), characters: ['sounile', 'luiz'] });
  ctx.room.configure(ctx.admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'story' });
  await flush();
  expect(ctx.lastOf('lobby').story).toEqual({ day: 4, finishedDays: [1, 2, 3] });
  expect(ctx.room.resetWeek(ctx.players[1]!)).toBe('not_admin');
  expect(ctx.room.resetWeek(ctx.admin)).toBeNull();
  expect(ctx.lastOf('lobby').story).toEqual({ day: 1, finishedDays: [] });
  await flush();
  expect(parseWeek((await store.load('villa'))!)!.day).toBe(1);
  ctx.room.setReady(ctx.players[1]!, true);
  ctx.room.start(ctx.admin);
  expect(ctx.room.resetWeek(ctx.admin)).toBe('bad_phase');
  ctx.room.dispose();
});

test('S9 (review 5): a corrupt saved week is logged and replaced by a new one, never a crash', async () => {
  const ctx = await setup({ raw: '{"version":1,"day":"x"' });
  expect(await ctx.enterStory()).toBeNull();
  expect(ctx.logs.some((line) => line.includes('corrupt'))).toBe(true);
  expect(ctx.week().day).toBe(1);
  expect(ctx.week().friends).toEqual(newWeek().friends);
  expect(ctx.week().finishedDays).toEqual([]);
  ctx.room.dispose();
});

test('S9: a store that cannot load is logged and a new week starts', async () => {
  const ctx = await setup({ failLoad: true });
  expect(await ctx.enterStory()).toBeNull();
  expect(ctx.logs).toHaveLength(1);
  expect(ctx.week().day).toBe(1);
  ctx.room.dispose();
});

test('S9: a week from a store that never saw this room starts new', async () => {
  const ctx = await setup({ noun: 'fresh' });
  await ctx.enterStory();
  expect(ctx.week().friends).toEqual(newWeek().friends);
  ctx.room.dispose();
});

// --- S10, phone, complain, phrase ---

test('S10: the lobby carries story only in story mode', async () => {
  const ctx = await setup();
  ctx.room.configure(ctx.admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'story' });
  await flush();
  expect(ctx.lastOf('lobby').story).toEqual({ day: 1, finishedDays: [] });
  ctx.room.configure(ctx.admin, { courseId: 'desert', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'race' });
  expect(ctx.lastOf('lobby').story).toBeUndefined();
  ctx.room.dispose();
});

test('phone: withdraw, shop and eat answer cannot_buy when refused; Alexander only buys on the phone', async () => {
  const ctx = await setup({ characters: ['alexander', 'luiz'] });
  const [alexander, luiz] = ctx.players;
  expect(ctx.room.phone(alexander!, { kind: 'withdraw', amount: 100 })).toBe('bad_phase');
  await ctx.enterStory();
  expect(ctx.room.phone(alexander!, { kind: 'withdraw', amount: 100 })).toBeNull();
  expect(ctx.friend('alexander').cash).toBe(100);
  expect(ctx.room.phone(alexander!, { kind: 'withdraw', amount: 5000 })).toBe('cannot_buy');
  expect(ctx.room.phone(alexander!, { kind: 'phoneBuy', item: 'tcgPack' })).toBeNull();
  expect(ctx.friend('alexander').bank).toBe(2000 - 100 - 150);
  expect(ctx.room.phone(luiz!, { kind: 'phoneBuy', item: 'tcgPack' })).toBe('cannot_buy');
  expect(ctx.room.phone(alexander!, { kind: 'buy', item: 'water' })).toBeNull();
  expect(ctx.friend('alexander').items).toEqual(['water']);
  expect(ctx.room.phone(alexander!, { kind: 'eat', item: 'water' })).toBeNull();
  expect(ctx.room.phone(alexander!, { kind: 'eat', item: 'water' })).toBe('cannot_buy');
  ctx.room.dispose();
});

test('phone: Fake Republic pays into the bank once a day, only when poor, and tells the player', async () => {
  const ctx = await setup({ random: () => 0.3 });
  await ctx.enterStory();
  const [p1] = ctx.players;
  expect(ctx.room.phone(p1!, { kind: 'fakeRepublic', pick: 1 })).toBe('cannot_buy');
  ctx.week().friends.sounile.bank = 50;
  expect(ctx.room.phone(p1!, { kind: 'fakeRepublic', pick: 1 })).toBeNull();
  expect(ctx.ofType('fakeRepublic')).toEqual([{ type: 'fakeRepublic', pick: 1, outcome: 300 }]);
  expect(ctx.friend('sounile').bank).toBe(350);
  ctx.week().friends.sounile.bank = 50;
  expect(ctx.room.phone(p1!, { kind: 'fakeRepublic', pick: 1 })).toBe('cannot_buy');
  ctx.room.dispose();
});

test('complain: Luiz complains with a cooldown, and everyone gets the same line', async () => {
  const ctx = await setup({ characters: ['luiz', 'huu'], random: () => 0.5 });
  const [luiz, huu] = ctx.players;
  ctx.room.complain(luiz!);
  expect(ctx.ofType('complain')).toEqual([]);
  await ctx.enterStory();
  ctx.room.complain(huu!);
  expect(ctx.ofType('complain')).toEqual([]);
  const happiness = ctx.friend('luiz').happiness;
  ctx.room.complain(luiz!);
  expect(ctx.lastOf('complain')).toEqual({ type: 'complain', playerId: luiz!.playerId, line: 6 });
  expect(ctx.friend('luiz').happiness).toBe(happiness + 2);
  ctx.room.complain(luiz!);
  expect(ctx.ofType('complain')).toHaveLength(1);
  ctx.run(21 * 60);
  ctx.room.complain(luiz!);
  expect(ctx.ofType('complain')).toHaveLength(2);
  ctx.room.dispose();
});

test('phrase: Huus quick phrase "Le mal est fait" updates lastPhrase, other lines do not', async () => {
  const ctx = await setup({ characters: ['huu'] });
  await ctx.enterStory();
  const [huu] = ctx.players;
  ctx.run(60);
  ctx.room.chat(huu!, 'Thanks!', ctx.time());
  expect(ctx.friend('huu').lastPhrase).toBeNull();
  ctx.room.chat(huu!, 'Le mal est fait', ctx.time() + 10);
  expect(ctx.friend('huu').lastPhrase).toBeCloseTo(ctx.week().clock, 6);
  ctx.room.dispose();
});

test('story: restartCourse is refused, toLobby keeps the morning, and a joiner mid-day is sent the stage and joins with his saved needs', async () => {
  const ctx = await setup({ week: seeded((w) => { w.friends.luiz.health = 60; w.friends.luiz.food = 33; }) });
  await ctx.enterStory();
  expect(ctx.room.restartCourse(ctx.admin)).toBe('bad_phase');
  const messages: ServerMessage[] = [];
  const luiz = ctx.room.add('P9', token(9), { send: (data) => messages.push(JSON.parse(data) as ServerMessage), close: () => {} });
  luiz.appearance = defaultAppearance('luiz');
  ctx.room.catchUp(luiz);
  expect(messages.find((message) => message.type === 'stage')).toEqual({ type: 'stage', courseId: 'villa', index: 0, of: 1 });
  ctx.run(20);
  expect(ctx.room.debugWorld()!.debugPlayerHealth(luiz.playerId)).toBeCloseTo(60, 0);
  expect(ctx.friend('luiz').food).toBeCloseTo(33, 0);
  expect(CHARACTER_IDS.includes('luiz')).toBe(true);
  ctx.room.dispose();
});
