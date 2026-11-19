import { add, canReel, rotate, useTarget, type ItemKind } from '@lodgy/shared';
import type { OverlayData } from './overlay';
import { buildUseContext } from './useContext';

export interface TouchView {
  seated: boolean;
  useVisible: boolean;
  reelVisible: boolean;
  resetVisible: boolean;
  // Sprint is for a player on foot who is not downed.
  sprintVisible: boolean;
  // Fire is for a player on foot with a gun who is not downed and not carrying a prop.
  fireVisible: boolean;
  slots: (ItemKind | null)[];
  selected: 0 | 1 | 2;
}

export function touchView({ config, vehicle, players, localId, aim, cable }: Pick<OverlayData, 'config' | 'vehicle' | 'players' | 'localId' | 'aim' | 'cable'>): TouchView {
  const local = players.find((player) => player.playerId === localId);
  if (!local || !vehicle) return { seated: false, useVisible: false, reelVisible: false, resetVisible: false, sprintVisible: false, fireVisible: false, slots: [null, null, null], selected: 0 };
  const seated = local.seat !== null;
  const base = { seated, slots: [...local.inventory], selected: local.slot };
  if (local.downed !== null) return { ...base, useVisible: false, reelVisible: false, resetVisible: false, sprintVisible: false, fireVisible: false };
  const useVisible = !seated && useTarget(local.inventory[local.slot], buildUseContext(local, players, vehicle, config, aim)) !== null;
  const mount = add(vehicle.pos, rotate(vehicle.rot, config.winchMount));
  const reelVisible = canReel(local, mount) && cable !== null && (cable.state === 'attached' || cable.state === 'ground');
  return { ...base, useVisible, reelVisible, resetVisible: seated && vehicle.resetReady === true, sprintVisible: !seated, fireVisible: !seated && local.gun === true && (local.hands === null || local.hands === 'hook') };
}
