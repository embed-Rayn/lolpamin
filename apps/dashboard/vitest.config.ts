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
const dashboardRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig(({ mode }) => ({
  test: {
    // Integration tests in lib/mutations/*.test.ts and lib/kakao-import/*.test.ts
    // share one real Postgres test database (DATABASE_URL_TEST) and each resets
    // it in beforeEach. Running test files in parallel races those resets
    // against each other's inserts, so file parallelism must stay off.
    fileParallelism: false,
    // Vitest does not read the repo-root .env on its own. Forward only
    // DATABASE_URL_TEST: every DB-touching test guards on it and refuses to run
    // without it, which is what keeps a stray `vitest run` from resetting the
    // development database.
    env: { DATABASE_URL_TEST: loadEnv(mode, repoRoot, "").DATABASE_URL_TEST ?? "" },
  },
  resolve: {
    // tsconfig.json의 "@/*": ["./*"]와 같은 별칭. Vitest는 tsconfig paths를 읽지 않으므로
    // 여기서 다시 선언해야 @/lib/... 임포트가 테스트에서 해결된다.
    alias: [{ find: /^@\//, replacement: dashboardRoot }],
  },
}));
