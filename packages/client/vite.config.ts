import { defineConfig, type Plugin } from 'vite';
import { THEME_CSS } from './src/ui/theme';

// Puts the theme in the page itself so no screen is ever drawn before its tokens exist, and preloads the text font.
function themeInHead(): Plugin {
  return {
    name: 'lodgy-theme-in-head',
    transformIndexHtml(_html, ctx) {
      const tags: { tag: string; attrs?: Record<string, string | boolean>; children?: string; injectTo: 'head-prepend' }[] = [
        { tag: 'style', attrs: { id: 'lodgy-theme' }, children: THEME_CSS, injectTo: 'head-prepend' },
      ];
      const font = Object.keys(ctx.bundle ?? {}).find((name) => /(^|\/)inter-latin-wght-normal[^/]*\.woff2$/.test(name));
      if (font) tags.push({ tag: 'link', attrs: { rel: 'preload', href: `/${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head-prepend' });
      return tags;
    },
  };
}

export default defineConfig({
  plugins: [themeInHead()],
  server: {
    // host: true makes the dev server reachable from other devices on the LAN.
    host: true,
    port: 5173,
    // In development the page comes from Vite and the game server runs beside it on port 3000.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { target: 'es2022' },
});
