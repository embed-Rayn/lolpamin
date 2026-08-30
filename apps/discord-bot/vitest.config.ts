import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => ({
  test: {
    // lib/*.test.ts files share one real Postgres test database
    // (DATABASE_URL_TEST) and each resets it in beforeEach — running
    // test files in parallel races those resets against each other's
    // inserts (see apps/dashboard/vitest.config.ts for the same issue).
    fileParallelism: false,
    // Vitest does not read the repo-root .env on its own; see the dashboard
    // config for why only DATABASE_URL_TEST is forwarded.
    env: { DATABASE_URL_TEST: loadEnv(mode, repoRoot, "").DATABASE_URL_TEST ?? "" },
  },
}));
