import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests in lib/mutations/*.test.ts share one real Postgres
    // test database (DATABASE_URL_TEST) and each resets it in beforeEach.
    // Running test files in parallel races those resets against each
    // other's inserts, so file parallelism must stay off.
    fileParallelism: false,
  },
});
