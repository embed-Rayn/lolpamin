// npx tsx scripts/sync-ddragon.ts ../../16.18.1   (apps/dashboard 에서 실행)
// Copies only the images the game board uses out of a Data Dragon dump into public/ddragon/
// and writes lib/ddragon/ddragon-map.json. The dump itself stays out of git (mission/ alone
// is 58MB). Re-run with a newer dump when a patch adds items or champions.
// tsx does not resolve the "@/" alias, so imports are relative.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildDdragonMap, type DdragonSources } from "../lib/ddragon/build-map";

const source = process.argv[2];
if (!source || !existsSync(join(source, "data", "ko_KR"))) {
  console.error("usage: npx tsx scripts/sync-ddragon.ts <ddragon dump dir, e.g. ../../16.18.1>");
  process.exit(1);
}

const dashboardRoot = resolve(__dirname, "..");
const outDir = join(dashboardRoot, "public", "ddragon");
const mapPath = join(dashboardRoot, "lib", "ddragon", "ddragon-map.json");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(source, "data", "ko_KR", name), "utf8")) as T;
}

const sources: DdragonSources = {
  version: basename(resolve(source)),
  champion: readJson("champion.json"),
  item: readJson("item.json"),
  summoner: readJson("summoner.json"),
  runes: readJson("runesReforged.json"),
};
const map = buildDdragonMap(sources);

// Start clean so an image removed upstream does not linger.
rmSync(outDir, { recursive: true, force: true });

let copied = 0;
let missing = 0;
function copy(relativeFromImg: string, relativeTo: string): void {
  const from = join(source, "img", relativeFromImg);
  if (!existsSync(from)) {
    missing += 1;
    return;
  }
  const to = join(outDir, relativeTo);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}

for (const id of Object.keys(map.champions)) copy(join("champion", `${id}.png`), join("champion", `${id}.png`));
for (const id of Object.keys(map.items)) copy(join("item", `${id}.png`), join("item", `${id}.png`));
for (const spell of Object.values(map.spells)) copy(join("spell", spell.file), join("spell", spell.file));
for (const rune of Object.values(map.runes)) copy(rune.icon, rune.icon);

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(`ddragon ${map.version}: copied ${copied} images, ${missing} listed but absent, map → ${mapPath}`);
