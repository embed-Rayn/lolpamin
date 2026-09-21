import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, THEME_LABELS, parseTheme } from "./theme";

describe("parseTheme", () => {
  it("accepts every known theme", () => {
    for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
  });

  it("falls back to the default for anything else", () => {
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("neon")).toBe(DEFAULT_THEME);
    expect(parseTheme("CLEAN")).toBe(DEFAULT_THEME);
  });

  it("has a label for every theme", () => {
    for (const theme of THEMES) expect(THEME_LABELS[theme].name).toBeTruthy();
  });
});
