import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests need DATABASE_URL_TEST from the repo-root .env. Vitest
// does not load it (only the bots' dev/start scripts pass --env-file), so
// load it here; the per-file guard still catches a missing value.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // no .env (CI) — rely on the ambient environment
}

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
