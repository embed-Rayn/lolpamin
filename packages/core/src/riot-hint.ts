import { normalizeKakaoNickname } from "./normalize-kakao-nickname";

/** 리플레이의 TEAM_POSITION 표기. 디코 닉네임의 한글 포지션을 여기로 옮긴다. */
export const REPLAY_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

// 한글 표기는 사람마다 다르다. 접두어로 잡아 "정글"과 "정글러", "서폿"과 "서포터"를 함께
// 받는다. 긴 접두어가 먼저 와야 "서폿터"가 "서폿"에 먼저 걸린다.
const POSITION_PREFIXES: Array<[string, (typeof REPLAY_POSITIONS)[number]]> = [
  ["탑", "TOP"],
  ["top", "TOP"],
  ["정글", "JUNGLE"],
  ["jungle", "JUNGLE"],
  ["jg", "JUNGLE"],
  ["정", "JUNGLE"],
  ["미드", "MIDDLE"],
  ["mid", "MIDDLE"],
  ["원딜", "BOTTOM"],
  ["바텀", "BOTTOM"],
  ["adc", "BOTTOM"],
  ["bot", "BOTTOM"],
  ["서포터", "UTILITY"],
  ["서폿", "UTILITY"],
  ["sup", "UTILITY"],
  ["util", "UTILITY"],
];

const ALL_POSITION_WORDS = ["올", "올포지션", "전체", "all"];

/**
 * 카톡 닉네임 "실명/출생연도/게임닉#태그"의 세 번째 조각. 나이 자리가 숫자일 때만 관례로
 * 인정한다 — kakaoMatchKey와 같은 판정이라 두 함수가 같은 닉네임을 같게 본다.
 *
 * 반환값은 사람이 손으로 적은 문자열이라 오타가 섞여 있을 수 있다. 매칭 힌트로만 쓰고
 * RiotAccount 행을 만드는 근거로는 쓰지 않는다.
 */
export function kakaoRiotHint(rawNickname: string): string | null {
  const nickname = normalizeKakaoNickname(rawNickname);
  const parts = nickname.split("/").map((p) => p.trim());

  if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
    return parts[2].length > 0 ? parts[2] : null;
  }

  // "선동엽 95/glenone#5022" — 이름과 연도 사이가 공백이다. kakaoMatchKey와 같은 조건
  // (두 자리이거나 19xx·20xx)으로 연도를 인정한다.
  if (parts.length >= 2 && /^(.+?)\s+(\d{2}|19\d{2}|20\d{2})$/.test(parts[0])) {
    return parts[1].length > 0 ? parts[1] : null;
  }

  return null;
}

function toPosition(word: string): (typeof REPLAY_POSITIONS)[number] | "ALL" | null {
  const token = word.trim().toLowerCase();
  if (token.length === 0) return null;
  if (ALL_POSITION_WORDS.includes(token)) return "ALL";
  for (const [prefix, position] of POSITION_PREFIXES) {
    if (token.startsWith(prefix)) return position;
  }
  return null;
}

/**
 * 디코 서버 별명 "실명/게임닉#태그/가능포지션"에서 두 번째·세 번째 조각을 꺼낸다.
 * 포지션은 리플레이 표기로 옮겨 담는다. 조각이 없으면 빈 결과다 — 핸들만 쓰는 사람이 흔하다.
 */
export function discordRiotHint(displayName: string): { riotId: string | null; positions: string[] } {
  const parts = displayName.split("/").map((p) => p.trim());
  const riotId = parts.length >= 2 && parts[1].length > 0 ? parts[1] : null;

  const positions: string[] = [];
  if (parts.length >= 3) {
    // "탑,미드", "원딜 서폿", "탑·정글" 전부 받는다.
    for (const word of parts[2].split(/[,·\s]+/)) {
      const position = toPosition(word);
      if (position === "ALL") return { riotId, positions: [...REPLAY_POSITIONS] };
      if (position && !positions.includes(position)) positions.push(position);
    }
  }

  return { riotId, positions };
}
