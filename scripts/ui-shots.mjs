// Dev tool, not part of the build or the tests: screenshots of the HUD and its panels on the ?hudtest sample.
// Usage: node scripts/ui-shots.mjs --base http://localhost:3100 --out <dir>   (the server must be running)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const base = option('base', 'http://localhost:3100');
const out = option('out', 'ui-shots');
mkdirSync(out, { recursive: true });

// Phone landscape (with the iPhone's insets standing in through the page's --safe-* tokens) and two desktop sizes.
const SIZES = [
  { name: '667x375', width: 667, height: 375, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '1280x720', width: 1280, height: 720, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, touch: false },
];
const STATES = [
  { name: 'hud-foot', query: 'hudtest' },
  { name: 'hud-driving', query: 'hudtest=drive' },
  { name: 'chat', query: 'hudtest=chat' },
  { name: 'emote', query: 'hudtest=emote' },
  { name: 'menu', query: 'hudtest=menu' },
  { name: 'shop', query: 'hudtest=shop' },
  { name: 'results', query: 'hudtest=results' },
  { name: 'help', query: 'hudtest=help' },
  { name: 'tutorial', query: 'hudtest=tutorial' },
];

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch });
    const page = await context.newPage();
    for (const state of STATES) {
      await page.goto(`${base}/?${state.query}`);
      await page.waitForSelector('#hud-compass');
      if (size.touch) await page.addStyleTag({ content: ':root { --safe-left: 47px; --safe-right: 47px; --safe-bottom: 21px; }' });
      await page.waitForTimeout(400);
      const file = join(out, `${size.name}-${state.name}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
