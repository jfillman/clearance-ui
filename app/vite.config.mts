import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The shell is built apart from the package: `yarn app:build` writes app/dist, the directory `clearance web` embeds
// (clearance docs/web.md, "Building the bundle in"). The contract with that server: index.html is the entry, every
// file under assets/ has a content-hashed name, and nothing is inline (its CSP is script-src 'self'; styles may be
// inline, the CSS-in-JS needs it).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    // The preload polyfill is an inline-style helper some CSPs refuse; every browser Clearance supports has modulepreload.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    // `yarn app:dev` against a local `clearance web` (CLEARANCE_WEB_PUBLIC_URL=http://localhost:8080): the dev server
    // forwards the server's paths so the page stays same-origin.
    proxy: { '/api': 'http://localhost:8080', '/auth': 'http://localhost:8080' },
  },
});
