// `type`을 빼면 안 된다 — tier.ts와 같은 이유(Prisma client 부팅 방지).
import type { Lane } from "@lolpamin/db";

// 모임이 실제로 쓰는 표기다. 선언 순서가 곧 드롭다운 순서(탑 → 서폿)다.
export const LANE_LABELS: Record<Lane, string> = {
  TOP: "탑",
  JUG: "정글",
  MID: "미드",
  AD: "원딜",
  SUP: "서폿",
};

export function laneLabel(lane: Lane | null): string {
  return lane === null ? "-" : LANE_LABELS[lane];
}

export function isLane(value: unknown): value is Lane {
  return typeof value === "string" && Object.hasOwn(LANE_LABELS, value);
}

export const LANE_OPTIONS: ReadonlyArray<{ value: Lane; label: string }> = (
  Object.keys(LANE_LABELS) as Lane[]
).map((value) => ({ value, label: LANE_LABELS[value] }));
