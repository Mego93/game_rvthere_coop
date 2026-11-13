import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { DOWNED_TIMEOUT, PLAYER_EYE_HEIGHT, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, PLAYER_REVIVE_HEALTH, TICK_RATE } from './constants';
import { add, length, rotate, sub, vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const make = (...ids: string[]): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  worlds.push(world);
  for (const id of ids) world.addPlayer(id);
  return world;
};
const me = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!;
const run = (world: World, ticks: number, inputs: Map<string, PlayerInput> = new Map()): WorldEvent[] => {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(inputs));
  return events;
};
const kinds = (events: WorldEvent[], kind: string, playerId?: string) =>
  events.filter((event) => event.kind === kind && (playerId === undefined || event.playerId === playerId));

// p2 stands clear of everything, so p1 is never the only player.
function pair() {
  const world = make('p1', 'p2');
  world.teleportPlayer('p2', vec3(30, 0.02, 30));
  run(world, 30);
  return world;
}

const fallFrom = (world: World, id: string, feet: Vec3) => {
  world.teleportPlayer(id, feet);
  run(world, 150);
  return PLAYER_MAX_HEALTH - me(world, id).health;
};

describe('falls (W1)', () => {
  test('W1: a fall at 12.43 m/s costs (landing - 9) * 10', () => {
    const world = pair();
    const events: WorldEvent[] = [];
    world.teleportPlayer('p1', vec3(5, 8.02, 20));
    events.push(...run(world, 150));
    expect(me(world, 'p1').health).toBe(65);
    expect(kinds(events, 'hurt', 'p1')).toHaveLength(1);
    expect(kinds(events, 'downed')).toHaveLength(0);
  });

  test('W1: 8.99 m/s costs nothing and 5.02 m up costs about 8', () => {
    const world = pair();
    expect(fallFrom(world, 'p1', vec3(5, 4.22, 20))).toBe(0);
    // 8.1 damage leaves 91.9, which the snapshot rounds down to 91.
    expect(fallFrom(world, 'p2', vec3(5, 5.02, 20))).toBe(9);
  });

  test('W1: a jump in place costs nothing', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    run(world, 1, new Map([['p1', input({ jump: true })]]));
    run(world, 90);
    expect(me(world, 'p1').health).toBe(100);
  });

  test('W1: walking off the top edge of the 12 degree ramp costs nothing', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(8, 1.24, -65.7));
    run(world, 180, new Map([['p1', input({ moveY: 1 })]]));
    expect(me(world, 'p1').pos.z).toBeLessThan(-67);
    expect(me(world, 'p1').health).toBe(100);
  });

  test('a respawn or a teleport is not a landing', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 60);
    world.teleportPlayer('p1', vec3(7, 3.02, 20));
    world.teleportPlayer('p1', vec3(7, 0.02, 20));
    run(world, 60);
    expect(me(world, 'p1').health).toBe(100);
  });
});

describe('downed (W4)', () => {
  test('W4: health reaching 0 downs the player, with the events, and further damage does nothing', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    const events = run(world, 1);
    expect(me(world, 'p1').health).toBe(0);
    expect(me(world, 'p1').downed).toBe(DOWNED_TIMEOUT);
    expect(kinds(events, 'hurt', 'p1')).toHaveLength(1);
    expect(kinds(events, 'downed', 'p1')).toHaveLength(1);
    expect(kinds(events, 'downed', 'p1')[0]!.pos).toEqual(me(world, 'p1').pos);
    world.debugHurt('p1', 10);
    const later = run(world, 1);
    expect(kinds(later, 'hurt')).toHaveLength(0);
    expect(me(world, 'p1').health).toBe(0);
  });

  test('W4: a fall to 0 downs the player', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 20.02, 20));
    const events = run(world, 200);
    expect(kinds(events, 'downed', 'p1')).toHaveLength(1);
    expect(me(world, 'p1').downed).not.toBeNull();
  });

  test('W4: the held crate is released in place', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(10, 0.02, 9));
    run(world, 20);
    run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.2 })]]));
    run(world, 1);
    const held = me(world, 'p1').hands;
    expect(held).not.toBeNull();
    world.debugHurt('p1', 100);
    run(world, 1);
    expect(me(world, 'p1').hands).toBeNull();
    const crate = world.debugBody(held!)!;
    expect(length(crate.linvel())).toBeLessThan(1);
  });

  test('W4: a held hook is on the ground', () => {
    const world = pair();
    const body = world.debugBody('vehicle')!;
    const mount = add(body.translation(), rotate(body.rotation(), world.vehicleConfig.winchMount));
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    const eye = add(me(world, 'p1').pos, vec3(0, PLAYER_EYE_HEIGHT, 0));
    const d = sub(mount, eye);
    const aim = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y / length(d)) };
    run(world, 1, new Map([['p1', input({ interact: true, ...aim })]]));
    run(world, 1, new Map([['p1', input(aim)]]));
    expect(me(world, 'p1').hands).toBe('hook');
    world.debugHurt('p1', 100);
    run(world, 1);
    expect(me(world, 'p1').hands).toBeNull();
    expect(world.snapshot().cable.state).toBe('ground');
    expect(world.snapshot().cable.holderId).toBeNull();
  });

  test('W4: input is ignored while downed and gravity still applies', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    const before = me(world, 'p1').pos;
    run(world, 30, new Map([['p1', input({ moveY: 1, moveX: 1, jump: true, yaw: 1.5 })]]));
    const after = me(world, 'p1');
    expect(after.pos.x).toBeCloseTo(before.x, 3);
    expect(after.pos.z).toBeCloseTo(before.z, 3);
    expect(after.pos.y).toBeCloseTo(before.y, 3);
    expect(after.yaw).toBeCloseTo(0, 6);
    world.teleportPlayer('p1', vec3(5, 6.02, 20));
    run(world, 10);
    expect(me(world, 'p1').pos.y).toBeLessThan(5.95);
    run(world, 150);
    expect(me(world, 'p1').pos.y).toBeCloseTo(0.02, 1);
    expect(me(world, 'p1').downed).not.toBeNull();
  });

  test('a button held through the downed time is not a press on revival', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    const holding = new Map([['p1', input({ jump: true })]]);
    run(world, 60, holding);
    // Respawned by the timeout while jump is still held: no jump.
    run(world, 1800, holding);
    expect(me(world, 'p1').downed).toBeNull();
    run(world, 1, holding);
    expect(me(world, 'p1').vy).toBeLessThanOrEqual(0);
  });
});

describe('respawns (W5, W9, W10)', () => {
  test('W5: a downed player respawns at findSpawn after exactly 30 s with 50 health', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    const respawns = world.snapshot().respawns;
    run(world, 1799);
    expect(me(world, 'p1').downed).not.toBeNull();
    const events = run(world, 1);
    expect(me(world, 'p1').downed).toBeNull();
    expect(me(world, 'p1').health).toBe(PLAYER_REVIVE_HEALTH);
    expect(world.snapshot().respawns).toBe(respawns + 1);
    const respawn = kinds(events, 'respawn', 'p1');
    expect(respawn).toHaveLength(1);
    expect(respawn[0]!.pos).toBeDefined();
    expect(length(sub(me(world, 'p1').pos, respawn[0]!.pos!))).toBeLessThan(0.5);
  });

  test('W5: the respawn comes at tick T + 1800 and the downed timer counts down', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    expect(me(world, 'p1').downed).toBe(DOWNED_TIMEOUT);
    run(world, 60);
    expect(me(world, 'p1').downed).toBeCloseTo(DOWNED_TIMEOUT - 1, 6);
  });

  test('W9: two players downed on the same tick respawn at once, counted twice', () => {
    const world = make('p1', 'p2');
    run(world, 10);
    const before = world.snapshot().respawns;
    world.debugHurt('p1', 100);
    world.debugHurt('p2', 100);
    const events = run(world, 1);
    expect(kinds(events, 'downed')).toHaveLength(2);
    expect(kinds(events, 'respawn').map((event) => event.playerId)).toEqual(['p1', 'p2']);
    expect(world.snapshot().respawns).toBe(before + 2);
    for (const id of ['p1', 'p2']) {
      expect(me(world, id).downed).toBeNull();
      expect(me(world, id).health).toBe(PLAYER_REVIVE_HEALTH);
    }
  });

  test('W9: p1 downed at T and p2 at T + 5 both respawn at T + 5', () => {
    const world = make('p1', 'p2');
    run(world, 10);
    const before = world.snapshot().respawns;
    world.debugHurt('p1', 100);
    run(world, 1);
    expect(me(world, 'p1').downed).not.toBeNull();
    run(world, 4);
    expect(me(world, 'p1').downed).not.toBeNull();
    world.debugHurt('p2', 100);
    const events = run(world, 1);
    expect(kinds(events, 'respawn')).toHaveLength(2);
    expect(world.snapshot().respawns).toBe(before + 2);
    expect(me(world, 'p1').downed).toBeNull();
    expect(me(world, 'p2').downed).toBeNull();
  });

  test('W9: a solo player downed respawns on that tick', () => {
    const world = make('p1');
    run(world, 10);
    world.debugHurt('p1', 100);
    const events = run(world, 1);
    expect(kinds(events, 'downed')).toHaveLength(1);
    expect(kinds(events, 'respawn')).toHaveLength(1);
    expect(me(world, 'p1').downed).toBeNull();
    expect(me(world, 'p1').health).toBe(PLAYER_REVIVE_HEALTH);
    expect(world.snapshot().respawns).toBe(1);
  });

  test('W9: with p1 downed and p2 removed, p1 respawns on the next step', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    expect(me(world, 'p1').downed).not.toBeNull();
    world.removePlayer('p2');
    const events = run(world, 1);
    expect(kinds(events, 'respawn', 'p1')).toHaveLength(1);
    expect(me(world, 'p1').downed).toBeNull();
  });

  test('W10: a downed player below the kill plane respawns once after 3 s, with 50 health, counted once', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    const before = world.snapshot().respawns;
    world.teleportPlayer('p1', vec3(60, world.course.killPlaneY - 1, 40));
    const timer = me(world, 'p1').downed;
    const events = run(world, Math.round(PLAYER_KILL_RESPAWN_DELAY * TICK_RATE) + 3);
    expect(timer).not.toBeNull();
    expect(kinds(events, 'respawn', 'p1')).toHaveLength(1);
    expect(world.snapshot().respawns).toBe(before + 1);
    expect(me(world, 'p1').health).toBe(PLAYER_REVIVE_HEALTH);
    expect(me(world, 'p1').downed).toBeNull();
    // The downed timer did not also fire.
    expect(run(world, 60).filter((event) => event.kind === 'respawn')).toHaveLength(0);
  });
});

describe('restart (W11)', () => {
  const CP1 = vec3(0, 0.95, -50);
  const recordCp1 = (world: World) => {
    const body = world.debugBody('vehicle')!;
    body.setTranslation(CP1, true);
    body.setLinvel(vec3(0, 0, 0), true);
    world.step(new Map());
    expect(world.snapshot().checkpoint).toBe(1);
  };
  const restart = (world: World) => {
    world.restartCheckpoint();
    return world.step(new Map());
  };

  test('W11: health recorded at 30 is restored to 50, 80 stays 80, a downed player is revived, a late joiner gets 100', () => {
    const world = make('p1', 'p2', 'p3');
    run(world, 30);
    world.debugHurt('p1', 70);
    world.debugHurt('p2', 20);
    run(world, 1);
    recordCp1(world);
    expect(me(world, 'p1').health).toBe(30);
    expect(me(world, 'p2').health).toBe(80);
    world.addPlayer('p4');
    world.debugHurt('p4', 60);
    world.debugHurt('p3', 100);
    run(world, 2);
    expect(me(world, 'p3').downed).not.toBeNull();
    expect(me(world, 'p4').health).toBe(40);
    const events = restart(world);
    expect(kinds(events, 'revive')).toHaveLength(0);
    expect(events.some((event) => event.kind === 'vehicleLost')).toBe(true);
    expect(me(world, 'p1').health).toBe(50);
    expect(me(world, 'p2').health).toBe(80);
    expect(me(world, 'p3').health).toBe(PLAYER_MAX_HEALTH);
    expect(me(world, 'p3').downed).toBeNull();
    expect(me(world, 'p4').health).toBe(PLAYER_MAX_HEALTH);
  });

  test('a player who joins mid-run starts at 100', () => {
    const world = make('p1');
    run(world, 5);
    world.addPlayer('p2');
    expect(me(world, 'p2').health).toBe(PLAYER_MAX_HEALTH);
    expect(me(world, 'p2').downed).toBeNull();
  });
});

describe('determinism (W13)', () => {
  test('W13: two worlds with the same inputs through a fall, a downed timer and a respawn have equal snapshots', () => {
    const script = (world: World) => {
      world.addPlayer('p1');
      world.addPlayer('p2');
      world.teleportPlayer('p2', vec3(30, 0.02, 30));
      for (let i = 0; i < 600; i++) {
        if (i === 10) world.teleportPlayer('p1', vec3(5, 8.02, 20));
        if (i === 200) world.debugHurt('p1', 100);
        const move = i % 90 < 45 ? 1 : -1;
        world.step(new Map([['p1', input({ moveY: move, yaw: i / 100 })], ['p2', input({ moveX: 1 })]]));
      }
      return world.snapshot();
    };
    const a = make();
    const b = make();
    const first = script(a);
    const second = script(b);
    expect(first.players[0]!.downed).not.toBeNull();
    expect(first.players[0]!.health).toBe(0);
    expect(second).toEqual(first);
  });
});
