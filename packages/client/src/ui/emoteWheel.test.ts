import { EMOTES } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { EMOTE_LABELS, createEmoteWheel, emoteForKey, emoteWheelAllowed, isEmoteKey } from './emoteWheel';

const base = { phase: 'playing', seated: false, downed: false, carrying: false, open: false } as const;

test('W1: the wheel may open only in a run, on foot, upright, with nothing else open', () => {
  expect(emoteWheelAllowed(base)).toBe(true);
  expect(emoteWheelAllowed({ ...base, phase: 'lobby' })).toBe(false);
  expect(emoteWheelAllowed({ ...base, phase: 'results' })).toBe(false);
  expect(emoteWheelAllowed({ ...base, seated: true })).toBe(false);
  expect(emoteWheelAllowed({ ...base, downed: true })).toBe(false);
  expect(emoteWheelAllowed({ ...base, carrying: true })).toBe(false);
  expect(emoteWheelAllowed({ ...base, open: true })).toBe(false);
});

test('W2: B opens the wheel, except in a field, repeating or with a shortcut modifier', () => {
  const key = { code: 'KeyB', repeat: false, ctrlKey: false, metaKey: false, altKey: false };
  expect(isEmoteKey(key, null)).toBe(true);
  expect(isEmoteKey(key, 'CANVAS')).toBe(true);
  expect(isEmoteKey({ ...key, code: 'KeyV' }, null)).toBe(false);
  expect(isEmoteKey({ ...key, repeat: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, ctrlKey: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, metaKey: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, altKey: true }, null)).toBe(false);
  for (const tag of ['INPUT', 'select', 'TEXTAREA']) expect(isEmoteKey(key, tag)).toBe(false);
});

test('W3: keys 1 to 4 pick the four emotes in order, other keys pick nothing', () => {
  expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map(emoteForKey)).toEqual([...EMOTES]);
  expect(emoteForKey('Digit5')).toBeNull();
  expect(emoteForKey('KeyA')).toBeNull();
});

test('W4: every emote has a label', () => {
  expect(Object.keys(EMOTE_LABELS).sort()).toEqual([...EMOTES].sort());
  expect(EMOTE_LABELS.sixSeven).toBe('6-7');
});


class El {
  id = '';
  hidden = false;
  type = '';
  textContent = '';
  dataset: Record<string, string> = {};
  children: El[] = [];
  listeners = new Map<string, ((event: unknown) => void)[]>();
  append(...nodes: El[]) {
    this.children.push(...nodes);
  }
  setAttribute() {}
  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  fire(type: string, event: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

function fixture() {
  const all: El[] = [];
  const windowListeners: ((event: unknown) => void)[] = [];
  const doc = {
    createElement: () => {
      const el = new El();
      all.push(el);
      return el;
    },
    body: { append() {} },
    defaultView: { addEventListener: (_type: string, fn: (event: unknown) => void, options: { capture: boolean }) => (options.capture ? windowListeners.push(fn) : undefined) },
  } as unknown as Document;
  const log: string[] = [];
  const wheel = createEmoteWheel(doc, { onPick: (emote) => log.push(`pick ${emote}`), onOpenChange: (open) => log.push(`open ${open}`) });
  const root = all.find((el) => el.id === 'emote-wheel')!;
  const key = (code: string, extra: Record<string, unknown> = {}) => {
    let stopped = false;
    const event = { code, key: code === 'Escape' ? 'Escape' : code, repeat: false, stopImmediatePropagation: () => (stopped = true), ...extra };
    for (const fn of windowListeners) fn(event);
    return stopped;
  };
  return { wheel, root, log, key, all };
}

test('W5: open and close report each change once, and the keys do nothing while closed', () => {
  const { wheel, log, key } = fixture();
  expect(key('Escape')).toBe(false);
  expect(key('Digit1')).toBe(false);
  wheel.open();
  wheel.open();
  expect(wheel.isOpen()).toBe(true);
  wheel.close();
  wheel.close();
  expect(log).toEqual(['open true', 'open false']);
});

test('W6: Escape and B close the wheel and are kept from the game', () => {
  for (const code of ['Escape', 'KeyB']) {
    const { wheel, log, key } = fixture();
    wheel.open();
    expect(key(code)).toBe(true);
    expect(wheel.isOpen()).toBe(false);
    expect(log).toEqual(['open true', 'open false']);
  }
});

test('W7: keys 1 to 4 pick, closing before the send, and are kept from the game; a held key picks once', () => {
  const { wheel, log, key } = fixture();
  wheel.open();
  expect(key('Digit3')).toBe(true);
  expect(log).toEqual(['open true', 'open false', 'pick wave']);
  wheel.open();
  expect(key('Digit2', { repeat: true })).toBe(true);
  expect(wheel.isOpen()).toBe(true);
  expect(key('Digit5')).toBe(false);
  expect(key('KeyW')).toBe(false);
});

test('W8: a button click picks its emote, the backdrop and Close close, a click inside the ring does not', () => {
  const { wheel, root, log, all } = fixture();
  const button = (emote: string) => all.find((el) => el.dataset.emote === emote)!;
  wheel.open();
  button('dance').fire('click', {});
  expect(log).toEqual(['open true', 'open false', 'pick dance']);
  wheel.open();
  root.fire('click', { target: button('dab') });
  expect(wheel.isOpen()).toBe(true);
  root.fire('click', { target: root });
  expect(wheel.isOpen()).toBe(false);
  wheel.open();
  all.find((el) => el.id === 'emote-close')!.fire('click', {});
  expect(wheel.isOpen()).toBe(false);
});
