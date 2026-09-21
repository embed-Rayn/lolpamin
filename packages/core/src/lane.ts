// `type`을 빼면 안 된다 — tier.ts와 같은 이유로, 값으로 임포트하면 이 순수 패키지를
// 로드할 때 Prisma client가 함께 부팅된다.
import type { MemberLane } from "@lolpamin/db";

// 선언 순서가 화면에 뜨는 순서다 — 탑부터 서폿까지 인게임 순서.
export const LANE_LABELS: Record<MemberLane, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

// 라인을 고르지 않은 회원. DB에서는 null이고, 화면과 필터에서는 이 라벨로 보인다.
export const UNSET_LANE_LABEL = "미지정";

export interface LaneOption {
  value: MemberLane;
  label: string;
}

export const LANE_OPTIONS: readonly LaneOption[] = (Object.keys(LANE_LABELS) as MemberLane[]).map(
  (value) => ({ value, label: LANE_LABELS[value] }),
);

export function laneLabel(lane: MemberLane | null): string {
  return lane === null ? UNSET_LANE_LABEL : LANE_LABELS[lane];
}

export function isMemberLane(value: string): value is MemberLane {
  return Object.hasOwn(LANE_LABELS, value);
}
