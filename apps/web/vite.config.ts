import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    // Stays on Vite's normal default (5173) — strictPort just fails fast
    // instead of silently moving to a different port when 5173 is taken. A
    // silent bump breaks CLIENT_ORIGIN-based links (e.g. the emailed
    // verify-email link) without any visible error; failing loudly means you
    // find out immediately instead of chasing a broken link later.
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
});
