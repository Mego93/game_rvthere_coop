import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { DOWNED_TIMEOUT, HEALTH_KIT_HEAL, HEAL_RANGE, HOLD_DURATION, PLAYER_EYE_HEIGHT, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, PLAYER_REVIVE_HEALTH, TICK_RATE } from './constants';
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
  return PLAYER_MAX_HEALTH - world.debugPlayerHealth(id);
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

  test('W1: 8.99 m/s costs nothing and 5.02 m up costs 8.1 within 0.5', () => {
    const world = pair();
    expect(fallFrom(world, 'p1', vec3(5, 4.22, 20))).toBe(0);
    expect(Math.abs(fallFrom(world, 'p2', vec3(5, 5.02, 20)) - 8.1)).toBeLessThan(0.5);
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
    world.teleportPlayer('p1', vec3(-2, 0.02, 15.2));
    run(world, 30);
    run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.45 })]]));
    run(world, 1);
    expect(me(world, 'p1').inventory[me(world, 'p1').slot]).toBe('toolbox');
    world.debugHurt('p1', 100);
    const holding = new Map([['p1', input({ drop: true })]]);
    run(world, 1);
    expect(me(world, 'p1').downed).not.toBeNull();
    // Drop is held through the whole downed time and is not a press while downed.
    run(world, 1799, holding);
    expect(me(world, 'p1').downed).not.toBeNull();
    expect(me(world, 'p1').inventory[me(world, 'p1').slot]).toBe('toolbox');
    run(world, 1, holding);
    expect(me(world, 'p1').downed).toBeNull();
    // The first live tick after the respawn: the held drop is still not a press.
    run(world, 1, holding);
    expect(me(world, 'p1').inventory[me(world, 'p1').slot]).toBe('toolbox');
    // A fresh press does drop it.
    run(world, 1);
    run(world, 1, holding);
    expect(me(world, 'p1').inventory[me(world, 'p1').slot]).toBeNull();
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

describe('the downed timer and the kill plane (W10)', () => {
  test('W10: the timer is paused while respawnIn is set; the kill plane respawns once, after 3 s', () => {
    const world = pair();
    world.debugHurt('p1', 100);
    run(world, 1);
    // About 29 s down, so a running timer would run out within the 3 s below.
    run(world, 1740);
    expect(me(world, 'p1').downed).toBeLessThan(1.5);
    const before = world.snapshot().respawns;
    world.teleportPlayer('p1', vec3(60, world.course.killPlaneY - 1, 40));
    const delay = Math.round(PLAYER_KILL_RESPAWN_DELAY * TICK_RATE);
    const early = run(world, delay - 5);
    expect(kinds(early, 'respawn', 'p1')).toHaveLength(0);
    // The downed timer has not moved while respawnIn is set.
    expect(me(world, 'p1').downed).toBeLessThan(1.5);
    expect(me(world, 'p1').downed).toBeGreaterThan(0.5);
    const events = run(world, 10);
    expect(kinds(events, 'respawn', 'p1')).toHaveLength(1);
    expect(world.snapshot().respawns).toBe(before + 1);
    expect(me(world, 'p1').downed).toBeNull();
    expect(me(world, 'p1').health).toBe(PLAYER_REVIVE_HEALTH);
    expect(kinds(run(world, 120), 'respawn')).toHaveLength(0);
  });
});

describe('vehicle hits (W2)', () => {
  const driveInto = (world: World) => {
    world.teleportPlayer('p1', vec3(30, 0.02, 30));
    world.teleportPlayer('p2', vec3(0, 0.02, -7));
    run(world, 30);
    world.debugBody('vehicle')!.setLinvel(vec3(0, 0, -10), true);
  };

  test('W2: the Lodgy driven into a standing player at 10 m/s hurts once, about 40, at about tick 26', () => {
    const world = make('p1', 'p2');
    driveInto(world);
    let hitTick = -1;
    let hurts = 0;
    for (let i = 0; i < 120; i++) {
      const events = world.step(new Map());
      for (const event of kinds(events, 'hurt', 'p2')) {
        hurts += 1;
        hitTick = i;
        expect(event.playerId).toBe('p2');
      }
    }
    // Still being shoved along: contact keeps the cooldown live, so no second hit.
    expect(hurts).toBe(1);
    expect(hitTick).toBeGreaterThanOrEqual(22);
    expect(hitTick).toBeLessThanOrEqual(30);
    expect(Math.abs(PLAYER_MAX_HEALTH - world.debugPlayerHealth('p2') - 39.5)).toBeLessThan(1.5);
    expect(me(world, 'p2').pos.z).toBeLessThan(-9);
  });

  test('W2: no more damage for 0.5 s after the hit, and none while the contact lasts', () => {
    const world = make('p1', 'p2');
    driveInto(world);
    run(world, 30);
    const healthAfter = world.debugPlayerHealth('p2');
    expect(healthAfter).toBeLessThan(PLAYER_MAX_HEALTH);
    const events = run(world, 30);
    expect(kinds(events, 'hurt', 'p2')).toHaveLength(0);
    expect(world.debugPlayerHealth('p2')).toBe(healthAfter);
  });

  test('W2: a seated player in the vehicle takes nothing', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p1', vec3(30, 0.02, 30));
    run(world, 30);
    run(world, 1, new Map([['p2', input({ interact: true })]]));
    expect(me(world, 'p2').seat).not.toBeNull();
    world.debugBody('vehicle')!.setLinvel(vec3(0, 0, -10), true);
    run(world, 60);
    expect(world.debugPlayerHealth('p2')).toBe(PLAYER_MAX_HEALTH);
  });

  test('W2: walking at full speed into the parked Lodgy costs nothing, and so does jumping into it', () => {
    for (const jumping of [false, true]) {
      const world = make('p1', 'p2');
      world.teleportPlayer('p2', vec3(30, 0.02, 30));
      world.teleportPlayer('p1', vec3(0, 0.02, -8));
      run(world, 30);
      for (let i = 0; i < 120; i++) {
        world.step(new Map([['p1', input({ moveY: 1, yaw: Math.PI, jump: jumping && i % 40 === 0 })]]));
      }
      // It reached the vehicle: held up short of where it would have walked to.
      expect(me(world, 'p1').pos.z).toBeGreaterThan(-3);
      expect(me(world, 'p1').pos.z).toBeLessThan(0);
      expect(world.debugPlayerHealth('p1')).toBe(PLAYER_MAX_HEALTH);
    }
  });
});

describe('prop hits (W3)', () => {
  const crateAt = (world: World, pos: Vec3, vel: Vec3) => {
    const body = world.debugBody('crate-1')!;
    body.setTranslation(pos, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel(vel, true);
    body.setAngvel(vec3(0, 0, 0), true);
  };

  test('W3: a crate thrown at a teammate costs at most 10, and more than 0', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p1', vec3(0, 0.02, 20));
    world.teleportPlayer('p2', vec3(0, 0.02, 18));
    crateAt(world, vec3(0, 0.5, 19), vec3(0, 0, 0));
    run(world, 30);
    run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.6 })]]));
    run(world, 1, new Map([['p1', input()]]));
    expect(me(world, 'p1').hands).toBe('crate-1');
    run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: 0 })]]));
    const events = run(world, 40, new Map([['p1', input()]]));
    const damage = PLAYER_MAX_HEALTH - world.debugPlayerHealth('p2');
    expect(kinds(events, 'hurt', 'p2')).toHaveLength(1);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThanOrEqual(10);
    expect(Math.abs(damage - 5.4)).toBeLessThan(1);
  });

  test('W3: a crate given 12 m/s by debugBody hurts, about 30', () => {
    const world = pair();
    world.teleportPlayer('p2', vec3(0, 0.02, 18));
    run(world, 30);
    crateAt(world, vec3(0, 1.0, 16.5), vec3(0, 0, 12));
    const events = run(world, 40);
    expect(kinds(events, 'hurt', 'p2')).toHaveLength(1);
    expect(Math.abs(PLAYER_MAX_HEALTH - world.debugPlayerHealth('p2') - 30)).toBeLessThan(2);
  });

  test('W3: a crate lying on the ground does not hurt a player who walks into it', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(10, 0.02, 14));
    run(world, 30);
    run(world, 120, new Map([['p1', input({ moveY: 1 })]]));
    expect(me(world, 'p1').pos.z).toBeLessThan(10);
    expect(world.debugPlayerHealth('p1')).toBe(PLAYER_MAX_HEALTH);
  });

  test('W3: a player standing on a prop is not hit by it', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(10, 0.02, 14));
    run(world, 30);
    const body = world.debugBody('crate-1')!;
    const top = body.translation().y + 0.5;
    world.teleportPlayer('p1', vec3(body.translation().x, top + 0.3, body.translation().z));
    run(world, 40);
    expect(me(world, 'p1').ground).not.toBeNull();
    body.setLinvel(vec3(0, 0, 8), true);
    run(world, 20);
    expect(world.debugPlayerHealth('p1')).toBe(PLAYER_MAX_HEALTH);
  });
});

describe('hit cooldowns (W11)', () => {
  // A crate comes at the player's chest from +x at 12 m/s.
  const shoot = (world: World, id: string) => {
    const pos = me(world, id).pos;
    const body = world.debugBody('crate-1')!;
    body.setTranslation(vec3(pos.x + 1.5, pos.y + 0.98, pos.z), true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel(vec3(-12, 0, 0), true);
    body.setAngvel(vec3(0, 0, 0), true);
  };
  const stash = (world: World) => {
    const body = world.debugBody('crate-1')!;
    body.setTranslation(vec3(-50, 0.5, 50), true);
    body.setLinvel(vec3(0, 0, 0), true);
    body.setAngvel(vec3(0, 0, 0), true);
  };
  const hurts = (events: WorldEvent[], id: string) => kinds(events, 'hurt', id).length;

  test('a second hit by the same body within 0.5 s does nothing', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
    stash(world);
    run(world, 2);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(0);
  });

  test('cooldowns count down: a second hit after 0.5 s without contact hurts', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
    stash(world);
    run(world, 40);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
  });

  test('everyone downed clears the cooldown: a hit right after the respawn hurts', () => {
    const world = make('p1');
    run(world, 30);
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
    stash(world);
    world.debugHurt('p1', 100);
    const events = run(world, 1);
    expect(kinds(events, 'respawn', 'p1')).toHaveLength(1);
    run(world, 10);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
  });

  test('W11: a crate hit at T, a restart at T + 1 and a second 12 m/s crate at T + 5 hurts', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(0, 0.95, -50));
    world.debugBody('vehicle')!.setTranslation(vec3(0, 0.95, -50), true);
    run(world, 30);
    expect(world.snapshot().checkpoint).toBe(1);
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
    stash(world);
    world.restartCheckpoint();
    run(world, 1);
    expect(world.debugPlayerHealth('p1')).toBe(PLAYER_MAX_HEALTH);
    run(world, 4);
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    shoot(world, 'p1');
    expect(hurts(run(world, 15), 'p1')).toBe(1);
  });
});

describe('the order of a tick (H12) and cooldown clears (J9)', () => {
  const shootAt = (world: World, pos: Vec3) => {
    const body = world.debugBody('crate-1')!;
    body.setTranslation(vec3(pos.x + 1.5, pos.y + 0.98, pos.z), true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel(vec3(-12, 0, 0), true);
    body.setAngvel(vec3(0, 0, 0), true);
  };
  const hurtsOf = (events: WorldEvent[]) => kinds(events, 'hurt', 'p1').length;

  test('H12: a hit that downs the player on the tick of their landing leaves the fall nothing to do', () => {
    const world = pair();
    // Left at 20 health, p1 lands from 5 m at tick 59 of the fall, which costs 8.
    world.debugHurt('p1', 80);
    run(world, 1);
    world.teleportPlayer('p1', vec3(5, 5.02, 20));
    const events: WorldEvent[][] = [];
    for (let i = 0; i < 80; i++) {
      // Timed so that the crate's 30 and the landing's 8 are found on the same tick.
      if (i === 55) {
        const body = world.debugBody('crate-1')!;
        body.setTranslation(vec3(6.5, 1.0, 20), true);
        body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        body.setLinvel(vec3(-12, 0, 0), true);
        body.setAngvel(vec3(0, 0, 0), true);
      }
      events.push(world.step(new Map()));
    }
    const downedAt = events.findIndex((step) => kinds(step, 'downed', 'p1').length > 0);
    expect(downedAt).toBe(59);
    // One hurt: the hit. Had the fall come first, it would have been two.
    expect(events.flat().filter((event) => event.kind === 'hurt' && event.playerId === 'p1')).toHaveLength(1);
    expect(world.debugPlayerHealth('p1')).toBe(0);
  });

  test('J9: a downed player is not hurt by a crate, and the downed timeout respawn leaves them open to the next one', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    world.debugHurt('p1', 100);
    run(world, 1);
    shootAt(world, me(world, 'p1').pos);
    expect(hurtsOf(run(world, 15))).toBe(0);
    run(world, 1784);
    expect(me(world, 'p1').downed).not.toBeNull();
    const respawn = run(world, 1);
    expect(kinds(respawn, 'respawn', 'p1')).toHaveLength(1);
    expect(me(world, 'p1').downed).toBeNull();
    shootAt(world, me(world, 'p1').pos);
    const second = run(world, 15);
    expect(hurtsOf(second)).toBe(1);
  });

  test('J9: the kill plane respawn clears the cooldowns: a hit right after it hurts, though a body was touching until it', () => {
    const world = pair();
    world.teleportPlayer('p1', vec3(5, 0.02, 20));
    run(world, 30);
    shootAt(world, me(world, 'p1').pos);
    expect(hurtsOf(run(world, 15))).toBe(1);
    world.teleportPlayer('p1', vec3(60, world.course.killPlaneY - 1, 40));
    // The crate keeps touching the falling player, so the cooldown is refreshed every tick until the respawn.
    let respawned = false;
    for (let i = 0; i < 300 && !respawned; i++) {
      const at = me(world, 'p1').pos;
      const body = world.debugBody('crate-1')!;
      body.setTranslation(vec3(at.x, at.y + 0.9, at.z), true);
      body.setLinvel(vec3(0, 0, 0), true);
      body.setAngvel(vec3(0, 0, 0), true);
      respawned = kinds(world.step(new Map()), 'respawn', 'p1').length > 0;
    }
    expect(respawned).toBe(true);
    shootAt(world, me(world, 'p1').pos);
    expect(hurtsOf(run(world, 15))).toBe(1);
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

describe('health kits (W6, W7, W8, W12)', () => {
  const TICKS = Math.round(HOLD_DURATION * TICK_RATE);
  const AIM = { yaw: 0, pitch: -0.45 };
  // p1 stands 1.5 m south of p2 and looks at them; the slot is p1's first.
  const beside = (world: World, mate = 'p2', gap = 1.5) => {
    const at = me(world, mate).pos;
    world.teleportPlayer('p1', vec3(at.x, 0.02, at.z + gap));
    run(world, 20);
  };
  const holdUse = (world: World, ticks: number, extra: Partial<PlayerInput> = {}) =>
    run(world, ticks, new Map([['p1', input({ use: true, ...AIM, ...extra })]]));
  const withKit = (...ids: string[]) => {
    const world = make('p1', 'p2', ...ids);
    for (const id of ['p2', ...ids]) world.teleportPlayer(id, vec3(30 + 3 * (['p2', ...ids].indexOf(id)), 0.02, 30));
    world.teleportPlayer('p1', vec3(-1, 0.02, 15.2));
    run(world, 30);
    run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.45 })]]));
    run(world, 1);
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
    return world;
  };

  test('H14: the test ground has a health kit pickup after the toolbox', () => {
    const world = make('p1');
    const kinds = world.snapshot().props.map((prop) => `${prop.id}:${prop.kind}`);
    expect(kinds.slice(-2)).toEqual(['toolbox-1:toolbox', 'healthKit-1:healthKit']);
  });

  test('W6: the downed timer pauses while a teammate\'s health-kit hold on them runs, and resumes when it ends', () => {
    const world = withKit();
    world.debugHurt('p2', 100);
    run(world, 1);
    run(world, 60);
    expect(me(world, 'p2').downed).toBeCloseTo(DOWNED_TIMEOUT - 1, 6);
    beside(world);
    // The timer runs during the 20 ticks p1 walked over.
    const before = me(world, 'p2').downed!;
    holdUse(world, 60);
    expect(me(world, 'p1').hold).toMatchObject({ action: 'revive', targetId: 'p2' });
    expect(me(world, 'p2').downed).toBe(before);
    run(world, 1, new Map([['p1', input(AIM)]]));
    expect(me(world, 'p1').hold).toBeNull();
    run(world, 60);
    // The tick that ended the hold counts down too.
    expect(me(world, 'p2').downed).toBeCloseTo(before - 61 / TICK_RATE, 6);
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
  });

  test('W7: a 3 s health-kit hold on a downed player revives them at 50 where they lie, with a revive event, and uses the kit', () => {
    const world = withKit();
    world.debugHurt('p2', 100);
    run(world, 1);
    beside(world);
    const lying = me(world, 'p2').pos;
    const respawns = world.snapshot().respawns;
    const events = holdUse(world, TICKS - 1);
    expect(me(world, 'p2').downed).not.toBeNull();
    expect(kinds(events, 'revive')).toHaveLength(0);
    const last = holdUse(world, 1);
    expect(kinds(last, 'revive', 'p2')).toHaveLength(1);
    expect(length(sub(kinds(last, 'revive', 'p2')[0]!.pos!, lying))).toBeLessThan(0.05);
    expect(kinds(last, 'revive', 'p2')[0]!.tick).toBe(world.snapshot().tick);
    expect(me(world, 'p2').downed).toBeNull();
    expect(me(world, 'p2').health).toBe(PLAYER_REVIVE_HEALTH);
    expect(length(sub(me(world, 'p2').pos, lying))).toBeLessThan(0.05);
    expect(me(world, 'p1').inventory[0]).toBeNull();
    expect(me(world, 'p1').hold).toBeNull();
    expect(world.snapshot().respawns).toBe(respawns);
  });

  const twoRevivers = () => {
    const world = withKit('p3');
    world.debugSetInventory('p3', ['healthKit', null, null]);
    world.debugHurt('p2', 100);
    run(world, 1);
    return world;
  };
  const stand = (world: World, id: string, gap: number) => {
    const at = me(world, 'p2').pos;
    world.teleportPlayer(id, vec3(at.x, 0.02, at.z + gap));
  };
  const holdBy = (id: string) => input({ use: true, ...AIM });

  test('two revivers on one target: only one revive happens, and the second kit is kept', () => {
    const world = twoRevivers();
    stand(world, 'p1', 0.75 * HEAL_RANGE);
    stand(world, 'p3', 0.95 * HEAL_RANGE);
    run(world, 20);
    const events = run(world, TICKS, new Map([['p1', holdBy('p1')], ['p3', holdBy('p3')]]));
    expect(kinds(events, 'revive')).toHaveLength(1);
    expect(me(world, 'p2').downed).toBeNull();
    expect(me(world, 'p2').health).toBe(PLAYER_REVIVE_HEALTH);
    const kits = ['p1', 'p3'].map((id) => me(world, id).inventory[0]);
    expect(kits.filter((kind) => kind === null)).toHaveLength(1);
    expect(kits.filter((kind) => kind === 'healthKit')).toHaveLength(1);
    expect(me(world, 'p1').hold).toBeNull();
    expect(me(world, 'p3').hold).toBeNull();
  });

  test('a revive hold ends, keeping the kit, when the target is revived by someone else mid-hold', () => {
    const world = twoRevivers();
    stand(world, 'p1', 0.75 * HEAL_RANGE);
    stand(world, 'p3', 0.95 * HEAL_RANGE);
    run(world, 20);
    run(world, 30, new Map([['p3', holdBy('p3')]]));
    const both = new Map([['p1', holdBy('p1')], ['p3', holdBy('p3')]]);
    run(world, TICKS - 31, both);
    expect(me(world, 'p1').hold).toMatchObject({ action: 'revive', targetId: 'p2' });
    expect(me(world, 'p2').downed).not.toBeNull();
    const events = run(world, 31, both);
    expect(kinds(events, 'revive')).toHaveLength(1);
    expect(me(world, 'p2').downed).toBeNull();
    expect(me(world, 'p3').inventory[0]).toBeNull();
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
    expect(me(world, 'p1').hold).toBeNull();
  });

  test('W8: a health kit on a hurt teammate adds 50, capped at 100', () => {
    const world = withKit();
    world.debugHurt('p2', 70);
    run(world, 1);
    beside(world);
    expect(holdUse(world, 1)).toEqual([]);
    expect(me(world, 'p1').hold).toMatchObject({ action: 'useItem', targetId: 'p2' });
    holdUse(world, TICKS - 1);
    expect(me(world, 'p2').health).toBe(30 + HEALTH_KIT_HEAL);
    expect(me(world, 'p1').inventory[0]).toBeNull();
    const again = withKit();
    again.debugHurt('p2', 20);
    run(again, 1);
    beside(again);
    holdUse(again, TICKS);
    expect(me(again, 'p2').health).toBe(PLAYER_MAX_HEALTH);
  });

  test('W8: with no teammate in front it heals oneself', () => {
    const world = withKit();
    world.debugHurt('p1', 70);
    run(world, 1);
    holdUse(world, 1);
    expect(me(world, 'p1').hold).toMatchObject({ action: 'useItem', targetId: 'p1' });
    holdUse(world, TICKS - 1);
    expect(me(world, 'p1').health).toBe(30 + HEALTH_KIT_HEAL);
    expect(me(world, 'p1').inventory[0]).toBeNull();
  });

  test('W8: a teammate outside the crosshair is not healed, oneself is', () => {
    const world = withKit();
    world.debugHurt('p2', 70);
    world.debugHurt('p1', 70);
    run(world, 1);
    beside(world);
    holdUse(world, 1, { yaw: Math.PI / 2 });
    expect(me(world, 'p1').hold).toMatchObject({ targetId: 'p1' });
  });

  test('W8: at full health with nobody hurt, use does nothing and the kit stays', () => {
    const world = withKit();
    beside(world);
    holdUse(world, TICKS + 10);
    expect(me(world, 'p1').hold).toBeNull();
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
    expect(me(world, 'p2').health).toBe(PLAYER_MAX_HEALTH);
  });

  test('a hold ends when the target leaves HEAL_RANGE', () => {
    const world = withKit();
    world.debugHurt('p2', 70);
    run(world, 1);
    beside(world);
    holdUse(world, 20);
    expect(me(world, 'p1').hold).not.toBeNull();
    world.teleportPlayer('p2', vec3(me(world, 'p2').pos.x, 0.02, me(world, 'p2').pos.z - 3));
    holdUse(world, 1);
    expect(me(world, 'p1').hold).toBeNull();
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
  });

  test('W12: a downed player\'s hold ends and they cannot start one', () => {
    const world = withKit('p3');
    world.debugHurt('p2', 70);
    run(world, 1);
    beside(world);
    holdUse(world, 20);
    expect(me(world, 'p1').hold).not.toBeNull();
    world.debugHurt('p1', 100);
    run(world, 1, new Map([['p1', input({ use: true, ...AIM })]]));
    expect(me(world, 'p1').downed).not.toBeNull();
    expect(me(world, 'p1').hold).toBeNull();
    // Use is pressed fresh while downed; the kit is for oneself too, and nothing starts.
    for (let i = 0; i < 20; i++) run(world, 1, new Map([['p1', input({ use: i % 2 === 0, ...AIM })]]));
    expect(me(world, 'p1').hold).toBeNull();
    expect(me(world, 'p1').inventory[0]).toBe('healthKit');
    expect(me(world, 'p2').health).toBe(30);
  });

  test('W12: a revive hold ends when the holder is downed, and the downed timer runs again', () => {
    const world = withKit('p3');
    world.debugHurt('p2', 100);
    run(world, 1);
    beside(world);
    holdUse(world, 20);
    expect(me(world, 'p1').hold).toMatchObject({ action: 'revive' });
    const frozen = me(world, 'p2').downed!;
    world.debugHurt('p1', 100);
    run(world, 1, new Map([['p1', input({ use: true, ...AIM })]]));
    expect(me(world, 'p1').hold).toBeNull();
    run(world, 30, new Map([['p1', input({ use: true, ...AIM })]]));
    expect(me(world, 'p2').downed).toBeLessThan(frozen);
  });
});

describe('determinism (W13)', () => {
  test('W13: two worlds with the same inputs through a fall, a vehicle hit, a crate hit and a downed timer have equal snapshots', () => {
    const script = (world: World, events: WorldEvent[]) => {
      world.addPlayer('p1');
      world.addPlayer('p2');
      world.teleportPlayer('p2', vec3(30, 0.02, 30));
      for (let i = 0; i < 900; i++) {
        if (i === 10) world.teleportPlayer('p1', vec3(5, 8.02, 20));
        if (i === 100) world.teleportPlayer('p2', vec3(0, 0.02, -7));
        if (i === 130) world.debugBody('vehicle')!.setLinvel(vec3(0, 0, -10), true);
        if (i === 300) {
          world.teleportPlayer('p2', vec3(40, 0.02, 30));
          const crate = world.debugBody('crate-1')!;
          crate.setTranslation(vec3(40, 1.0, 28.5), true);
          crate.setLinvel(vec3(0, 0, 12), true);
        }
        if (i === 400) world.debugHurt('p1', 100);
        if (i === 410) {
          const at = world.snapshot().players[0]!.pos;
          world.debugSetInventory('p2', ['healthKit', null, null]);
          world.teleportPlayer('p2', vec3(at.x, 0.02, at.z + 1.5));
        }
        const move = i % 90 < 45 ? 1 : -1;
        const p2 = i >= 430 ? { use: true, yaw: 0, pitch: -0.45 } : i < 100 ? { moveX: 1 } : {};
        events.push(...world.step(new Map([['p1', input({ moveY: move, yaw: i / 100 })], ['p2', input(p2)]])));
      }
      return world.snapshot();
    };
    const a = make();
    const b = make();
    const firstEvents: WorldEvent[] = [];
    const secondEvents: WorldEvent[] = [];
    const first = script(a, firstEvents);
    const second = script(b, secondEvents);
    // p2 took both the vehicle's hit and the crate's.
    expect(first.players[1]!.health).toBeLessThan(40);
    expect(first.players[1]!.health).toBeGreaterThan(0);
    // p1 was downed at tick 400 and p2's kit revived them.
    expect(kinds(firstEvents, 'downed', 'p1')).toHaveLength(1);
    expect(kinds(firstEvents, 'revive', 'p1')).toHaveLength(1);
    expect(kinds(secondEvents, 'revive', 'p1')).toHaveLength(1);
    expect(first.players[0]!.downed).toBeNull();
    expect(first.players[0]!.health).toBe(PLAYER_REVIVE_HEALTH);
    expect(second).toEqual(first);
    expect(secondEvents).toEqual(firstEvents);
  });
});
