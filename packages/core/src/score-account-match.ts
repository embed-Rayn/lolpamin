import { normalizeForMatch as normalize } from "./kakao-match-key";

export interface AccountMatchScore {
  score: number;
  reasons: string[];
}

const NAME_MATCH = 100;
const NAME_SUFFIX_MATCH = 60;
const GAME_NICK_MATCH = 80;

/** 단독 후보로 볼 최소 점수. */
export const SOLE_CANDIDATE_SCORE = 140;
/** 1위가 2위를 이만큼 벌리면 단독 후보로 본다. */
export const SOLE_CANDIDATE_GAP = 60;

/** 게임닉 신호로 쓰기에 충분히 긴 조각의 최소 길이. 짧으면 우연히 겹친다. */
const MIN_SIGNAL_LENGTH = 3;

// "실명/95/게임닉#태그/포지션" 같은 문자열을 조각으로 쪼갠다. 나이처럼 숫자만인
// 조각은 버린다 — 같은 나이라는 이유로 점수가 붙으면 안 된다.
function segments(value: string): string[] {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^\d+$/.test(part));
}

export function scoreAccountMatch(kakaoNickname: string, discordDisplayName: string): AccountMatchScore {
  const kakaoSegments = segments(kakaoNickname);
  const discordSegments = segments(discordDisplayName);
  const reasons: string[] = [];
  let score = 0;

  const kakaoName = normalize(kakaoSegments[0] ?? "");
  const discordName = normalize(discordSegments[0] ?? "");

  if (kakaoName.length > 0 && kakaoName === discordName) {
    score += NAME_MATCH;
    reasons.push("실명일치");
  } else if (
    kakaoName.length > 0 &&
    discordName.length > 0 &&
    (kakaoName.endsWith(discordName) || discordName.endsWith(kakaoName))
  ) {
    // 카톡에서는 성을 빼고 쓰는 경우가 흔하다: "동명" ⊂ "국동명", "시형" ⊂ "박시형".
    score += NAME_SUFFIX_MATCH;
    reasons.push("실명접미사");
  }

  const kakaoRest = kakaoSegments.slice(1).map(normalize).filter((s) => s.length >= MIN_SIGNAL_LENGTH);
  const discordRest = discordSegments.slice(1).map(normalize).filter((s) => s.length >= MIN_SIGNAL_LENGTH);
  const gameNickHit = kakaoRest.some((k) =>
    discordRest.some((d) => d === k || d.startsWith(k) || k.startsWith(d))
  );
  if (gameNickHit) {
    score += GAME_NICK_MATCH;
    reasons.push("게임닉일치");
  }

  return { score, reasons };
}

export function isSoleCandidate(topScore: number, secondScore: number): boolean {
  return topScore >= SOLE_CANDIDATE_SCORE || topScore - secondScore >= SOLE_CANDIDATE_GAP;
}
