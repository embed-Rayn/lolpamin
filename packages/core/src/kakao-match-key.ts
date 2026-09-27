import { fullBirthYear } from "./birth-year";
import { normalizeKakaoNickname } from "./normalize-kakao-nickname";

/**
 * 같은 사람인지 비교할 때만 쓰는 형태. 대소문자와 공백, 그리고 카톡·롤 닉네임에
 * 장식으로 붙는 기호(#._-)를 지운다 — "늑 구#KR1"과 "늑구#kr1"은 같은 사람이다.
 * 화면에 띄우거나 저장하는 값이 아니다.
 */
export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[\s#._-]/g, "");
}

/** 모임의 닉네임 관례 "실명/출생연도/게임닉#태그"를 읽은 결과. 관례 밖이면 null이다. */
export interface KakaoConvention {
  /** 실명 조각. 정규화 전 원문이다. */
  realName: string;
  /** 출생연도. "94"는 94, "1994"는 1994로 읽는다 — 쓰는 쪽이 그대로 키에 넣는다. */
  year: number;
  /** 관례상 Riot ID가 적히는 조각. 비어 있으면 null이다. */
  riotId: string | null;
}

/**
 * 관례를 지킨 닉네임인지 한곳에서 판정한다. kakaoMatchKey와 kakaoRiotHint가 같은 답을
 * 내야 하므로(설계: "kakaoMatchKey가 쓰는 판정과 같다") 판정을 복사하지 않고 공유한다.
 *
 * 인자는 normalizeKakaoNickname을 이미 거친 값이어야 한다.
 */
export function readKakaoConvention(nickname: string): KakaoConvention | null {
  const parts = nickname.split("/").map((part) => part.trim());

  if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
    return { realName: parts[0], year: Number(parts[1]), riotId: parts[2].length > 0 ? parts[2] : null };
  }

  // "선동엽 95/glenone#5022" — 이름과 연도 사이가 공백이다. 두 자리(95)이거나 19xx·20xx여야
  // 연도로 본다. 네 자리를 다 열어 두면 "늑구 5022"의 5022까지 연도가 되어, 이름 뒤에 숫자를
  // 붙이는 게임닉이 통째로 다른 사람이 된다.
  if (parts.length >= 2) {
    const spaced = parts[0].match(/^(.+?)\s+(\d{2}|19\d{2}|20\d{2})$/);
    if (spaced) {
      return { realName: spaced[1], year: Number(spaced[2]), riotId: parts[1].length > 0 ? parts[1] : null };
    }
  }

  return null;
}

/**
 * 회원을 찾을 때 쓰는 키. 모임의 닉네임 관례 "실명/출생연도/게임닉#태그"에서 앞
 * 두 조각만 남긴다 — 뒤 조각은 롤 닉을 바꾸거나 "(5시)", "밥먹고옴" 같은 메모를
 * 붙일 때마다 달라지지만, 실명과 출생연도는 그대로다.
 *
 * parseKakaoNickname보다 느슨하게 자른다. 그쪽은 조각이 정확히 셋일 것을 요구하지만
 * (실명·나이·게임닉을 다 얻어야 하므로), 여기서는 앞 두 조각만 필요하므로 "실명/94/
 * 게임닉#태그/정글"처럼 조각이 더 많아도 같은 키가 나와야 한다.
 *
 * 첫 슬래시를 빠뜨린 "실명 출생연도/게임닉#태그"도 같은 키로 받는다. 실제 명단에
 * 그렇게 적는 사람이 있고, 그 사람만 관례 밖으로 떨어지면 롤 닉을 바꾸는 순간 새
 * 회원이 된다 — 이 함수가 막으려던 바로 그 일이다. 뒤에 슬래시가 하나라도 남아
 * 있을 때만 적용해서, 슬래시가 아예 없는 닉네임("올빼미 2")까지 쪼개지 않는다.
 *
 * 관례를 안 지킨 닉네임("올빼미")은 쪼갤 것이 없으므로 문자열 전체를 정규화해 쓴다.
 * 그런 닉네임은 메모가 붙으면 여전히 갈라지지만, 애초에 기준으로 삼을 조각이 없다.
 */
export function kakaoMatchKey(rawNickname: string): string {
  // 괄호 메모를 먼저 뗀다. 폴백 경로에서 "(5시)"가 키에 섞이지 않게 하려는 것이고,
  // 관례를 지킨 닉네임에서는 어차피 뒤 조각이 버려지므로 결과가 같다.
  const nickname = normalizeKakaoNickname(rawNickname);

  const convention = readKakaoConvention(nickname);
  if (convention) {
    const realName = normalizeForMatch(convention.realName);
    if (realName.length > 0) return `${realName}/${convention.year}`;
  }

  return normalizeForMatch(nickname);
}

/**
 * 카톡 닉네임 관례의 두 번째 조각(출생연도)을 네 자리 연도로 읽는다. 관례 밖이면 null.
 * "94"와 "1994"가 섞여 적히므로 두 자리는 네 자리로 펼쳐야 정렬이 맞는다 — 30 미만은
 * 2000년대로 본다.
 */
export function kakaoBirthYear(rawNickname: string): number | null {
  const convention = readKakaoConvention(normalizeKakaoNickname(rawNickname));
  if (!convention) return null;
  return fullBirthYear(convention.year);
}
