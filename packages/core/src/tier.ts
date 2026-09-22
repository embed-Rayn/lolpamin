// `type`을 빼면 안 된다 — packages/db/src/index.ts는 모듈 로드 시점에 PrismaClient를
// 만든다. 그 keyword를 빼면 이 순수 도메인 패키지를 로드할 때 Prisma client가 함께
// 부팅되어, DB 없이 도는 이 패키지의 테스트가 깨진다.
import type { MemberTier } from "@lolpamin/db";

// 스펙(2026-09-03-tier-score-and-manual-team-builder-design.md)의 참조표 그대로다.
// 선언 순서가 점수 내림차순이고, TIER_OPTIONS가 이 순서를 그대로 쓴다.
//
// 점수를 DB에 저장하지 않고 여기서 매번 계산하는 이유: 저장하면 이 표를 고쳤을 때 이미
// 저장된 값이 옛 표에 묶인다.
export const TIER_SCORES: Record<MemberTier, number> = {
  MASTER_1000_PLUS: 30,
  MASTER_800_1000: 29,
  MASTER_600_800: 28,
  MASTER_400_600: 27,
  MASTER_200_400: 26,
  MASTER_0_200: 25,
  DIAMOND_1: 24,
  DIAMOND_2: 23,
  DIAMOND_3: 22,
  DIAMOND_4: 21,
  EMERALD_1: 20,
  EMERALD_2: 19,
  EMERALD_3: 18,
  EMERALD_4: 17,
  PLATINUM_1: 16,
  PLATINUM_2: 15,
  PLATINUM_3: 14,
  PLATINUM_4: 13,
  GOLD_1: 12,
  GOLD_2: 11,
  GOLD_3: 10,
  GOLD_4: 9,
  SILVER_1: 8,
  SILVER_2: 7,
  SILVER_3: 6,
  SILVER_4: 5,
  BRONZE_1: 4,
  BRONZE_2: 3,
  BRONZE_3: 2,
  BRONZE_4: 1,
  // 브4가 1점이므로 그 아래는 구분하지 않는다.
  IRON: 0,
  UNRANKED: 0,
};

// 모임이 실제로 쓰는 표기다 — "다1", "에2". 마스터 구간은 LP 하한을 100 단위로 읽는다
// ("마4↑" = 400LP 이상) — 범위를 다 적으면 표의 티어 칸이 그것만으로 넓어진다.
export const TIER_LABELS: Record<MemberTier, string> = {
  MASTER_1000_PLUS: "마10↑",
  MASTER_800_1000: "마8↑",
  MASTER_600_800: "마6↑",
  MASTER_400_600: "마4↑",
  MASTER_200_400: "마2↑",
  MASTER_0_200: "마0↑",
  DIAMOND_1: "다1",
  DIAMOND_2: "다2",
  DIAMOND_3: "다3",
  DIAMOND_4: "다4",
  EMERALD_1: "에1",
  EMERALD_2: "에2",
  EMERALD_3: "에3",
  EMERALD_4: "에4",
  PLATINUM_1: "플1",
  PLATINUM_2: "플2",
  PLATINUM_3: "플3",
  PLATINUM_4: "플4",
  GOLD_1: "골1",
  GOLD_2: "골2",
  GOLD_3: "골3",
  GOLD_4: "골4",
  SILVER_1: "실1",
  SILVER_2: "실2",
  SILVER_3: "실3",
  SILVER_4: "실4",
  BRONZE_1: "브1",
  BRONZE_2: "브2",
  BRONZE_3: "브3",
  BRONZE_4: "브4",
  IRON: "아이언",
  UNRANKED: "언랭",
};

export function tierScore(tier: MemberTier): number {
  return TIER_SCORES[tier];
}

export function tierLabel(tier: MemberTier): string {
  return TIER_LABELS[tier];
}

export interface TierOption {
  value: MemberTier;
  label: string;
  score: number;
}

// 드롭다운 항목. TIER_SCORES의 키 순서(= 점수 내림차순)를 그대로 쓴다 — 자바스크립트
// 객체는 문자열 키의 삽입 순서를 보존하므로 따로 정렬할 필요가 없다.
export const TIER_OPTIONS: readonly TierOption[] = (Object.keys(TIER_SCORES) as MemberTier[]).map(
  (value) => ({ value, label: TIER_LABELS[value], score: TIER_SCORES[value] }),
);
