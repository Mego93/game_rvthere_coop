import { describe, expect, test } from 'vitest';
import { HANDS_RANGE } from './constants';
import { AXIS_Y, IDENTITY, add, quatFromAxisAngle, rotate, sub, vec3, type Vec3 } from './math';
import { aimAngleToBox, interactCandidates, resolveInteract, splitCandidates, type InteractCandidate, type StopContext } from './interact';
import { getVehicleConfig } from './vehicles';
import type { CableSnapshot } from './winch';
import type { Placed } from './course';
import type { PropSnapshot } from './props';
import { ANCHOR_HEIGHT, HOOK_RANGE, ITEM_KINDS, PLAYER_EYE_HEIGHT, PUSH_HEIGHT, SHOP_COUNTER_HALF, SHOP_RANGE, WINCH_MAX_LENGTH } from './constants';

const resolve = (ctx: { seat: string | null; hands: string | null; candidates: readonly InteractCandidate[] }) =>
  resolveInteract({ holdsHook: ctx.hands === 'hook', attachCandidates: [], stopCandidates: [], ...ctx });
const attach = (anchorId: string, angle: number): InteractCandidate => ({ action: { kind: 'attachHook', anchorId }, angle });
const takeHook: InteractCandidate = { action: { kind: 'takeHook' }, angle: 0.5 };
const detachHook: InteractCandidate = { action: { kind: 'detachHook' }, angle: 0.5 };
const releaseHook: InteractCandidate = { action: { kind: 'releaseHook' }, angle: 0.5 };
const board: InteractCandidate = { action: { kind: 'board', seatId: 'driver' }, angle: 0.5 };
const crate = (propId: string, angle: number): InteractCandidate => ({ action: { kind: 'pickUp', propId }, angle });

describe('resolveInteract', () => {
  test('a seated player leaves the seat, whatever else is in reach or in the hands', () => {
    expect(resolve({ seat: 'driver', hands: null, candidates: [] })).toEqual({ kind: 'exitSeat' });
    expect(resolve({ seat: 'seat1', hands: 'crate-1', candidates: [board, crate('crate-2', 0.1)] })).toEqual({ kind: 'exitSeat' });
  });

  test('holding something throws it, whatever else is in reach', () => {
    expect(resolve({ seat: null, hands: 'crate-1', candidates: [board] })).toEqual({ kind: 'throw' });
    expect(resolve({ seat: null, hands: 'crate-1', candidates: [] })).toEqual({ kind: 'throw' });
  });

  test('otherwise the smallest angle wins', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.2)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.9)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('crate-2', 0.4), crate('crate-1', 0.3)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('a tie goes to boarding, then to the earlier prop', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, crate('crate-1', 0.5)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('crate-1', 0.5), crate('crate-2', 0.5)] })).toEqual({ kind: 'pickUp', propId: 'crate-1' });
  });

  test('with nothing in reach, nothing happens', () => {
    expect(resolve({ seat: null, hands: null, candidates: [] })).toBeNull();
  });
});

describe('resolveInteract with the hook', () => {
  const holding = (attachCandidates: InteractCandidate[], candidates: InteractCandidate[] = []) =>
    resolveInteract({ seat: null, hands: 'hook', holdsHook: true, candidates, attachCandidates, stopCandidates: [] });

  test('a seated player leaves the seat even holding the hook', () => {
    expect(resolveInteract({ seat: 'driver', hands: 'hook', holdsHook: true, candidates: [], attachCandidates: [attach('a', 0)], stopCandidates: [] })).toEqual({ kind: 'exitSeat' });
  });

  test('holding the hook attaches to the smallest angle, the earlier on a tie, else drops', () => {
    expect(holding([attach('a', 0.4), attach('b', 0.2)])).toEqual({ kind: 'attachHook', anchorId: 'b' });
    expect(holding([attach('a', 0.2), attach('b', 0.2)])).toEqual({ kind: 'attachHook', anchorId: 'a' });
    expect(holding([])).toEqual({ kind: 'dropHook' });
    expect(holding([], [board, crate('c', 0)])).toEqual({ kind: 'dropHook' });
  });

  test('with empty hands the hook actions compete by angle with boarding and props', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, { ...takeHook, angle: 0.1 }] })).toEqual({ kind: 'takeHook' });
    expect(resolve({ seat: null, hands: null, candidates: [crate('c', 0.3), { ...detachHook, angle: 0.2 }] })).toEqual({ kind: 'detachHook' });
  });

  test('ties go board, takeHook, detachHook, releaseHook, then props, in list order', () => {
    expect(resolve({ seat: null, hands: null, candidates: [board, takeHook, detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'board', seatId: 'driver' });
    expect(resolve({ seat: null, hands: null, candidates: [takeHook, detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'takeHook' });
    expect(resolve({ seat: null, hands: null, candidates: [detachHook, releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'detachHook' });
    expect(resolve({ seat: null, hands: null, candidates: [releaseHook, crate('c', 0.5)] })).toEqual({ kind: 'releaseHook' });
  });
});

describe('aimAngleToBox', () => {
  const half = vec3(0.3, 0.3, 0.3);
  const ahead = vec3(0, 0, -1);

  test('is 0 with the eye inside the box', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(0, 1, 0.1), IDENTITY, half)).toBe(0);
  });

  test('is 0 for a box straight ahead on the aim line', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(0, 1, -3), IDENTITY, half)).toBeCloseTo(0, 9);
  });

  test('is a quarter turn for a box directly beside the eye, its span including the eye height', () => {
    expect(aimAngleToBox(vec3(0, 1, 0), ahead, vec3(2, 1, 0), IDENTITY, half)).toBeCloseTo(Math.PI / 2, 9);
  });

  test('uses the box frame: a turned box is measured to its nearest point', () => {
    const rot = quatFromAxisAngle(AXIS_Y, Math.PI / 4);
    const eye = vec3(0, 1, 0);
    const centre = vec3(1.5, 1, -3);
    // Axis-aligned the nearest point is (1.2, 1, -2.7); turned, it is the near corner (1.5, 1, -3 + 0.3 * sqrt 2).
    expect(aimAngleToBox(eye, ahead, centre, IDENTITY, half)).toBeCloseTo(Math.atan2(1.2, 2.7), 9);
    expect(aimAngleToBox(eye, ahead, centre, rot, half)).toBeCloseTo(Math.atan2(1.5, 3 - 0.3 * Math.SQRT2), 9);
  });
});

describe('interactCandidates', () => {
  const config = getVehicleConfig('lodgy');
  const base = {
    config,
    vehiclePos: vec3(0, 1, 0),
    vehicleRot: IDENTITY,
    yaw: 0,
    pitch: 0,
    takenSeats: new Set<string>(),
    heldProps: new Set<string>(),
    seat: null as string | null,
    hands: null as string | null,
    cable: { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 } as CableSnapshot,
    anchors: [] as Placed[],
    items: [] as PropSnapshot[],
    freeSlot: true,
    stops: [] as StopContext[],
  };
  const crateAt = (id: string, x: number, z: number) => ({ id, kind: 'crate', pos: vec3(x, 0.3, z), rot: IDENTITY });

  test('lists boarding first, then each unheld light prop in range, in the order given', () => {
    const found = interactCandidates({ ...base, feet: vec3(2.5, 0, 0), props: [crateAt('a', 3.2, 0), crateAt('b', 2.5, -1)] });
    expect(found.map((c) => c.action.kind)).toEqual(['board', 'pickUp', 'pickUp']);
    expect(found.slice(1).map((c) => (c.action as { propId: string }).propId)).toEqual(['a', 'b']);
  });

  test('leaves out a prop beyond HANDS_RANGE, a held one, a heavy one and an unknown kind', () => {
    const far = crateAt('far', 2.5 + HANDS_RANGE + 0.5 + 0.3, 0);
    const barrier = { id: 'barrier-1', kind: 'barrier', pos: vec3(3.5, 0.5, 0), rot: IDENTITY };
    const mystery = { id: 'm', kind: 'mystery', pos: vec3(3.5, 0.5, 1), rot: IDENTITY };
    const found = interactCandidates({
      ...base,
      feet: vec3(2.5, 0, 0),
      props: [far, barrier, mystery, crateAt('held', 3.5, 0.5), crateAt('free', 3.5, -0.5)],
      heldProps: new Set(['held']),
    });
    expect(found.filter((c) => c.action.kind === 'pickUp').map((c) => (c.action as { propId: string }).propId)).toEqual(['free']);
  });

  const itemAt = (id: string, kind: string, x: number, z: number) => ({ id, kind, pos: vec3(x, ITEM_KINDS.jerrycan.halfExtents.y, z), rot: IDENTITY });

  test('lists unheld items within HANDS_RANGE after the props, in the order given, only with a free slot', () => {
    const items = [itemAt('far', 'jerrycan', 2.5 + HANDS_RANGE + 0.5 + 0.2, 0), itemAt('item-a', 'jerrycan', 3.2, 0), itemAt('item-b', 'toolbox', 2.5, -1)];
    const feet = vec3(2.5, 0, 0);
    const found = interactCandidates({ ...base, feet, props: [crateAt('a', 3.2, 0.5)], items });
    expect(found.map((c) => c.action)).toEqual([
      { kind: 'board', seatId: expect.any(String) },
      { kind: 'pickUp', propId: 'a' },
      { kind: 'pickUpItem', itemId: 'item-a' },
      { kind: 'pickUpItem', itemId: 'item-b' },
    ]);
    const full = interactCandidates({ ...base, feet, props: [], items, freeSlot: false });
    expect(full.map((c) => c.action.kind)).toEqual(['board']);
  });

  test('items are not candidates with a prop or the hook in the hands, and an unknown kind is skipped', () => {
    const items = [itemAt('item-a', 'jerrycan', 3.2, 0), itemAt('m', 'mystery', 3.2, 0.2)];
    expect(interactCandidates({ ...base, feet: vec3(2.5, 0, 0), hands: 'crate-1', props: [], items })).toEqual([]);
    const found = interactCandidates({ ...base, feet: vec3(2.5, 0, 0), props: [], items });
    expect(found.filter((c) => c.action.kind === 'pickUpItem')).toHaveLength(1);
  });

  test('has no boarding candidate when every seat is taken or the vehicle is out of reach', () => {
    const taken = new Set(config.seats.map((seat) => seat.id));
    expect(interactCandidates({ ...base, feet: vec3(2.5, 0, 0), takenSeats: taken, props: [] })).toEqual([]);
    expect(interactCandidates({ ...base, feet: vec3(30, 0, 0), props: [] })).toEqual([]);
  });

  test('the angle follows the aim: facing the crate beats facing away', () => {
    const props = [crateAt('a', 0, -11.5)];
    const feet = vec3(0, 0, -10);
    const toward = interactCandidates({ ...base, feet, yaw: 0, props });
    const away = interactCandidates({ ...base, feet, yaw: Math.PI, props });
    expect(toward[0]!.angle).toBeLessThan(away[0]!.angle);
  });
});

describe('interactCandidates and the hook', () => {
  const config = getVehicleConfig('lodgy');
  const vehiclePos = vec3(0, 1, 0);
  const mount = add(vehiclePos, rotate(IDENTITY, config.winchMount));
  const cable = (state: CableSnapshot['state'], hookPos = mount, anchorId: string | null = null): CableSnapshot => ({
    state,
    holderId: null,
    anchorId,
    hookPos,
    length: 0,
    reel: 0,
  });
  const base = {
    config,
    vehiclePos,
    vehicleRot: IDENTITY,
    yaw: 0,
    pitch: 0,
    seat: null as string | null,
    hands: null as string | null,
    takenSeats: new Set<string>(),
    heldProps: new Set<string>(),
    props: [] as { id: string; kind: string; pos: Vec3; rot: typeof IDENTITY }[],
    anchors: [] as Placed[],
    cable: cable('stowed'),
    items: [] as PropSnapshot[],
    freeSlot: true,
    stops: [] as StopContext[],
  };
  // Feet such that the chest is 1 m in front of the winch box (the mount faces -z).
  const nearBox = vec3(mount.x, mount.y - PUSH_HEIGHT, mount.z - 1);
  const kinds = (found: InteractCandidate[]) => found.map((c) => c.action.kind);
  const post = (id: string, x: number, z: number): Placed => ({ id, kind: 'anchor', pose: { pos: vec3(x, 0, z), rot: IDENTITY } });

  test('a seated player has no candidates', () => {
    expect(interactCandidates({ ...base, seat: 'driver', feet: nearBox })).toEqual([]);
  });

  test('stowed: takeHook beside the winch box, none out of reach', () => {
    expect(kinds(interactCandidates({ ...base, feet: nearBox }))).toContain('takeHook');
    const far = vec3(mount.x, mount.y - 2, mount.z - HOOK_RANGE - 0.5);
    expect(kinds(interactCandidates({ ...base, feet: far }))).not.toContain('takeHook');
  });

  test('ground: takeHook only beside the hook', () => {
    const hook = vec3(20, 0, 20);
    const found = interactCandidates({ ...base, cable: cable('ground', hook), feet: vec3(20, 0, 21) });
    expect(kinds(found)).toEqual(['takeHook']);
    expect(kinds(interactCandidates({ ...base, cable: cable('ground', hook), feet: vec3(20, 0, 24) }))).toEqual([]);
  });

  test('attached: detachHook at the attach point and releaseHook at the winch box', () => {
    const point = vec3(20, 0.5, 20);
    const att = cable('attached', point, 'a');
    expect(kinds(interactCandidates({ ...base, cable: att, feet: vec3(20, 0, 21) }))).toEqual(['detachHook']);
    expect(kinds(interactCandidates({ ...base, cable: att, feet: nearBox }))).toContain('releaseHook');
  });

  test('W11: aiming at the bumper picks the hook, aiming at the seat boards', () => {
    // Eye level with the bumper: the box's nearest point is then the bumper itself, so a box angle would tie with the hook.
    const feet = vec3(mount.x, mount.y - PLAYER_EYE_HEIGHT, mount.z - 1.1);
    const aimFrom = (target: Vec3) => {
      const d = sub(target, add(feet, vec3(0, PLAYER_EYE_HEIGHT, 0)));
      return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y / Math.hypot(d.x, d.y, d.z)) };
    };
    const seatWorld = add(vehiclePos, rotate(IDENTITY, config.seats[0]!.pos));
    const pick = (target: Vec3) => {
      const found = interactCandidates({ ...base, feet, ...aimFrom(target) });
      return resolveInteract({ seat: null, hands: null, holdsHook: false, ...splitCandidates(found) })?.kind;
    };
    expect(kinds(interactCandidates({ ...base, feet }))).toEqual(expect.arrayContaining(['board', 'takeHook']));
    expect(pick(mount)).toBe('takeHook');
    expect(pick(seatWorld)).toBe('board');
  });

  test('a hook held by another player offers nothing', () => {
    const held = { ...cable('held'), holderId: 'other' };
    expect(kinds(interactCandidates({ ...base, cable: held, feet: nearBox }))).not.toContain('takeHook');
  });

  test('holding the hook: only attach candidates, for anchors in range and within the cable reach', () => {
    const anchors = [post('a1', 3, -2), post('a2', 3, 0.5)];
    const feet = vec3(3, 0, -1);
    const found = interactCandidates({ ...base, hands: 'hook', feet, anchors });
    expect(found.map((c) => c.action)).toEqual([
      { kind: 'attachHook', anchorId: 'a1' },
      { kind: 'attachHook', anchorId: 'a2' },
    ]);
    const farVehicle = interactCandidates({ ...base, hands: 'hook', feet, anchors: [post('far', 3, -2)], vehiclePos: vec3(0, 1, 40) });
    expect(farVehicle).toEqual([]);
  });

  test('holding the hook: an anchor beyond the reach is left out, so interact drops', () => {
    const feet = vec3(0, 0, -40);
    const anchors = [post('far', 0, -40.5)];
    const found = interactCandidates({ ...base, hands: 'hook', feet, anchors });
    expect(found).toEqual([]);
    const split = splitCandidates(found);
    expect(resolveInteract({ seat: null, hands: 'hook', holdsHook: true, ...split })).toEqual({ kind: 'dropHook' });
  });

  test('T9: holding the hook, an anchor is offered up to WINCH_MAX_LENGTH from the mount and not beyond (no dead band)', () => {
    const at = (distance: number) => {
      const anchors = [post('edge', mount.x, mount.z - distance)];
      const feet = vec3(mount.x, ANCHOR_HEIGHT - PUSH_HEIGHT, mount.z - distance + 1);
      return kinds(interactCandidates({ ...base, hands: 'hook', feet, anchors }));
    };
    expect(at(WINCH_MAX_LENGTH - 0.3)).toEqual(['attachHook']);
    expect(at(WINCH_MAX_LENGTH + 0.3)).toEqual([]);
  });

  test('holding the hook: a barrier offers its top face; a crate offers nothing', () => {
    const barrier = { id: 'barrier-1', kind: 'barrier', pos: vec3(3, 0.5, -1), rot: IDENTITY };
    const crateProp = { id: 'crate-1', kind: 'crate', pos: vec3(3, 0.3, -1), rot: IDENTITY };
    const found = interactCandidates({ ...base, hands: 'hook', feet: vec3(3, 0, -1.5), props: [crateProp, barrier] });
    expect(found.map((c) => c.action)).toEqual([{ kind: 'attachHook', anchorId: 'barrier-1' }]);
  });

  test('the attach point of a static anchor is ANCHOR_HEIGHT above its pose', () => {
    const anchors = [post('a1', 3, -2)];
    // Standing at height ANCHOR_HEIGHT - PUSH_HEIGHT puts the chest at the attach point, so only a tight range matters.
    const feet = vec3(3, ANCHOR_HEIGHT - PUSH_HEIGHT - HOOK_RANGE + 0.01, -2);
    expect(kinds(interactCandidates({ ...base, hands: 'hook', feet, anchors }))).toEqual(['attachHook']);
    expect(kinds(interactCandidates({ ...base, hands: 'hook', feet: vec3(3, ANCHOR_HEIGHT - PUSH_HEIGHT - HOOK_RANGE - 0.01, -2), anchors }))).toEqual([]);
  });

  test('holding a prop: no candidates', () => {
    expect(interactCandidates({ ...base, hands: 'crate-1', feet: nearBox })).toEqual([]);
  });
});

describe('stop candidates (S3, S3b)', () => {
  const config = getVehicleConfig('lodgy');
  const operatePoint = vec3(11.5, 0, -20);
  const shopCounter = vec3(11.5, 0, -22);
  const fuelStop = (usable: boolean, id = 'stop-fuel'): StopContext => ({ id, kind: 'fuel', operatePoint, shopCounter, usable });
  const garageStop = (usable: boolean): StopContext => ({ id: 'stop-garage', kind: 'garage', operatePoint: vec3(-11.5, 0, -20), shopCounter: null, usable });
  const base = {
    config,
    vehiclePos: vec3(0, 1, 0),
    vehicleRot: IDENTITY,
    yaw: 0,
    pitch: 0,
    seat: null as string | null,
    hands: null as string | null,
    takenSeats: new Set<string>(),
    heldProps: new Set<string>(),
    props: [] as PropSnapshot[],
    anchors: [] as Placed[],
    cable: { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 } as CableSnapshot,
    items: [] as PropSnapshot[],
    freeSlot: true,
    stops: [] as StopContext[],
  };
  const kinds = (found: InteractCandidate[]) => found.map((c) => c.action.kind);
  const at = vec3(11.5, 0, -19);

  test('a usable stop with the feet in range gives operate, aimed at the operate point', () => {
    const found = interactCandidates({ ...base, feet: at, stops: [fuelStop(true)] });
    expect(found.filter((c) => c.action.kind === 'operate')).toEqual([{ action: { kind: 'operate', stopId: 'stop-fuel' }, angle: expect.any(Number) }]);
  });

  test('an unusable stop gives no operate candidate, in or out of range', () => {
    expect(kinds(interactCandidates({ ...base, feet: at, stops: [fuelStop(false)] }))).not.toContain('operate');
    expect(kinds(interactCandidates({ ...base, feet: at, stops: [garageStop(false)] }))).not.toContain('operate');
  });

  test('operate needs the feet within STOP_OPERATE_RANGE in 3D', () => {
    const near = interactCandidates({ ...base, feet: vec3(11.5, 0, -18.01), stops: [fuelStop(true)] });
    const far = interactCandidates({ ...base, feet: vec3(11.5, 0, -17.99), stops: [fuelStop(true)] });
    expect(kinds(near)).toContain('operate');
    expect(kinds(far)).not.toContain('operate');
    const high = interactCandidates({ ...base, feet: vec3(11.5, 2.01, -20), stops: [fuelStop(true)] });
    expect(kinds(high)).not.toContain('operate');
  });

  test('a garage has an operate candidate and never a shop', () => {
    const found = interactCandidates({ ...base, feet: vec3(-11.5, 0, -19), stops: [garageStop(true)] });
    expect(kinds(found)).toEqual(['operate']);
  });

  test('the shop candidate needs the feet within SHOP_RANGE of the counter box and does not need usable', () => {
    const half = SHOP_COUNTER_HALF;
    const edge = shopCounter.z + half.z + SHOP_RANGE;
    const near = interactCandidates({ ...base, feet: vec3(11.5, 0.5, edge - 0.01), stops: [fuelStop(false)] });
    expect(kinds(near)).toEqual(['shop']);
    const far = interactCandidates({ ...base, feet: vec3(11.5, 0.5, edge + 0.01), stops: [fuelStop(false)] });
    expect(kinds(far)).toEqual([]);
  });

  test('stop candidates are offered whatever is in the hands, but never while seated', () => {
    const stops = [fuelStop(true)];
    expect(kinds(interactCandidates({ ...base, feet: at, hands: 'crate-1', stops }))).toEqual(['operate']);
    expect(kinds(interactCandidates({ ...base, feet: at, hands: 'hook', stops }))).toEqual(['operate']);
    expect(interactCandidates({ ...base, feet: at, seat: 'driver', stops })).toEqual([]);
  });

  test('ties inside the tier go to the earlier stop, operate before shop', () => {
    const found = interactCandidates({ ...base, feet: vec3(11.5, 0, -21), stops: [fuelStop(true, 'a'), fuelStop(true, 'b')] });
    expect(found.map((c) => c.action)).toEqual([
      { kind: 'operate', stopId: 'a' },
      { kind: 'shop', stopId: 'a' },
      { kind: 'operate', stopId: 'b' },
      { kind: 'shop', stopId: 'b' },
    ]);
  });

  test('splitCandidates returns a third list of stop candidates', () => {
    const found = interactCandidates({ ...base, feet: vec3(11.5, 0, -21), stops: [fuelStop(true)] });
    const split = splitCandidates(found);
    expect(split.stopCandidates.map((c) => c.action.kind)).toEqual(['operate', 'shop']);
    expect(split.candidates).toEqual([]);
    expect(split.attachCandidates).toEqual([]);
  });

  describe('resolveInteract (S3b)', () => {
    const operate: InteractCandidate = { action: { kind: 'operate', stopId: 's' }, angle: 1.2 };
    const shop: InteractCandidate = { action: { kind: 'shop', stopId: 's' }, angle: 0.4 };
    const near: InteractCandidate = { action: { kind: 'board', seatId: 'driver' }, angle: 0.01 };
    const resolveAll = (c: Partial<Parameters<typeof resolveInteract>[0]>) =>
      resolveInteract({ seat: null, hands: null, holdsHook: false, candidates: [], attachCandidates: [], stopCandidates: [], ...c });

    test('operate beats a board with the smaller angle', () => {
      expect(resolveAll({ candidates: [near], stopCandidates: [operate] })).toEqual({ kind: 'operate', stopId: 's' });
    });
    test('operate beats a throw with debris in the hands', () => {
      expect(resolveAll({ hands: 'crate-1', stopCandidates: [operate] })).toEqual({ kind: 'operate', stopId: 's' });
    });
    test('operate beats dropping the hook', () => {
      expect(resolveAll({ hands: 'hook', holdsHook: true, stopCandidates: [operate] })).toEqual({ kind: 'operate', stopId: 's' });
    });
    test('attachHook beats operate', () => {
      const attachNear = { action: { kind: 'attachHook' as const, anchorId: 'a' }, angle: 2 };
      expect(resolveAll({ hands: 'hook', holdsHook: true, attachCandidates: [attachNear], stopCandidates: [operate] })).toEqual({ kind: 'attachHook', anchorId: 'a' });
    });
    test('being seated still leaves the seat', () => {
      expect(resolveAll({ seat: 'driver', stopCandidates: [operate] })).toEqual({ kind: 'exitSeat' });
    });
    test('the smallest angle wins inside the tier, the earlier on a tie', () => {
      expect(resolveAll({ stopCandidates: [operate, shop] })).toEqual({ kind: 'shop', stopId: 's' });
      expect(resolveAll({ stopCandidates: [{ ...operate, angle: 0.4 }, shop] })).toEqual({ kind: 'operate', stopId: 's' });
    });
  });
});
