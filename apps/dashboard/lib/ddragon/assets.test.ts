import { describe, expect, it } from "vitest";
import { championIcon, itemIcon, itemName, runeIcon, spellIcon, spellName } from "./assets";

describe("ddragon assets", () => {
  it("builds root-relative icon urls for known ids", () => {
    expect(championIcon("Trundle")).toBe("/ddragon/champion/Trundle.png");
    expect(itemIcon(3047)).toBe("/ddragon/item/3047.png");
    expect(spellIcon(4)).toBe("/ddragon/spell/SummonerFlash.png");
    expect(runeIcon(8000)).toBe("/ddragon/perk-images/Styles/7201_Precision.png");
  });

  it("returns null for an empty slot or an id the committed patch does not know", () => {
    expect(itemIcon(0)).toBeNull();
    expect(itemIcon(999999)).toBeNull();
    expect(spellIcon(0)).toBeNull();
    expect(runeIcon(0)).toBeNull();
    expect(championIcon("")).toBeNull();
    expect(championIcon("NotAChampion")).toBeNull();
  });

  it("names things in Korean and falls back to an empty string", () => {
    expect(spellName(4)).toBe("점멸");
    expect(itemName(999999)).toBe("");
  });
});
