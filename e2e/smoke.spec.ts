import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Reads one numeric field of the debug overlay, for example the tick or the vehicle's z position.
async function overlayNumber(page: Page, pattern: RegExp): Promise<number> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  const match = pattern.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}
const tick = (page: Page) => overlayNumber(page, /tick\s+(\d+)/);
const vehicleZ = (page: Page) => overlayNumber(page, /pos\s+\S+\s+\S+\s+(\S+)/);
// The throttle the server applied to the vehicle, from -1 to 1. It shows whose keys the server obeys without depending on speed.
const throttle = (page: Page) => overlayNumber(page, /throttle\s+(\S+)/);
// The whole list of players as the overlay shows it, for example "Amal (driver), Badr (on foot)".
async function players(page: Page): Promise<string> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  return /^players\s+(.*)$/m.exec(text)?.[1] ?? '';
}

// A position line of the overlay, for example `you` or `server`, as x, y, z; null when the line is absent.
async function overlayPosition(page: Page, label: string): Promise<[number, number, number] | null> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  const match = new RegExp(`^${label}\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)`, 'm').exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - b[i]!));

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

// The admin presses Start in the lobby; the run begins and the lobby closes.
async function startRun(page: Page) {
  await page.locator('#lobby-start').click();
  await expect(page.locator('#lobby')).toBeHidden();
}

// Pressing a button once, held long enough for a tick to see it.
async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(100);
  await page.keyboard.up(key);
}

test('two players share a room, board the vehicle, and only the driver drives @keyboard', async ({ browser }) => {
  test.slow();
  const amal = await newPlayerPage(browser);
  const badr = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  // Badr opens the room's link, gives a name and joins.
  await badr.goto(`/${room}`);
  await expect(badr.locator('#home-title')).toHaveText(`Join room ${room}`);
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-primary').click();
  await expect(badr.locator('#home')).toBeHidden();

  // Amal cannot start until Badr is ready.
  await expect(amal.locator('#lobby-start')).toBeDisabled();
  await badr.locator('#lobby-ready').click();
  await startRun(amal);
  await expect(badr.locator('#lobby')).toBeHidden();

  for (const page of [amal, badr]) {
    // Nobody is seated at the start: both stand beside the vehicle.
    await expect(page.locator('#overlay')).toContainText('players  Amal (on foot), Badr (on foot)');
    // Snapshots are arriving: the tick shown keeps rising.
    const before = await tick(page);
    await expect.poll(() => tick(page)).toBeGreaterThan(before);
  }

  // Amal stands beside the driver's door and boards as the driver.
  await expect(amal.locator('#overlay')).toContainText('hint     E to board');
  await tap(amal, 'KeyE');
  for (const page of [amal, badr]) await expect(page.locator('#overlay')).toContainText('players  Amal (driver), Badr (on foot)');
  await expect(amal.locator('#overlay')).toContainText('hint     E to leave the seat');

  // Badr's keys do nothing to the vehicle while he is on foot: the throttle stays at zero.
  await badr.keyboard.down('KeyW');
  await badr.waitForTimeout(300);
  await badr.keyboard.up('KeyW');
  for (const page of [amal, badr]) expect(await throttle(page)).toBe(0);

  // Badr is still beside the vehicle and takes a passenger seat, because the driver's is taken.
  await expect(badr.locator('#overlay')).toContainText('hint     E to board');
  await tap(badr, 'KeyE');
  for (const page of [amal, badr]) await expect(page.locator('#overlay')).toContainText('players  Amal (driver), Badr (seat1)');

  // Amal drives forward, and both pages see the throttle applied and the vehicle move.
  await amal.keyboard.down('KeyW');
  for (const page of [amal, badr]) await expect.poll(() => throttle(page)).toBe(1);
  await expect.poll(() => vehicleZ(amal), { timeout: 10_000 }).toBeLessThan(-3);
  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(-3);

  // The passenger's reverse key leaves the driver's throttle as it was.
  await badr.keyboard.down('KeyS');
  await badr.waitForTimeout(500);
  for (const page of [amal, badr]) expect(await throttle(page)).toBe(1);
  await badr.keyboard.up('KeyS');

  // The game canvas has been given its drawing size.
  for (const page of [amal, badr]) {
    const size = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
    expect(size[0]).toBeGreaterThan(0);
    expect(size[1]).toBeGreaterThan(0);
  }

  // Amal leaves the seat with W still held: nobody drives, so the throttle falls to zero.
  await tap(amal, 'KeyE');
  for (const page of [amal, badr]) await expect(page.locator('#overlay')).toContainText('players  Amal (on foot), Badr (seat1)');
  for (const page of [amal, badr]) await expect.poll(() => throttle(page)).toBe(0);
  await amal.keyboard.up('KeyW');
});

test('the local player walks at once and the prediction agrees with the server @keyboard', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect.poll(() => overlayPosition(page, 'you')).not.toBeNull();
  const start = (await overlayPosition(page, 'you'))!;

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);

  const you = (await overlayPosition(page, 'you'))!;
  const server = (await overlayPosition(page, 'server'))!;
  expect(server).not.toBeNull();
  expect(distance(you, start)).toBeGreaterThan(3);
  expect(distance(you, server)).toBeLessThan(0.3);
});

test('a seated player is not predicted: the overlay has no you line @keyboard', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText('hint     E to board');
  expect(await overlayPosition(page, 'you')).not.toBeNull();
  await tap(page, 'KeyE');
  await expect(page.locator('#overlay')).toContainText('players  Amal (driver)');
  await expect.poll(() => overlayPosition(page, 'you')).toBeNull();
});

test('a room can be joined from the home page by typing its name', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');
  await startRun(amal);

  const badr = await newPlayerPage(browser);
  await badr.goto('/');
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-room').fill(room.toUpperCase());
  await badr.locator('#home-join').click();
  await expect(badr.locator('#home')).toBeHidden();
  await expect(badr).toHaveURL(new RegExp(`/${room}$`));
  await expect(badr.locator('#overlay')).toContainText('players  Amal (on foot), Badr (on foot)');
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
  await startRun(page);

  await page.reload();
  await expect(page.locator('#home-name')).toHaveValue('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  // The tab is back in the room as one player, not two, and its old name was not refused.
  await expect.poll(() => players(page)).toBe('Amal (on foot)');
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

test('the course props are drawn: the overlay counts four props and four pickups and the page has no errors', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText('props    8');
  const before = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(before);
});

test('the winch cable is shown, stowed at the start, and the page has no errors', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText(/cable\s+stowed 0\.0 m/);
  const before = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(before);
});

test('fuel and slots are shown: a full tank, three empty slots, and the page has no errors', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText(/fuel\s+100%/);
  await expect(page.locator('#overlay')).toContainText(/slots\s+\[-\] - -/);
  const before = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(before);
});

test('the local player starts at full health', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText(/^health   100$/m);
});

test('the timer runs: the clock rises and the checkpoint shows the first of two', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  const overlay = page.locator('#overlay');
  await expect(overlay).toContainText(/time\s+\d+:\d\d\.\d\s+cp 1\/2\s+restarts 0\s+respawns 0/);
  const seconds = async () => {
    const text = (await overlay.textContent()) ?? '';
    const match = /time\s+(\d+):(\d\d\.\d)/.exec(text);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
  };
  const first = await seconds();
  await expect.poll(seconds).toBeGreaterThan(first);
});

test('the coins line shows an empty wallet and no coins collected out of four', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#overlay')).toContainText(/^coins    0   0\/4$/m);
});

test('the lobby: two players ready up, the admin starts, and both receive snapshots', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');
  await expect(amal.locator('#lobby')).toBeVisible();
  await expect(amal.locator('#lobby-link')).toContainText(`/${room}`);

  const badr = await newPlayerPage(browser);
  await badr.goto(`/${room}`);
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-primary').click();
  await expect(badr.locator('#lobby')).toBeVisible();

  // The admin edits the settings, the other player sees them as text, and no run has started.
  await expect(amal.locator('#lobby-vehicle')).toHaveJSProperty('tagName', 'SELECT');
  await expect(badr.locator('#lobby-vehicle')).toHaveText('Lodgy');
  await expect(badr.locator('#lobby-start')).toBeHidden();
  await expect(amal.locator('#lobby-players')).toContainText('Badr');
  await expect(amal.locator('#lobby-start')).toBeDisabled();
  await expect(amal.locator('#overlay')).toHaveText('');

  await badr.locator('#lobby-ready').click();
  await expect(amal.locator('#lobby-start')).toBeEnabled();
  await amal.locator('#lobby-start').click();

  for (const page of [amal, badr]) {
    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('#overlay')).toContainText('players  Amal (on foot), Badr (on foot)');
    const before = await tick(page);
    await expect.poll(() => tick(page)).toBeGreaterThan(before);
  }
});

test('the admin opens the run menu with Esc and sees the admin items @keyboard', async ({ page }) => {
  await createRoom(page, 'Amal');
  await startRun(page);
  await expect(page.locator('#run-menu')).toBeHidden();
  // The pointer is not locked, so the Esc reaches the page.
  await page.keyboard.press('Escape');
  await expect(page.locator('#run-menu')).toBeVisible();
  for (const id of ['resume', 'restart-checkpoint', 'restart-course', 'to-lobby', 'skip', 'refill']) await expect(page.locator(`#run-${id}`)).toBeVisible();
  await page.locator('#run-resume').click();
  await expect(page.locator('#run-menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#run-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#run-menu')).toBeHidden();
});

test('the admin skips a checkpoint, drives to the finish, sees an assisted result and returns to the lobby @keyboard', async ({ page }) => {
  test.slow();
  await createRoom(page, 'Amal');
  await startRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#run-menu')).toBeVisible();
  await page.locator('#run-skip').click();
  await expect(page.locator('#run-menu')).toBeHidden();
  // Skipping places the admin beside the driver door at the next checkpoint.
  await expect(page.locator('#overlay')).toContainText('E to board', { timeout: 10_000 });
  await tap(page, 'KeyE');
  await page.keyboard.down('KeyW');
  await expect(page.locator('#results')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.up('KeyW');
  await expect(page.locator('#results')).toContainText('assisted');
  await page.locator('#results-lobby').click();
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
});
