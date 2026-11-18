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
  ['color-mix(', /color-mix\(/],
];

// Common CSS colour names, caught only inside a colour-carrying declaration so words in prose and class names pass.
const NAMES = 'red|blue|green|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|silver|gold|navy|maroon|lime|olive|aqua|fuchsia|tan|beige|ivory|coral|salmon|crimson|indigo|violet|khaki|orchid|plum|tomato|peru|sienna';
const DECLARATION = /\b(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|filter)\s*:\s*([^;}`]*)/g;
const namedColour = (text: string): string[] =>
  [...text.matchAll(DECLARATION)].filter((match) => new RegExp(`(?<![-\\w])(?:${NAMES})(?![-\\w])`).test(match[1]!)).map((match) => match[0]);

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
      for (const declaration of namedColour(text)) found.push(`${file}: named colour in ${declaration}`);
    }
    expect(found).toEqual([]);
  });

  it('catches named colours and color-mix, and ignores tokens and prose', () => {
    expect(namedColour('a { color: red; }')).toHaveLength(1);
    expect(namedColour('a { background: linear-gradient(blue, var(--ink)); }')).toHaveLength(1);
    expect(namedColour('a { border: 1px solid tomato; }')).toHaveLength(1);
    expect(namedColour('a { color: var(--red-ish); background: var(--green); border-color: transparent; }')).toEqual([]);
    expect(PATTERNS.some(([label, pattern]) => label === 'color-mix(' && pattern.test('background: color-mix(in srgb, red, blue)'))).toBe(true);
  });

  it('allows only the #overlay and #crosshair rules in index.html', () => {
    const text = readFileSync(html, 'utf8');
    expect(withoutOutOfScope(text)).not.toMatch(/#fff|rgba\(/);
    expect(PATTERNS.some(([, pattern]) => pattern.test(text))).toBe(true);
  });
});
