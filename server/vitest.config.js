import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file gets the test-safe environment values first (JWT secrets, encryption keys,
    // a placeholder database URL…), so the suite passes on a fresh checkout with no server/.env —
    // not only on a developer machine where .env happens to fill the gaps. Files that already
    // import it themselves are unaffected (it only sets values that are still missing).
    setupFiles: ['./tests/helpers/setupEnv.js'],
  },
});
