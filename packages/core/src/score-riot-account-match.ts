import { normalizeForMatch as normalize } from "./kakao-match-key";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "./normalize-kakao-nickname";
import { discordRiotHint, kakaoRiotHint } from "./riot-hint";
import type { AccountMatchScore } from "./score-account-match";

export interface RiotMatchPlayer {
  gameName: string;
  tagLine: string;
  /** 리플레이의 TEAM_POSITION. 특수한 판에서는 빈 문자열이다. */
  position: string;
}

export interface RiotMatchMember {
  realName: string | null;
  kakaoNickname: string | null;
  discordDisplayName: string | null;
  riotId: string | null;
}

const RIOT_ID_MATCH = 100;
const RIOT_ID_SIMILAR = 60;
const REAL_NAME_FRAGMENT = 45;
const POSITION_BONUS = 25;

/** 자동 배정에 필요한 최소 점수. 손으로 적은 Riot ID가 정확히 맞아떨어진 경우에만 나온다. */
export const AUTO_ASSIGN_SCORE = 100;
/** 1위가 2위를 이만큼 벌려야 자동 배정한다. */
export const AUTO_ASSIGN_GAP = 40;

// 짧은 조각은 우연히 겹친다. 힌트도 실명 조각도 이 길이 아래면 신호로 쓰지 않는다.
const MIN_HINT_LENGTH = 3;
const MIN_FRAGMENT_LENGTH = 2;

/**
 * 힌트 한 개의 점수. 비교는 전부 normalizeForMatch를 거치므로 대소문자·공백·`#._-`가
 * 접힌다 — "Pink Taric Boy#KR2"와 "PinkTaricBoy"가 같은 값이 된다.
 */
function hintScore(hint: string | null, full: string, name: string): number {
  if (!hint) return 0;
  const value = normalize(hint);
  if (value.length < MIN_HINT_LENGTH) return 0;

  if (value === full || value === name) return RIOT_ID_MATCH;

  // 닉네임 뒤에 메모를 붙이거나("늑구#KR1 밥먹고옴") 태그를 빠뜨린 표기를 받는다.
  const related = [full, name].some(
    (target) =>
      target.length >= MIN_HINT_LENGTH &&
      (value.startsWith(target) || target.startsWith(value) || value.endsWith(target) || target.endsWith(value)),
  );
  return related ? RIOT_ID_SIMILAR : 0;
}

/** 회원의 실명. 없으면 카톡 닉네임의 첫 조각에서 얻고, "선동엽 95"처럼 붙은 연도는 뗀다. */
function realNameOf(member: RiotMatchMember): string {
  const raw =
    member.realName ??
    (member.kakaoNickname ? realNameFromKakaoNickname(normalizeKakaoNickname(member.kakaoNickname)) : null);
  if (!raw) return "";
  return raw.replace(/\s+(\d{2}|19\d{2}|20\d{2})$/, "").trim();
}

/**
 * 리플레이 참가자 한 명과 회원 한 명이 같은 사람일 가능성을 점수로 낸다.
 *
 * 카톡·디코 닉네임에 적힌 Riot ID와 Member.riotId는 사람이 손으로 적은 값이라 부정확하다.
 * 계정의 출처가 아니라 힌트로만 쓰고, 셋 중 가장 센 신호 하나만 센다 — 같은 사실을 세 번
 * 세면 오타 하나 없는 사람이 실제보다 세 배 유리해진다.
 */
export function scoreRiotAccountMatch(player: RiotMatchPlayer, member: RiotMatchMember): AccountMatchScore {
  const full = normalize(`${player.gameName}#${player.tagLine}`);
  const name = normalize(player.gameName);

  const discord = discordRiotHint(member.discordDisplayName ?? "");
  const hints: Array<[string | null, string, string]> = [
    [member.kakaoNickname ? kakaoRiotHint(member.kakaoNickname) : null, "카톡ID일치", "카톡ID유사"],
    [discord.riotId, "디코ID일치", "디코ID유사"],
    [member.riotId, "등록ID일치", "등록ID유사"],
  ];

  let score = 0;
  const reasons: string[] = [];

  let bestHint = 0;
  let bestReason = "";
  for (const [hint, exactLabel, similarLabel] of hints) {
    const value = hintScore(hint, full, name);
    if (value > bestHint) {
      bestHint = value;
      bestReason = value === RIOT_ID_MATCH ? exactLabel : similarLabel;
    }
  }
  if (bestHint > 0) {
    score += bestHint;
    reasons.push(bestReason);
  }

  // 인게임 닉을 바꿔도 "우성정글"처럼 실명 조각이 남는 일이 많다. 성을 뗀 조각도 본다 —
  // 게임닉에 성까지 넣는 사람은 드물다.
  const realName = normalize(realNameOf(member));
  const fragments = [realName, realName.slice(1)].filter((f) => f.length >= MIN_FRAGMENT_LENGTH);
  if (name.length > 0 && fragments.some((f) => name.includes(f))) {
    score += REAL_NAME_FRAGMENT;
    reasons.push("실명조각");
  }

  // 포지션은 가산점 전용이다. 다른 신호가 0이면 후보로 만들지 않는다.
  if (score > 0 && player.position.length > 0 && discord.positions.includes(player.position)) {
    score += POSITION_BONUS;
    reasons.push("포지션일치");
  }

  return { score, reasons };
}

/**
 * 관리자 확인 없이 자동으로 배정해도 되는지. score-account-match의 isSoleCandidate와
 * 같은 사고방식이지만 문턱이 다르다 — 이쪽은 "손으로 적은 Riot ID가 정확히 맞았다"를
 * 최소 조건으로 요구한다.
 */
export function isAutoAssignable(topScore: number, secondScore: number): boolean {
  return topScore >= AUTO_ASSIGN_SCORE && topScore - secondScore >= AUTO_ASSIGN_GAP;
}
