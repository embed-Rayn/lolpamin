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

export default defineConfig({
  test: {
    // Integration tests in lib/mutations/*.test.ts and lib/kakao-import/*.test.ts
    // share one real Postgres test database (DATABASE_URL_TEST) and each resets
    // it in beforeEach. Running test files in parallel races those resets
    // against each other's inserts, so file parallelism must stay off.
    fileParallelism: false,
  },
});
