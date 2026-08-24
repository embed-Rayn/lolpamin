import { describe, expect, it } from "vitest";
import { computeReconnectDelayMs } from "./compute-reconnect-delay";

describe("computeReconnectDelayMs", () => {
  it("returns the base delay (1s) for the first attempt", () => {
    expect(computeReconnectDelayMs(0)).toBe(1000);
  });

  it("doubles the delay for each subsequent attempt", () => {
    expect(computeReconnectDelayMs(1)).toBe(2000);
    expect(computeReconnectDelayMs(2)).toBe(4000);
    expect(computeReconnectDelayMs(3)).toBe(8000);
  });

  it("caps the delay at 5 minutes", () => {
    expect(computeReconnectDelayMs(10)).toBe(300_000);
    expect(computeReconnectDelayMs(100)).toBe(300_000);
  });
});
