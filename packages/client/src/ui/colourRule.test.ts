import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = new URL('.', import.meta.url).pathname;
const html = join(here, '../../index.html');

// Every colour lives in theme.ts; characterPicker.ts holds portrait data, not CSS.
const allowed = new Set(['theme.ts', 'characterPicker.ts']);
const sources = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !allowed.has(name))
    .map((name) => join(dir, name));

// The page's own rules for #overlay (debug text) and #crosshair are out of scope (V13), allowed by selector and nothing else.
const withoutOutOfScope = (text: string) => text.replace(/#overlay\s*\{[^}]*\}/, '').replace(/#crosshair\s*\{[^}]*\}/, '');

const PATTERNS: [string, RegExp][] = [
  ['#hex', /#[0-9a-fA-F]{3,8}\b/],
  ['%23hex', /%23[0-9a-fA-F]{3,8}/],
  ['rgb(', /\brgba?\(/],
  ['hsl(', /\bhsla?\(/],
  ['white', /(?<![-\w])white(?![-\w])/],
  ['black', /(?<![-\w])black(?![-\w])/],
];

describe('V2 colour rule', () => {
  const files = [...sources(here), ...sources(join(here, 'hud')), html];

  it('covers the ui, the hud and the page', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.endsWith('hud.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('chat.ts'))).toBe(true);
  });

  it('has no raw colour in any component or in index.html', () => {
    const found: string[] = [];
    for (const file of files) {
      const text = file === html ? withoutOutOfScope(readFileSync(file, 'utf8')) : readFileSync(file, 'utf8');
      for (const [label, pattern] of PATTERNS) if (pattern.test(text)) found.push(`${file}: ${label}`);
    }
    expect(found).toEqual([]);
  });

  it('allows only the #overlay and #crosshair rules in index.html', () => {
    const text = readFileSync(html, 'utf8');
    expect(withoutOutOfScope(text)).not.toMatch(/#fff|rgba\(/);
    expect(PATTERNS.some(([, pattern]) => pattern.test(text))).toBe(true);
  });
});
