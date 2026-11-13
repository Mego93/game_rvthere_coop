import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // host: true makes the dev server reachable from other devices on the LAN.
    host: true,
    port: 5173,
    // In development the page comes from Vite and the game server runs beside it on port 3000.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { target: 'es2022' },
});
