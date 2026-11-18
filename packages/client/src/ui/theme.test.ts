import { describe, expect, it } from 'vitest';
import { THEME_CSS, TOKENS, UI_CLASS, installTheme } from './theme';

type Rgb = [number, number, number];

function parse(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
  if (!rgba) throw new Error(`cannot parse ${value}`);
  return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
}

const over = (top: string, under: string): Rgb => {
  const { rgb, alpha } = parse(top);
  const base = parse(under).rgb;
  return rgb.map((channel, i) => channel * alpha + base[i]! * (1 - alpha)) as Rgb;
};

const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

// WCAG 2.x contrast ratio of two opaque colours.
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const solid = (name: string) => parse(TOKENS[name]!).rgb;

describe('theme tokens', () => {
  it('declares the palette, semantic, data and portrait tokens, each used in THEME_CSS', () => {
    const names = [
      '--sand', '--terracotta', '--terracotta-strong', '--saffron', '--majorelle', '--teal', '--ink', '--glass',
      '--danger', '--ok', '--warn', '--info', '--scrim', '--shadow',
      '--item-jerrycan', '--item-toolbox', '--item-health', '--item-tajine', '--stop-fuel', '--stop-garage', '--finish-a', '--finish-b',
      '--portrait-skin', '--portrait-cap', '--portrait-fez',
      '--font-display', '--font-text',
    ];
    for (const name of names) {
      expect(TOKENS[name], name).toBeTruthy();
      expect(THEME_CSS, name).toContain(`${name}: ${TOKENS[name]};`);
    }
  });

  it('keeps the brief palette values and the V7 glass', () => {
    expect(TOKENS['--sand']).toBe('#f3e3c3');
    expect(TOKENS['--terracotta']).toBe('#c8553d');
    expect(TOKENS['--saffron']).toBe('#f2a541');
    expect(TOKENS['--majorelle']).toBe('#2f4fd8');
    expect(TOKENS['--teal']).toBe('#0f5257');
    expect(TOKENS['--ink']).toBe('#1d1a17');
    expect(TOKENS['--glass']).toBe('rgba(20, 16, 12, 0.62)');
    expect(TOKENS['--terracotta-strong']).toBe('#a8432f');
    expect(TOKENS['--danger']).toBe('#9e2a1f');
  });

  it('names the shared classes', () => {
    expect(UI_CLASS.panel).toBe('ui-panel');
    expect(UI_CLASS.btn).toBe('ui-btn');
    expect(UI_CLASS.btnPrimary).toContain('ui-btn-primary');
    expect(UI_CLASS.chip).toBe('ui-chip');
    expect(UI_CLASS.slot).toBe('ui-slot');
    expect(UI_CLASS.toast).toBe('ui-toast');
    for (const name of ['ui-panel', 'ui-btn', 'ui-btn-primary', 'ui-chip', 'ui-slot', 'ui-toast']) expect(THEME_CSS).toContain(`.${name}`);
  });
});

describe('V7 contrast pairs (WCAG, at least 4.5:1)', () => {
  const pairs: [string, Rgb, Rgb][] = [
    ['white on glass over white', solid('--white'), over(TOKENS['--glass']!, '#ffffff')],
    ['white on terracotta-strong', solid('--white'), solid('--terracotta-strong')],
    ['ink on sand', solid('--ink'), solid('--sand')],
    ['danger on sand', solid('--danger'), solid('--sand')],
    ['ok on sand', solid('--ok'), solid('--sand')],
    ['info on sand', solid('--info'), solid('--sand')],
    ['warn on sand', solid('--warn'), solid('--sand')],
    ['ink-soft on sand', solid('--ink-soft'), solid('--sand')],
    ['ink on paper', solid('--ink'), solid('--paper')],
    ['danger on paper', solid('--danger'), solid('--paper')],
    ['ink on saffron', solid('--ink'), solid('--saffron')],
    ['white on teal', solid('--white'), solid('--teal')],
    ['ink on sand-deep', solid('--ink'), solid('--sand-deep')],
  ];
  for (const [label, text, background] of pairs) it(label, () => expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5));

  it('the contrast formula gives 21 for black on white', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});

describe('installTheme', () => {
  const fakeDoc = () => {
    const appended: { id: string; textContent: string }[] = [];
    const doc = {
      head: { append: (node: { id: string; textContent: string }) => appended.push(node) },
      createElement: () => ({ id: '', textContent: '' }),
      getElementById: (id: string) => appended.find((node) => node.id === id) ?? null,
    };
    return { doc: doc as unknown as Document, appended };
  };

  it('adds one style element with THEME_CSS, and a second call adds nothing', () => {
    const { doc, appended } = fakeDoc();
    installTheme(doc);
    installTheme(doc);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.textContent).toBe(THEME_CSS);
  });
});
