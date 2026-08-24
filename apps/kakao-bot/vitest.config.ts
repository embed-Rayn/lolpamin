import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // record-member-activity.test.ts shares one real Postgres test database
    // (DATABASE_URL_TEST) and resets it in beforeEach — running test files
    // in parallel would race that reset against other files' inserts (see
    // apps/discord-bot/vitest.config.ts for the same issue).
    fileParallelism: false,
  },
});
