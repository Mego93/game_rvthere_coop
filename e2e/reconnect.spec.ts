import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Reconnecting is checked on the desktop project only.');
});
test.setTimeout(45_000);

const pageErrors: string[] = [];
const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(pageErrors.splice(0)).toEqual([]);
});

async function newPlayer(browser: Browser, prepare?: (page: Page) => Promise<void>): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await prepare?.(page);
  return { context, page };
}

async function players(page: Page): Promise<string> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  return /^players\s+(.*)$/m.exec(text)?.[1] ?? '';
}

// Amal creates a room, Badr joins it, and both are in a started run.
async function startRun(amal: Page, badr: Page): Promise<void> {
  await amal.goto('/');
  await amal.locator('#home-name').fill('Amal');
  await amal.locator('#home-primary').click();
  await expect(amal.locator('#home')).toBeHidden();
  await expect(amal).toHaveURL(/\/[a-z]+\d*$/);
  const room = new URL(amal.url()).pathname.slice(1);
  await badr.goto(`/${room}`);
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-primary').click();
  await expect(badr.locator('#home')).toBeHidden();
  await badr.locator('#lobby-ready').click();
  await amal.locator('#lobby-start').click();
  for (const page of [amal, badr]) await expect(page.locator('#overlay')).toContainText('players  Amal (on foot), Badr (on foot)');
}

test('a silent drop shows the overlay, and Badr rejoins with his place', async ({ browser }) => {
  const { page: amal } = await newPlayer(browser);
  const { context, page: badr } = await newPlayer(browser);
  await startRun(amal, badr);

  await context.setOffline(true);
  await expect(badr.locator('#reconnect')).toBeVisible({ timeout: 15_000 });
  await expect(badr.locator('#reconnect')).toHaveText('Reconnecting…');
  // Past the server's silence timeout, B's slot is held: A lists Badr without a state.
  await badr.waitForTimeout(10_000);
  await expect.poll(() => players(amal)).not.toContain('Badr (');
  await context.setOffline(false);
  await expect(badr.locator('#reconnect')).toBeHidden({ timeout: 25_000 });
  await expect.poll(() => players(badr)).toContain('Badr (');
  await expect.poll(() => players(amal), { timeout: 15_000 }).toContain('Badr (');
});

test('a socket closed by the server is rejoined', async ({ browser }) => {
  const { page: amal } = await newPlayer(browser);
  let current: WebSocketRoute | null = null;
  const { page: badr } = await newPlayer(browser, async (page) => {
    await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
      current = ws;
      ws.connectToServer();
    });
  });
  await startRun(amal, badr);

  current!.close({ code: 1001 });
  await expect(badr.locator('#reconnect')).toBeVisible();
  await expect(badr.locator('#reconnect')).toBeHidden({ timeout: 25_000 });
  await expect.poll(() => players(badr)).toContain('Badr');
});

test('an unreachable server ends on the home page', async ({ browser }) => {
  const { page: amal } = await newPlayer(browser);
  const { context, page: badr } = await newPlayer(browser);
  await startRun(amal, badr);

  await context.setOffline(true);
  await expect(badr.locator('#home')).toBeVisible({ timeout: 40_000 });
  await expect(badr.locator('#home-error')).toHaveText('The connection to the server was lost.');
  await expect(badr.locator('#reconnect')).toBeHidden();
});

test('a lost WebGL context reloads the page and rejoins as the same player without the name form', async ({ browser }) => {
  const { page: amal } = await newPlayer(browser);
  const welcomes: string[] = [];
  const { page: badr } = await newPlayer(browser, async (page) => {
    await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        ws.send(message);
        try {
          const parsed = JSON.parse(String(message));
          if (parsed.type === 'welcome') welcomes.push(parsed.playerId);
        } catch {
          // Not JSON; nothing to record.
        }
      });
      ws.onMessage((message) => server.send(message));
    });
    // Records whether the home page ever became visible in this page load.
    await page.addInitScript(() => {
      const watch = () => {
        const home = document.querySelector<HTMLElement>('#home');
        if (!home) return false;
        new MutationObserver(() => {
          if (!home.hidden) sessionStorage.setItem('homeShown', '1');
        }).observe(home, { attributes: true, attributeFilter: ['hidden'] });
        return true;
      };
      if (!watch()) document.addEventListener('DOMContentLoaded', watch);
    });
  });
  await startRun(amal, badr);
  await badr.evaluate(() => sessionStorage.removeItem('homeShown'));

  const reloaded = badr.waitForEvent('load');
  await badr.evaluate(() =>
    document.querySelector<HTMLCanvasElement>('canvas#game')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext(),
  );
  await reloaded;
  await expect(badr.locator('#overlay')).toContainText('Badr', { timeout: 15_000 });
  await expect(badr.locator('#home')).toBeHidden();
  expect(await badr.evaluate(() => sessionStorage.getItem('lodgy.rejoin'))).toBe('');
  expect(await badr.evaluate(() => sessionStorage.getItem('homeShown'))).toBeNull();
  expect(welcomes).toHaveLength(2);
  expect(welcomes[1]).toBe(welcomes[0]);
});

test('a duplicated tab takes the slot once: the old tab shows the home page and nothing loops', async ({ browser }) => {
  const context = await browser.newContext();
  contexts.push(context);
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) page.on('pageerror', (error) => pageErrors.push(error.message));
  await first.goto('/');
  await first.locator('#home-name').fill('Amal');
  await first.locator('#home-primary').click();
  await expect(first.locator('#home')).toBeHidden();
  await expect(first).toHaveURL(/\/[a-z]+\d*$/);
  const room = new URL(first.url()).pathname;
  // A duplicated tab copies sessionStorage; make the second page share the first's token.
  const token = await first.evaluate(() => sessionStorage.getItem('lodgy.token'));
  await second.addInitScript((value) => {
    if (!sessionStorage.getItem('lodgy.token')) sessionStorage.setItem('lodgy.token', value!);
  }, token);
  let firstSockets = 0;
  let secondSockets = 0;
  first.on('websocket', () => firstSockets++);
  second.on('websocket', () => secondSockets++);
  await second.goto(room);
  await second.locator('#home-name').fill('Amal');
  await second.locator('#home-primary').click();
  await expect(second.locator('#home')).toBeHidden();

  await expect(first.locator('#home')).toBeVisible();
  await expect(first.locator('#home-error')).toHaveText('This room was opened in another tab.');
  await second.waitForTimeout(10_000);
  expect(firstSockets).toBeLessThanOrEqual(1);
  expect(secondSockets).toBeLessThanOrEqual(1);
  await expect(second.locator('#home')).toBeHidden();
  await expect(second.locator('#reconnect')).toBeHidden();
  await expect(first.locator('#reconnect')).toBeHidden();
});
