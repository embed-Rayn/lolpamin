const path = require("node:path");

// Next only loads .env from apps/dashboard; DATABASE_URL lives in the repo-root
// .env that the bots read via --env-file. Load it here so all workspaces share one file.
try {
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch {
  // no .env (CI) — rely on the ambient environment
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lolpamin/core", "@lolpamin/db"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // The member dashboard lived at /members until the aram board arrived; old
  // bookmarks and chat links keep working.
  async redirects() {
    return [{ source: "/members", destination: "/rift", permanent: true }];
  },
};

module.exports = nextConfig;
