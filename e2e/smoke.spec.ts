import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Reads one numeric field of the debug overlay, for example the tick or the vehicle's z position.
async function overlayNumber(page: Page, pattern: RegExp): Promise<number> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  const match = pattern.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}
const tick = (page: Page) => overlayNumber(page, /tick\s+(\d+)/);
const vehicleZ = (page: Page) => overlayNumber(page, /pos\s+\S+\s+\S+\s+(\S+)/);
// The whole list of players as the overlay shows it, for example "Amal (drives), Badr".
async function players(page: Page): Promise<string> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  return /^players\s+(.*)$/m.exec(text)?.[1] ?? '';
}

// Uncaught errors in any page of the running test. A page can look right and still have failed, for example in WebGL.
const pageErrors: string[] = [];
const watch = (page: Page) => page.on('pageerror', (error) => pageErrors.push(error.message));

// A page in its own browser context, so it has its own session storage: a separate player.
const contexts: BrowserContext[] = [];
async function newPlayerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  watch(page);
  return page;
}

test.beforeEach(({ page }) => {
  watch(page);
});

// Contexts made by hand are not closed by the test runner; left open, their pages keep drawing and slow later tests.
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(pageErrors.splice(0)).toEqual([]);
});

// Opens the home page, creates a room as `name` and returns the room's noun.
async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.locator('#home-name').fill(name);
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  // Creating a room changes the address to the room's.
  await expect(page).toHaveURL(/\/[a-z]+\d*$/);
  return new URL(page.url()).pathname.slice(1);
}

test('two players share a room and see the same vehicle, driven by the first', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const badr = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  // Badr opens the room's link, gives a name and joins.
  await badr.goto(`/${room}`);
  await expect(badr.locator('#home-title')).toHaveText(`Join room ${room}`);
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-primary').click();
  await expect(badr.locator('#home')).toBeHidden();

  for (const page of [amal, badr]) {
    await expect(page.locator('#overlay')).toContainText('players  Amal (drives), Badr');
    // Snapshots are arriving: the tick shown keeps rising.
    const before = await tick(page);
    await expect.poll(() => tick(page)).toBeGreaterThan(before);
  }

  // Badr's throttle does nothing: only the first player drives. Two seconds of throttle would move the vehicle several metres.
  await badr.keyboard.down('KeyW');
  await badr.waitForTimeout(2000);
  expect(await vehicleZ(amal)).toBeGreaterThan(-0.5);
  expect(await vehicleZ(badr)).toBeGreaterThan(-0.5);
  await badr.keyboard.up('KeyW');

  // Amal drives forward, and both pages see the vehicle move.
  await amal.keyboard.down('KeyW');
  await expect.poll(() => vehicleZ(amal), { timeout: 10_000 }).toBeLessThan(-3);
  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(-3);
  await amal.keyboard.up('KeyW');

  // The game canvas has been given its drawing size.
  for (const page of [amal, badr]) {
    const size = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
    expect(size[0]).toBeGreaterThan(0);
    expect(size[1]).toBeGreaterThan(0);
  }

  // When Amal leaves, Badr drives. This also shows that Badr's keys do reach the server, so the check above meant something.
  await amal.close();
  await expect.poll(() => players(badr)).toBe('Badr (drives)');
  const before = await vehicleZ(badr);
  await badr.keyboard.down('KeyW');
  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(before - 3);
  await badr.keyboard.up('KeyW');
});

test('a room can be joined from the home page by typing its name', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  const badr = await newPlayerPage(browser);
  await badr.goto('/');
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-room').fill(room.toUpperCase());
  await badr.locator('#home-join').click();
  await expect(badr.locator('#home')).toBeHidden();
  await expect(badr).toHaveURL(new RegExp(`/${room}$`));
  await expect(badr.locator('#overlay')).toContainText('players  Amal (drives), Badr');
});

test('a link to a room that does not exist says so and offers the home page', async ({ page }) => {
  await page.goto('/nowhere');
  await page.locator('#home-name').fill('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home-error')).toHaveText('There is no room with that name.');
  await page.locator('#home-link').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#home-primary')).toHaveText('Create room');
  await expect(page.locator('#home-room')).toBeVisible();
});

test('a name already used in the room is refused, and another name gets in', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  const other = await newPlayerPage(browser);
  await other.goto(`/${room}`);
  await other.locator('#home-name').fill('amal');
  await other.locator('#home-primary').click();
  await expect(other.locator('#home-error')).toHaveText('Someone in that room already has that name.');
  await other.locator('#home-name').fill('Badr');
  await other.locator('#home-primary').click();
  await expect(other.locator('#home')).toBeHidden();
});

test('the name is remembered, and a reload keeps the player in the room', async ({ page }) => {
  await createRoom(page, 'Amal');

  await page.reload();
  await expect(page.locator('#home-name')).toHaveValue('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  // The same tab took its old place: one player, not two, and no "name taken".
  await expect.poll(() => players(page)).toBe('Amal (drives)');
});

test('an empty name is refused on the page, before anything is sent', async ({ page }) => {
  let sockets = 0;
  page.on('websocket', () => (sockets += 1));
  await page.goto('/');
  await page.locator('#home-name').fill('   ');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home-error')).toHaveText('Enter a name of 1 to 16 characters.');
  await expect(page).toHaveURL(/\/$/);
  expect(sockets).toBe(0);
});
