import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("./", import.meta.url));

// Config for running `vitest` from the repo root (across all workspaces).
// It intentionally repeats the two settings every app config needs: Vitest
// does not inherit a parent config, and a vitest.workspace.ts here would be
// picked up by each workspace's own `vitest run` and break it.
export default defineConfig(({ mode }) => ({
  test: {
    // Every DB-backed test file resets one shared Postgres database in
    // beforeEach, so the files must not run in parallel.
    fileParallelism: false,
    // Vitest does not read .env on its own. Forward only DATABASE_URL_TEST:
    // the DB-backed tests refuse to run without it, which is what keeps a
    // stray run from resetting the development database.
    env: { DATABASE_URL_TEST: loadEnv(mode, repoRoot, "").DATABASE_URL_TEST ?? "" },
  },
}));
