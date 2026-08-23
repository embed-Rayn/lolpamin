import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib/*.test.ts files share one real Postgres test database
    // (DATABASE_URL_TEST) and each resets it in beforeEach — running
    // test files in parallel races those resets against each other's
    // inserts (see apps/dashboard/vitest.config.ts for the same issue).
    fileParallelism: false,
  },
});
