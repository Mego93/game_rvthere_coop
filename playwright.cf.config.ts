import { defineConfig, devices } from '@playwright/test';

// The same specs against `wrangler dev`, the Cloudflare worker with its room Durable Objects.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  grepInvert: /@node-only/,
  use: { baseURL: 'http://localhost:8787', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:worker && npm run dev:worker',
    url: 'http://localhost:8787/',
    timeout: 180_000,
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
});
