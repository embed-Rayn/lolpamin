import { normalizeKakaoNickname } from "./normalize-kakao-nickname";

/**
 * 같은 사람인지 비교할 때만 쓰는 형태. 대소문자와 공백, 그리고 카톡·롤 닉네임에
 * 장식으로 붙는 기호(#._-)를 지운다 — "늑 구#KR1"과 "늑구#kr1"은 같은 사람이다.
 * 화면에 띄우거나 저장하는 값이 아니다.
 */
export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[\s#._-]/g, "");
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
 * 관례를 안 지킨 닉네임("올빼미")은 쪼갤 것이 없으므로 문자열 전체를 정규화해 쓴다.
 * 그런 닉네임은 메모가 붙으면 여전히 갈라지지만, 애초에 기준으로 삼을 조각이 없다.
 */
export function kakaoMatchKey(rawNickname: string): string {
  // 괄호 메모를 먼저 뗀다. 폴백 경로에서 "(5시)"가 키에 섞이지 않게 하려는 것이고,
  // 관례를 지킨 닉네임에서는 어차피 뒤 조각이 버려지므로 결과가 같다.
  const nickname = normalizeKakaoNickname(rawNickname);

  const parts = nickname.split("/");
  if (parts.length >= 3 && /^\d+$/.test(parts[1].trim())) {
    const realName = normalizeForMatch(parts[0]);
    if (realName.length > 0) return `${realName}/${Number(parts[1].trim())}`;
  }

  return normalizeForMatch(nickname);
}
