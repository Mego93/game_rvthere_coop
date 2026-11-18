import { expect, test, type Page } from '@playwright/test';
import { tutorialDone } from './tutorialDone';

// The iPhone's landscape insets; a browser has none, so the page's own --safe-* tokens stand in for them.
const INSETS = { left: 47, right: 47, bottom: 21 };

// The prompt's text and its hold bar are measured as two boxes; the prompt itself wraps both.
const COMMON = ['hud-compass', 'hud-minimap', 'hud-vehicle', 'hud-health', 'hud-prompt-text', 'hud-prompt-hold', 'hud-seat-toast', 'hud-downed', 'chat-toasts'];
const DESKTOP = [...COMMON, 'hud-slots'];
const TOUCH = [...COMMON, 'touch-menu', 'touch-chat', 'touch-emote', 'touch-actions', 'touch-slots'];

interface Box { id: string; x: number; y: number; w: number; h: number }

const sizes = [
  { name: '667x375', width: 667, height: 375, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '1280x720', width: 1280, height: 720, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, touch: false },
];

async function measure(page: Page, ids: string[]): Promise<Box[]> {
  return page.evaluate((list) => {
    return list.map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      const shown = !!node && !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== 'none';
      return { id, x: rect?.x ?? 0, y: rect?.y ?? 0, w: shown ? rect!.width : 0, h: shown ? rect!.height : 0 };
    });
  }, ids);
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test.describe('HUD layout (V8)', () => {
  for (const size of sizes) {
    for (const mode of size.touch ? ['hudtest', 'hudtest=drive'] : ['hudtest']) {
      test(`${size.name} ${mode}: no two HUD boxes overlap`, async ({ browser }, info) => {
        test.skip(info.project.name !== 'desktop', 'sizes and touch are set here, once');
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, storageState: tutorialDone('http://localhost:3100') });
        const page = await context.newPage();
        await page.goto(`/?${mode}`);
        if (size.touch) await page.addStyleTag({ content: `:root { --safe-left: ${INSETS.left}px; --safe-right: ${INSETS.right}px; --safe-bottom: ${INSETS.bottom}px; }` });
        await expect(page.locator('#hud-compass')).toBeVisible();
        await expect(page.locator('#chat-toasts .chat-toast')).toHaveCount(3);
        if (size.touch) await expect(page.locator('#touch-ui')).toBeVisible();
        const ids = size.touch ? TOUCH : DESKTOP;
        const boxes = await measure(page, ids);
        const inset = size.touch ? INSETS : { left: 0, right: 0, bottom: 0 };

        for (const box of boxes) {
          expect(box.w, `${box.id} is shown`).toBeGreaterThan(0);
          expect(box.x, `${box.id} inside the left inset`).toBeGreaterThanOrEqual(inset.left - 0.5);
          expect(box.x + box.w, `${box.id} inside the right inset`).toBeLessThanOrEqual(size.width - inset.right + 0.5);
          expect(box.y, `${box.id} below the top`).toBeGreaterThanOrEqual(0);
          expect(box.y + box.h, `${box.id} above the bottom inset`).toBeLessThanOrEqual(size.height - inset.bottom + 0.5);
        }
        const clashes: string[] = [];
        boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => overlaps(a, b) && clashes.push(`${a.id} x ${b.id}`)));
        expect(clashes).toEqual([]);

        const by = (id: string) => boxes.find((box) => box.id === id)!;
        // The seat chip is inside the vehicle panel.
        const seat = (await measure(page, ['hud-seat']))[0]!;
        expect(seat.w).toBeGreaterThan(0);
        expect(seat.y).toBeGreaterThanOrEqual(by('hud-vehicle').y - 0.5);
        expect(seat.y + seat.h).toBeLessThanOrEqual(by('hud-vehicle').y + by('hud-vehicle').h + 0.5);
        if (size.touch) {
          expect(by('hud-compass').h).toBeLessThanOrEqual(36);
          expect(by('touch-emote').x - (by('hud-compass').x + by('hud-compass').w)).toBeGreaterThanOrEqual(8);
          // Three chat toasts fit their box without clipping, and every touch slot is a real target.
          expect(await page.evaluate(() => { const box = document.getElementById('chat-toasts')!; return box.scrollHeight <= box.clientHeight; })).toBe(true);
          const slotSizes = await page.evaluate(() => [...document.querySelectorAll('#touch-slots button')].map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
          expect(slotSizes).toHaveLength(3);
          for (const [w, h] of slotSizes) {
            expect(w).toBeGreaterThanOrEqual(44);
            expect(h).toBeGreaterThanOrEqual(44);
          }
          for (const id of ['touch-menu', 'touch-chat', 'touch-emote']) {
            expect(by(id).w).toBe(44);
            expect(by(id).h).toBe(44);
          }
          const vehicle = by('hud-vehicle');
          expect(vehicle.h).toBeLessThanOrEqual(52);
          expect(vehicle.w).toBeLessThanOrEqual(Math.min(320, size.width * 0.6));
          expect(vehicle.y).toBeCloseTo(56, 0);
          expect(Math.abs(vehicle.x + vehicle.w / 2 - size.width / 2)).toBeLessThanOrEqual(1);
          expect(by('hud-seat-toast').y).toBeCloseTo(116, 0);
          expect(by('chat-toasts').y).toBeCloseTo(150, 0);
          expect(by('chat-toasts').h).toBeLessThanOrEqual(64);
          expect(by('chat-toasts').w).toBeLessThanOrEqual(size.width * 0.4 + 0.5);
          // Smoke B13: the action column sits fully below the Menu button.
          expect(by('touch-actions').y).toBeGreaterThanOrEqual(by('touch-menu').y + by('touch-menu').h);
        } else {
          // Prompt directly above the slots, toast under the compass.
          expect(by('hud-prompt-hold').y + by('hud-prompt-hold').h).toBeLessThanOrEqual(by('hud-slots').y + 0.5);
          expect(by('hud-seat-toast').y).toBeGreaterThanOrEqual(by('hud-compass').y + by('hud-compass').h);
        }
        await context.close();
      });
    }
  }

  test('the results actions are visible without scrolling at 667x375', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes and touch are set here, once');
    const context = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, storageState: tutorialDone('http://localhost:3100') });
    const page = await context.newPage();
    await page.goto('/?hudtest=results');
    await page.addStyleTag({ content: `:root { --safe-left: ${INSETS.left}px; --safe-right: ${INSETS.right}px; --safe-bottom: ${INSETS.bottom}px; }` });
    await expect(page.locator('#results-lobby')).toBeVisible();
    const box = (await page.locator('#results-lobby').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(375 - INSETS.bottom + 0.5);
    expect(await page.evaluate(() => { const r = document.getElementById('results')!; return r.scrollHeight <= r.clientHeight; })).toBe(true);
    await context.close();
  });
});
