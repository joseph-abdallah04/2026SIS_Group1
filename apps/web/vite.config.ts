import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    /**
     * Well above the 5s default.
     *
     * The heaviest editor tests drive dozens of real user interactions through
     * jsdom and take around four seconds on an idle machine. Run alongside the
     * rest of the suite they lose that margin and fail on the clock rather than
     * on an assertion, which is a false alarm that teaches everyone to re-run
     * the suite instead of reading it. A timeout guards against a hang, not
     * against slowness, so it should be long enough that tripping it means
     * something is genuinely stuck.
     */
    testTimeout: 30_000,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
});
