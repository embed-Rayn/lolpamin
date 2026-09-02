// 카톡 닉네임 뒤에는 "(7시30분 도착)" 같은 메모가 붙는 일이 잦다. 그 메모까지 포함해
// 저장하면 같은 사람이 메모를 적은 날과 안 적은 날에 서로 다른 회원으로 갈라진다.
// 닫는 괄호를 요구하지 않는 이유는 실제 데이터에 "(8시 30분"처럼 닫히지 않은 표기가 있기 때문이다.
export function normalizeKakaoNickname(raw: string): string {
  const noteStart = raw.search(/[(（]/);
  const withoutNote = noteStart === -1 ? raw : raw.slice(0, noteStart);
  return withoutNote.trim();
}

// "실명/나이/닉네임#태그" 관례의 첫 조각. parseKakaoNickname과 달리 세 조각을
// 요구하지 않는다 — 관례를 따르지 않는 닉네임에서도 실명 후보를 얻기 위해서다.
export function realNameFromKakaoNickname(nickname: string): string | null {
  const firstSegment = nickname.split("/")[0].trim();
  return firstSegment.length > 0 ? firstSegment : null;
}
