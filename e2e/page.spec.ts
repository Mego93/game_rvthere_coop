import { expect, test } from '@playwright/test';

// A build check on the served page: the charset must come early, and the theme and both fonts must be in the head.
test('the page declares its charset in the first 1024 bytes and carries the theme and the font preloads', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'one is enough');
  const html = await (await request.get('/')).text();
  expect(html.indexOf('<meta charset')).toBeGreaterThanOrEqual(0);
  expect(html.indexOf('<meta charset')).toBeLessThan(1024);
  expect(html).toContain('id="lodgy-theme"');
  expect(html.match(/rel="preload"[^>]*as="font"/g)?.length).toBe(2);
  expect(html).toMatch(/inter-latin-wght-normal/);
  expect(html).toMatch(/rubik-latin-wght-normal/);
});
