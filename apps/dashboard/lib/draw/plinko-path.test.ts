import { describe, expect, it } from "vitest";
import { buildPlinkoPlan, type PlinkoPlan } from "./plinko-path";

const alwaysFirst = () => 0;

function landing(plan: PlinkoPlan, spacing: number): number {
  return plan.steps.reduce((sum, s) => sum + s * spacing, 0) + plan.drift;
}

describe("buildPlinkoPlan", () => {
  it("produces one step per row", () => {
    expect(buildPlinkoPlan(8, 40, 120, alwaysFirst).steps).toHaveLength(8);
  });

  it("only ever steps left or right", () => {
    const { steps } = buildPlinkoPlan(8, 40, 120, alwaysFirst);
    for (const step of steps) expect([-1, 1]).toContain(step);
  });

  it("lands exactly on the target", () => {
    const spacing = 40;
    for (const dx of [0, 40, -40, 137, -213]) {
      const plan = buildPlinkoPlan(8, spacing, dx, alwaysFirst);
      expect(landing(plan, spacing)).toBeCloseTo(dx, 6);
    }
  });

  it("keeps the drift below one pin spacing when the target is reachable", () => {
    const plan = buildPlinkoPlan(8, 40, 137, alwaysFirst);
    expect(Math.abs(plan.drift)).toBeLessThanOrEqual(40);
  });

  it("still lands on target when the row count cannot reach it", () => {
    const spacing = 40;
    const plan = buildPlinkoPlan(2, spacing, 500, alwaysFirst);
    expect(plan.steps).toEqual([1, 1]);
    expect(landing(plan, spacing)).toBeCloseTo(500, 6);
  });

  it("shuffles the step order between runs", () => {
    const random = (n: number) => Math.floor(Math.random() * n);
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) orders.add(buildPlinkoPlan(8, 40, 80, random).steps.join(""));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("keeps the right-step count fixed no matter the shuffle", () => {
    const random = (n: number) => Math.floor(Math.random() * n);
    const counts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      counts.add(buildPlinkoPlan(8, 40, 80, random).steps.filter((s) => s === 1).length);
    }
    expect(counts.size).toBe(1);
  });

  it("rejects a non-positive row count", () => {
    expect(() => buildPlinkoPlan(0, 40, 0, alwaysFirst)).toThrow(RangeError);
  });
});
