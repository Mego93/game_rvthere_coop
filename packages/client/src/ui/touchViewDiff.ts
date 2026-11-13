import type { TouchView } from './touchView';

const FIELDS = ['seated', 'useVisible', 'reelVisible', 'slots', 'selected'] as const;

// Which fields of the view differ from the one on screen; all of them when nothing is shown yet.
export function changedFields(shown: TouchView | null, next: TouchView): Set<keyof TouchView> {
  if (!shown) return new Set(FIELDS);
  const changed = new Set<keyof TouchView>();
  if (shown.seated !== next.seated) changed.add('seated');
  if (shown.useVisible !== next.useVisible) changed.add('useVisible');
  if (shown.reelVisible !== next.reelVisible) changed.add('reelVisible');
  if (shown.selected !== next.selected) changed.add('selected');
  if (shown.slots.length !== next.slots.length || shown.slots.some((kind, index) => kind !== next.slots[index])) changed.add('slots');
  return changed;
}
