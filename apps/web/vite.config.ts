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
    // Fixed, off the Vite-default 5173 so this doesn't collide with other
    // projects' dev servers on this machine. strictPort fails fast instead
    // of silently moving to a different port — a silent bump breaks
    // CLIENT_ORIGIN-based links (e.g. the emailed verify-email link) without
    // any visible error.
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
});
