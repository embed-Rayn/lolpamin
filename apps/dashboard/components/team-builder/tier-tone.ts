import type { MemberTier } from "@lolpamin/db";

// 티어 글자색. 계열(마스터·다이아…)만 보고 정한다 — 단계까지 색을 나누면 열 줄짜리
// 표가 무지개가 되어 정작 숫자가 안 읽힌다. 점수 0 구간(아이언·언랭)은 흐리게.
export function tierTone(tier: MemberTier): string {
  if (tier.startsWith("MASTER")) return "text-purple";
  if (tier.startsWith("DIAMOND")) return "text-accent-soft";
  if (tier.startsWith("EMERALD")) return "text-success-soft";
  if (tier.startsWith("PLATINUM")) return "text-success";
  if (tier.startsWith("GOLD")) return "text-gold-deep";
  if (tier.startsWith("SILVER")) return "text-fg-2";
  if (tier.startsWith("BRONZE")) return "text-orange";
  return "text-ghost";
}
