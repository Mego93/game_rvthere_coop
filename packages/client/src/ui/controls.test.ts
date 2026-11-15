import { expect, test } from 'vitest';
import { KEY_BINDINGS } from '../input/keyboard';
import { FINAL_RESTART_PENALTY } from '@lodgy/shared';
import { CONTROLS, EXTRA_CODES, createControlsPanel, isHelpKey, missingFromControls } from './controls';

const plain = { code: 'KeyH', repeat: false, ctrlKey: false, metaKey: false, altKey: false };

test('T11: every key the keyboard reads appears in CONTROLS, and so do F3, Escape, M and H', () => {
  const listed = new Set(CONTROLS.flatMap((entry) => entry.keys));
  for (const binding of KEY_BINDINGS) expect(listed.has(binding.code), binding.code).toBe(true);
  for (const code of EXTRA_CODES) expect(listed.has(code), code).toBe(true);
  expect(missingFromControls()).toEqual([]);
});

test('T11: reset is X and help is H, and R stays reel out', () => {
  const action = (code: string) => CONTROLS.find((entry) => entry.keys.includes(code))?.action ?? '';
  expect(action('KeyX')).toMatch(/reset/i);
  expect(action('KeyH')).toMatch(/help/i);
  expect(action('KeyR')).toMatch(/reel out/i);
});

test('H opens the panel except while typing or with a modifier held', () => {
  expect(isHelpKey(plain, 'CANVAS')).toBe(true);
  expect(isHelpKey(plain, 'input')).toBe(false);
  expect(isHelpKey(plain, 'TEXTAREA')).toBe(false);
  expect(isHelpKey({ ...plain, ctrlKey: true }, null)).toBe(false);
  expect(isHelpKey({ ...plain, repeat: true }, null)).toBe(false);
  expect(isHelpKey({ ...plain, code: 'KeyJ' }, null)).toBe(false);
});

class FakeEl {
  id = '';
  hidden = false;
  href = '';
  target = '';
  rel = '';
  type = '';
  textContent = '';
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  listeners = new Map<string, ((event: unknown) => void)[]>();
  constructor(readonly tag: string) {}
  append(...nodes: (FakeEl | string)[]) {
    for (const node of nodes) if (typeof node !== 'string') this.children.push(node);
  }
  setAttribute() {}
  focus() {}
  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  fire(type: string, event: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  find(id: string): FakeEl | undefined {
    return this.id === id ? this : this.children.map((child) => child.find(id)).find(Boolean);
  }
}

test('the Credits link opens the credits panel through the callback, closes the help and does not follow the href', () => {
  const body = new FakeEl('body');
  const doc = { createElement: (tag: string) => new FakeEl(tag), body, defaultView: null } as unknown as Document;
  const changes: boolean[] = [];
  let credits = 0;
  const panel = createControlsPanel(doc, (open) => changes.push(open), () => credits++);
  panel.open();
  let prevented = false;
  body.find('controls-credits')!.fire('click', { preventDefault: () => (prevented = true) });
  expect(prevented).toBe(true);
  expect(credits).toBe(1);
  expect(panel.isOpen()).toBe(false);
  expect(changes).toEqual([true, false]);
});

test('the reset line states the final restart penalty', () => {
  expect(CONTROLS.find((entry) => entry.keys.includes('KeyX'))!.action).toContain(`${FINAL_RESTART_PENALTY} s`);
});
