import { defineConfig, devices } from '@playwright/test';

// The smoke test runs against the real server serving the built client, as players would use it.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm start',
    env: { PORT: '3100', CREATE_PER_MINUTE: '1000', MAX_CONNECTIONS_PER_ADDRESS: '1000' },
    url: 'http://localhost:3100/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    // An iPhone in landscape, in WebKit, the engine of Safari. It is not Safari on a real iPhone, which is the owner's check.
    { name: 'phone', use: { ...devices['iPhone 14 landscape'] } },
  ],
});
