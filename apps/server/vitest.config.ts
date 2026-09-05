import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/', import.meta.url));

export default defineConfig({
  resolve: {
    /**
     * Test against the shared package's source, not its build output.
     *
     * Its `exports` send Node to `dist`, which is right for the deployed server
     * but wrong here twice over: a fresh clone has no `dist` yet, so `npm test`
     * would fail before anyone had built anything, and once built the tests
     * would silently run against whatever was compiled last rather than the
     * code in the working tree.
     */
    alias: [
      { find: /^@roundtable\/shared$/, replacement: `${sharedSrc}index.ts` },
      { find: /^@roundtable\/shared\/(.*)$/, replacement: `${sharedSrc}$1.ts` },
    ],
  },
});
