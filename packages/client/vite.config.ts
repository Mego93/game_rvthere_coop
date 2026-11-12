import { defineConfig } from 'vite';

export default defineConfig({
  // host: true makes the dev server reachable from other devices on the LAN.
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
