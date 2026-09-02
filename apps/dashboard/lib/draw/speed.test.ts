import { describe, expect, it } from "vitest";
import {
  clampSpeed,
  drainBudget,
  frameBudget,
  MAX_FRAME_MS,
  MAX_SPEED,
  MIN_SPEED,
  SPEED_TICKS,
  sliderToSpeed,
  speedToSlider,
} from "./speed";

describe("sliderToSpeed", () => {
  it("puts the slider ends exactly on the range ends", () => {
    expect(sliderToSpeed(0)).toBeCloseTo(MIN_SPEED, 10);
    expect(sliderToSpeed(1)).toBeCloseTo(MAX_SPEED, 10);
  });

  // 로그스케일의 정의: 슬라이더를 같은 거리 움직이면 같은 배율이 곱해진다. 가운데 값의
  // 제곱이 양 끝의 곱과 같다는 것이 그 성질을 가장 짧게 검사한다.
  it("scales logarithmically — equal travel multiplies by an equal factor", () => {
    const mid = sliderToSpeed(0.5);

    expect(mid * mid).toBeCloseTo(MIN_SPEED * MAX_SPEED, 10);
    expect(sliderToSpeed(0.75) / sliderToSpeed(0.5)).toBeCloseTo(
      sliderToSpeed(0.5) / sliderToSpeed(0.25),
      10,
    );
  });

  it("rises from left to right", () => {
    const positions = [0, 0.2, 0.4, 0.6, 0.8, 1].map(sliderToSpeed);

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("clamps a slider position outside 0..1", () => {
    expect(sliderToSpeed(-0.5)).toBeCloseTo(MIN_SPEED, 10);
    expect(sliderToSpeed(2)).toBeCloseTo(MAX_SPEED, 10);
  });
});

describe("speedToSlider", () => {
  it("round-trips every labelled tick", () => {
    for (const tick of SPEED_TICKS) {
      expect(sliderToSpeed(speedToSlider(tick))).toBeCloseTo(tick, 10);
    }
  });

  it("keeps every tick inside the slider track", () => {
    for (const tick of SPEED_TICKS) {
      const t = speedToSlider(tick);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});

describe("clampSpeed", () => {
  it("holds a stored value to the range", () => {
    expect(clampSpeed(0)).toBe(MIN_SPEED);
    expect(clampSpeed(99)).toBe(MAX_SPEED);
    expect(clampSpeed(1)).toBe(1);
  });

  // localStorage에서 읽은 값은 무엇이든 올 수 있다.
  it("falls back to 1x when the value is not a usable number", () => {
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampSpeed(Number.POSITIVE_INFINITY)).toBe(MAX_SPEED);
  });
});

describe("frameBudget", () => {
  it("scales real elapsed time by the speed", () => {
    expect(frameBudget(16, 2)).toBe(32);
    expect(frameBudget(16, 0.5)).toBe(8);
  });

  // 탭을 다른 창에 두고 오면 rAF가 멈췄다가 한 번에 큰 delta로 돌아온다. 그대로 쓰면
  // 물리를 수십 초어치 한 프레임에 돌려 화면이 튄다.
  it("caps a long stall so a backgrounded tab does not jump the race", () => {
    expect(frameBudget(5000, 1)).toBe(MAX_FRAME_MS);
  });

  it("ignores a negative or first-frame delta", () => {
    expect(frameBudget(-10, 1)).toBe(0);
  });
});

describe("drainBudget", () => {
  it("runs one step per whole step worth of budget and keeps the remainder", () => {
    const { steps, rest } = drainBudget(50, 20, 10);

    expect(steps).toBe(2);
    expect(rest).toBe(10);
  });

  it("runs nothing while the budget is short of a step", () => {
    const { steps, rest } = drainBudget(19, 20, 10);

    expect(steps).toBe(0);
    expect(rest).toBe(19);
  });

  // 배속을 4x로 올린 채 창을 오래 가려두면 예산이 크게 쌓인다. 상한을 두지 않으면
  // 한 프레임이 수백 스텝을 돌며 브라우저가 멎는다. 넘친 예산은 버린다 — 들고 있으면
  // 다음 프레임도 똑같이 밀려 영영 따라잡지 못한다.
  it("caps the steps per frame and drops the overflow instead of carrying it", () => {
    const { steps, rest } = drainBudget(10_000, 20, 5);

    expect(steps).toBe(5);
    expect(rest).toBe(0);
  });

  // 배속이 결과를 바꾸면 안 된다: 같은 실제 시간이면 배속 비율만큼 스텝이 나온다.
  it("gives the same total steps for the same simulated time at any speed", () => {
    function totalSteps(speed: number, frames: number): number {
      let budget = 0;
      let steps = 0;
      for (let i = 0; i < frames; i++) {
        budget += frameBudget(16, speed);
        const drained = drainBudget(budget, 16, 100);
        steps += drained.steps;
        budget = drained.rest;
      }
      return steps;
    }

    // 240프레임 × 16ms = 3840ms. 2배속은 그 두 배를 시뮬레이션한다.
    expect(totalSteps(1, 240)).toBe(240);
    expect(totalSteps(2, 240)).toBe(480);
    expect(totalSteps(0.5, 240)).toBe(120);
  });
});
