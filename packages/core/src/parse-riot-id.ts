export interface ParsedRiotId {
  gameName: string;
  tagLine: string;
}

/**
 * "게임닉#태그"를 두 조각으로 나눈다. 마지막 `#` 기준이다 — 게임 닉에 `#`은 못 들어가지만
 * 사람이 적은 문자열은 무엇이든 올 수 있어 방어적으로 둔다.
 *
 * 형식 검증은 이것뿐이다. 길이·문자 규칙은 라이엇이 안다 — 조회가 404를 내면 그것이 답이다.
 */
export function parseRiotId(text: string): ParsedRiotId | null {
  const at = text.lastIndexOf("#");
  if (at < 0) return null;
  const gameName = text.slice(0, at).trim();
  const tagLine = text.slice(at + 1).trim();
  if (gameName.length === 0 || tagLine.length === 0) return null;
  return { gameName, tagLine };
}
