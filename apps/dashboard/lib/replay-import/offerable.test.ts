import { describe, expect, it } from "vitest";
import { isMemberOfferable } from "./offerable";

describe("isMemberOfferable", () => {
  it("offers a member no slot has taken", () => {
    expect(isMemberOfferable("m1", new Set(), null)).toBe(true);
  });

  it("does not offer a member another slot already took", () => {
    expect(isMemberOfferable("m1", new Set(["m1"]), null)).toBe(false);
  });

  it("still offers a member to the slot that currently holds them", () => {
    expect(isMemberOfferable("m1", new Set(["m1"]), "m1")).toBe(true);
  });
});
