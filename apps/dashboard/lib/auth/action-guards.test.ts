import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 인증 없이 호출될 수 있어야 하는 액션. 여기에 이름을 추가하는 것은
// "이 액션은 누구나 호출해도 안전하다"는 명시적 선언이다.
const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction"]);

const APP_DIR = join(__dirname, "..", "..", "app");

function findActionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return findActionFiles(full);
    return entry.name === "actions.ts" ? [full] : [];
  });
}

const actionFiles = findActionFiles(APP_DIR);

describe("server action guards", () => {
  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(actionFiles)("every exported action in %s calls requireAdmin", (file) => {
    const source = readFileSync(file, "utf-8");
    const actionNames = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);

    for (const name of actionNames) {
      if (PUBLIC_ACTIONS.has(name)) continue;

      const body = source.slice(source.indexOf(`export async function ${name}`));
      const bodyUntilNextExport = body.slice(0, body.indexOf("\nexport ", 1) === -1 ? undefined : body.indexOf("\nexport ", 1));

      expect(bodyUntilNextExport, `${name} in ${file} must call requireAdmin()`).toContain("requireAdmin()");
    }
  });
});
