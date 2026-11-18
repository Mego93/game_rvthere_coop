import { HEAL_AIM_ANGLE, HEAL_RANGE, HOLD_DURATION, ITEM_KINDS, PLAYER_HEIGHT, PLAYER_MAX_HEALTH, TICK_DT, USE_RANGE, type ItemKind } from './constants';
import { dot, length, sub, vec3, type Quat, type Vec3 } from './math';
import { distanceToBox } from './seats';

// 'vehicle' or a player id.
export type Target = 'vehicle' | string;

export interface Hold {
  action: 'useItem' | 'revive';
  targetId: Target;
  slot: 0 | 1 | 2;
  item: ItemKind;
  // 0..1
  progress: number;
}

// Rule V6: holding interact at a service stop's operate point; the stop is the target.
export interface OperateHold {
  action: 'operate';
  targetId: string;
  // 0..1
  progress: number;
}

export type PlayerHold = Hold | OperateHold;

export interface HoldVehicle {
  pos: Vec3;
  rot: Quat;
  half: Vec3;
  fuel: number;
  health: number;
}

export interface UseContext {
  // onFoot: not seated, not downed and not waiting to respawn.
  self: { id: string; feet: Vec3; eye: Vec3; aim: Vec3; health: number; onFoot: boolean };
  vehicle: HoldVehicle;
  // Every other player, in join order.
  players: { id: string; feet: Vec3; health: number; downed: number | null; seated: boolean }[];
}

const aimAngle = (ctx: UseContext, feet: Vec3): number => {
  const to = sub(vec3(feet.x, feet.y + PLAYER_HEIGHT / 2, feet.z), ctx.self.eye);
  const distance = length(to);
  if (distance < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(to, ctx.self.aim) / distance)));
};

const inRange = (ctx: UseContext, feet: Vec3): boolean => length(sub(feet, ctx.self.feet)) <= HEAL_RANGE;

const vehicleNeeds = (item: ItemKind, ctx: UseContext): boolean => {
  const needed = item === 'jerrycan' ? ctx.vehicle.fuel < 1 : item === 'toolbox' ? ctx.vehicle.health < 1 : false;
  if (!needed) return false;
  return distanceToBox(ctx.self.feet, ctx.vehicle.half, ctx.vehicle.pos, ctx.vehicle.rot) <= USE_RANGE;
};

// Rules I8, H9, J6 and the tajine: eating targets the eater.
export function useTarget(item: ItemKind | null, ctx: UseContext): Target | null {
  if (item === null || !Object.hasOwn(ITEM_KINDS, item)) return null;
  if (item === 'jerrycan' || item === 'toolbox') return vehicleNeeds(item, ctx) ? 'vehicle' : null;
  if (item === 'tajine') return ctx.self.onFoot ? ctx.self.id : null;
  if (item !== 'healthKit') return null;
  // The smallest angle wins; the earlier join order keeps a tie.
  const nearest = (wanted: (player: UseContext['players'][number]) => boolean): string | null => {
    let best: string | null = null;
    let bestAngle = Infinity;
    for (const player of ctx.players) {
      if (player.seated || !wanted(player) || !inRange(ctx, player.feet)) continue;
      const angle = aimAngle(ctx, player.feet);
      if (angle <= HEAL_AIM_ANGLE && angle < bestAngle) {
        best = player.id;
        bestAngle = angle;
      }
    }
    return best;
  };
  const downed = nearest((player) => player.downed !== null);
  if (downed !== null) return downed;
  const hurt = nearest((player) => player.downed === null && player.health < PLAYER_MAX_HEALTH);
  if (hurt !== null) return hurt;
  return ctx.self.health < PLAYER_MAX_HEALTH ? ctx.self.id : null;
}

// The target a press binds: its id, and whether it is a revive.
export function pressTarget(item: ItemKind | null, ctx: UseContext): { id: Target; revive: boolean } | null {
  const id = useTarget(item, ctx);
  if (id === null) return null;
  return { id, revive: ctx.players.find((player) => player.id === id)?.downed != null };
}

// Rule J7: range only, since the spec allows moving within range once the hold runs.
export function holdTargetValid(hold: Hold, ctx: UseContext): boolean {
  if (hold.targetId === 'vehicle') return vehicleNeeds(hold.item, ctx);
  if (hold.targetId === ctx.self.id) {
    if (hold.item === 'tajine') return hold.action === 'useItem' && ctx.self.onFoot;
    return hold.action === 'useItem' && ctx.self.health < PLAYER_MAX_HEALTH;
  }
  const target = ctx.players.find((player) => player.id === hold.targetId);
  if (!target || target.seated || !inRange(ctx, target.feet)) return false;
  if (hold.action === 'revive') return target.downed !== null;
  return target.downed === null && target.health < PLAYER_MAX_HEALTH;
}

const DONE = 1 - 1e-9;

// Rules I8 and I9. The press tick binds and counts as the first tick of progress.
export function stepHold(
  hold: Hold | null,
  input: { usePressed: boolean; useHeld: boolean; slot: 0 | 1 | 2 },
  inventory: readonly (ItemKind | null)[],
  target: { id: Target; revive: boolean } | null,
  blocked: boolean,
): { hold: Hold | null; completed: Hold | null } {
  const none = { hold: null, completed: null };
  if (blocked) return none;
  let current: Hold;
  if (hold) {
    if (!input.useHeld || target === null || input.slot !== hold.slot || inventory[hold.slot] !== hold.item) return none;
    current = hold;
  } else {
    const item = inventory[input.slot] ?? null;
    if (!input.usePressed || target === null || item === null) return none;
    current = { action: target.revive ? 'revive' : 'useItem', targetId: target.id, slot: input.slot, item, progress: 0 };
  }
  const progress = current.progress + TICK_DT / HOLD_DURATION;
  if (progress >= DONE) return { hold: null, completed: { ...current, progress: 1 } };
  return { hold: { ...current, progress }, completed: null };
}

// Rule V6. The press tick binds and counts as the first tick of progress; `target` is the stop id while it is valid.
export function stepOperateHold(
  hold: OperateHold | null,
  input: { interactPressed: boolean; interactHeld: boolean },
  target: string | null,
  blocked: boolean,
): { hold: OperateHold | null; completed: OperateHold | null } {
  const none = { hold: null, completed: null };
  if (blocked || target === null) return none;
  let current: OperateHold;
  if (hold) {
    if (!input.interactHeld || hold.targetId !== target) return none;
    current = hold;
  } else {
    if (!input.interactPressed) return none;
    current = { action: 'operate', targetId: target, progress: 0 };
  }
  const progress = current.progress + TICK_DT / HOLD_DURATION;
  if (progress >= DONE) return { hold: null, completed: { ...current, progress: 1 } };
  return { hold: { ...current, progress }, completed: null };
}
