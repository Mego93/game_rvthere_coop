import { expect, test } from '@playwright/test';

test.setTimeout(45_000);

test('the server ticks at about 60 Hz: at least 270 ticks in 5 s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#home-name').fill('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  await page.locator('#lobby-course').selectOption('test');
  await page.locator('#lobby-start').click();
  await expect(page.locator('#lobby')).toBeHidden();
  // The overlay can be hidden, so its text is read, not its visibility.
  const tick = async () => Number(/tick\s+(\d+)/.exec((await page.locator('#overlay').textContent()) ?? '')?.[1] ?? NaN);
  await expect.poll(tick).toBeGreaterThan(0);
  const first = await tick();
  const started = Date.now();
  await page.waitForTimeout(5000);
  const second = await tick();
  const seconds = (Date.now() - started) / 1000;
  console.log(`cadence: ${second - first} ticks in ${seconds.toFixed(2)} s`);
  expect(second - first).toBeGreaterThanOrEqual(270);
  expect(errors).toEqual([]);
});
