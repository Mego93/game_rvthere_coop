import { WINCH_MAX_LENGTH, WINCH_WARN_LENGTH } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { CONTROLS, keyLabels } from './controls';
import { TUTORIAL_FLAG, TUTORIAL_STEPS, markTutorialDone, shouldAutoShowTutorial, tutorialText } from './tutorial';

const capsOf = (id: string) => TUTORIAL_STEPS.find((step) => step.id === id)!.caps;
const labelsOf = (action: RegExp) => keyLabels(CONTROLS.find((entry) => action.test(entry.action))!.keys);

test('T10: the steps come in the planned order, each with a title and text', () => {
  expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual(['move', 'sprint', 'board', 'drive', 'winch', 'items', 'reset', 'help']);
  for (const step of TUTORIAL_STEPS) {
    expect(step.title).not.toBe('');
    expect(step.text).not.toBe('');
    expect(step.touchText).not.toBe('');
  }
});

test('T10: the key caps are built from CONTROLS, so they cannot drift', () => {
  expect(capsOf('move')).toEqual([...labelsOf(/^Walk/), ...labelsOf(/^Jump/)]);
  expect(capsOf('sprint')).toEqual([...new Set([...labelsOf(/^Sprint/), ...labelsOf(/^Crouch/)])]);
  expect(capsOf('board')).toEqual(labelsOf(/^Board/));
  expect(capsOf('drive')).toEqual([...labelsOf(/^Throttle/), ...labelsOf(/^Brake/)]);
  expect(capsOf('winch')).toEqual([...labelsOf(/^Board/), ...labelsOf(/^Reel in/), ...labelsOf(/^Reel out/)]);
  expect(capsOf('items')).toEqual([...labelsOf(/^Select a slot/), ...labelsOf(/^Use the selected/)]);
  expect(capsOf('reset')).toEqual(['X']);
  expect(capsOf('help')).toEqual(['H']);
});

test('T10: the winch step states the reach and the red rope from the constants', () => {
  const winch = TUTORIAL_STEPS.find((step) => step.id === 'winch')!;
  for (const text of [winch.text, winch.touchText]) {
    expect(text).toContain(`${WINCH_MAX_LENGTH} m`);
    expect(text).toContain(`${WINCH_WARN_LENGTH} m`);
    expect(text).toMatch(/red/);
  }
});

test('T10: touch text names the touch buttons and no key caps', () => {
  expect(tutorialText(TUTORIAL_STEPS[0]!, true)).toBe(TUTORIAL_STEPS[0]!.touchText);
  expect(tutorialText(TUTORIAL_STEPS[0]!, false)).toBe(TUTORIAL_STEPS[0]!.text);
  const all = TUTORIAL_STEPS.map((step) => step.touchText).join(' ');
  for (const button of ['Act', 'Use', 'Jump', 'Sprint', 'Reel in', 'Reel out', 'Reset', 'Menu']) expect(all).toContain(button);
  expect(all).not.toMatch(/\bpress [A-Z0-9]\b|\bhold [A-Z]\b|\bShift\b|\bX\b/i);
});

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

test('T10: the tutorial shows when the flag is unset and not yet shown on this page load', () => {
  expect(shouldAutoShowTutorial(memory(), false)).toBe(true);
  expect(shouldAutoShowTutorial(memory({ [TUTORIAL_FLAG]: '1' }), false)).toBe(false);
  expect(shouldAutoShowTutorial(memory(), true)).toBe(false);
});

test('T10: marking it done writes the flag, and a throwing storage neither throws nor stops one show per page load', () => {
  const store = memory();
  markTutorialDone(store);
  expect(store.getItem(TUTORIAL_FLAG)).toBe('1');
  expect(shouldAutoShowTutorial(store, false)).toBe(false);
  expect(() => markTutorialDone(throwing)).not.toThrow();
  expect(shouldAutoShowTutorial(throwing, false)).toBe(true);
  expect(shouldAutoShowTutorial(throwing, true)).toBe(false);
  expect(shouldAutoShowTutorial(null, false)).toBe(true);
});
