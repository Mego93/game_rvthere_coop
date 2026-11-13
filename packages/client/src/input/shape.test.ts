import { parseClientMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createInputSource } from './combined';
import { createKeyboardSource } from './keyboard';
import { createTouchSource } from './touch';

const shape = (sample: object) =>
  Object.entries(sample)
    .map(([key, value]) => [key, typeof value])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('the keyboard and touch sources produce the same input fields', () => {
  const keyboard = createInputSource(createKeyboardSource(new EventTarget()), { yaw: () => 0, pitch: () => 0, dispose() {} });
  const touch = createTouchSource({
    surface: new EventTarget(),
    win: new EventTarget(),
    doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    width: () => 800,
    controls: { onButton() {}, onSlot() {}, onCancel() {}, releaseAll() {} },
  });
  const samples = [keyboard.sample(), touch.sample()];
  expect(Object.keys(samples[0]!).sort()).toEqual(Object.keys(samples[1]!).sort());
  expect(shape(samples[0]!)).toEqual(shape(samples[1]!));
  for (const sample of samples) {
    expect(parseClientMessage(JSON.stringify({ type: 'input', seq: 1, ...sample }))).not.toBeNull();
  }
});
