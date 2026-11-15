import { expect, test, type Page } from '@playwright/test';

async function createRoom(page: Page, name: string) {
  await page.goto('/');
  await page.locator('#home-name').fill(name);
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
}

async function startRun(page: Page) {
  await page.locator('#lobby-start').click();
  await expect(page.locator('#lobby')).toBeHidden();
}

async function you(page: Page): Promise<number[] | null> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  const match = /^you\s+(\S+)\s+(\S+)\s+(\S+)/m.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

const touch = (x: number, y: number) => [{ identifier: 1, clientX: x, clientY: y }];
const send = (page: Page, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) => {
  const list = type === 'touchend' ? [] : touch(x, y);
  return page.locator('#game').dispatchEvent(type, { touches: list, changedTouches: touch(x, y), targetTouches: list });
};

test('desktop: there is no touch UI, and the overlay has the keyboard wording', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'desktop only');
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#touch-ui')).toHaveCount(0);
  await expect(page.locator('#overlay')).toContainText('WASD move');
});

// Cloudflare's assets answer with another exact content type for the manifest.
test('the manifest and the icons are served with their types @node-only', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'desktop only');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()['content-type']).toBe('application/manifest+json; charset=utf-8');
  expect((await manifest.json()).start_url).toBe('/');
  const icon = await page.request.get('/icon-192.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toBe('image/png');
});

test('the touch UI appears with a run and shows the buttons and the slots', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  await page.goto('/');
  await expect(page.locator('#touch-ui')).toHaveCount(0);
  await createRoom(page, 'Amal');
  // The lobby has no touch UI; it appears with the run.
  await expect(page.locator('#touch-ui')).toHaveCount(0);
  await startRun(page);
  await expect(page.locator('#touch-ui')).toBeVisible();
  for (const id of ['interact', 'jump', 'menu', 'slot-0', 'slot-1', 'slot-2']) await expect(page.locator(`#touch-${id}`)).toBeVisible();
  for (const id of ['use', 'reel-in', 'reel-out', 'joystick']) await expect(page.locator(`#touch-${id}`)).toBeHidden();
  await expect(page.locator('#rotate-prompt')).toBeHidden();
  await expect(page.locator('#overlay')).toContainText('joystick move');
});

test('a drag on the left half moves the local player, and the joystick shows while it lasts', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect.poll(() => you(page)).not.toBeNull();
  const start = (await you(page))!;
  await send(page, 'touchstart', 150, 250);
  await send(page, 'touchmove', 150, 170);
  await expect(page.locator('#touch-joystick')).toBeVisible();
  await page.waitForTimeout(1000);
  await send(page, 'touchend', 150, 170);
  await expect(page.locator('#touch-joystick')).toBeHidden();
  await expect
    .poll(async () => {
      const now = await you(page);
      return now ? Math.hypot(...now.map((value, i) => value - start[i]!)) : 0;
    })
    .toBeGreaterThan(2);
});

test('tapping slot 2 selects it', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#touch-slot-0')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#touch-slot-1').tap();
  await expect(page.locator('#touch-slot-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#touch-slot-0')).toHaveAttribute('aria-pressed', 'false');
});
