import { cpSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboard = path.resolve(here, "../dashboard");
const bgmDir = path.join(dashboard, "public/bgm");
const outDir = path.join(here, "dist");

// The mp3s stay as files next to index.html (inlining 7MB of audio as base64 would
// bloat the page), so the track list is fixed at build time: a file:// page cannot
// list a directory. Drop a new mp3 into dashboard/public/bgm and rebuild.
function bgmTracks(): Plugin {
  const id = "virtual:bgm-tracks";
  return {
    name: "bgm-tracks",
    resolveId: (source) => (source === id ? "\0" + id : null),
    load(resolved) {
      if (resolved !== "\0" + id) return null;
      const tracks = readdirSync(bgmDir)
        .filter((name) => name.toLowerCase().endsWith(".mp3"))
        .sort((a, b) => a.localeCompare(b, "ko"))
        .map((name) => ({ name, url: `bgm/${encodeURIComponent(name)}` }));
      return `export default ${JSON.stringify(tracks)};`;
    },
    configureServer(server) {
      server.middlewares.use("/bgm", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]);
        if (!readdirSync(bgmDir).includes(name)) return next();
        res.setHeader("Content-Type", "audio/mpeg");
        res.end(readFileSync(path.join(bgmDir, name)));
      });
    },
    closeBundle() {
      mkdirSync(path.join(outDir, "bgm"), { recursive: true });
      cpSync(bgmDir, path.join(outDir, "bgm"), { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative URLs so dist/ works opened straight from disk.
  base: "./",
  publicDir: false,
  plugins: [react(), viteSingleFile(), bgmTracks()],
  resolve: {
    alias: { "@": dashboard },
  },
  build: { outDir, emptyOutDir: true },
});
