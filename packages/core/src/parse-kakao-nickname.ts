export interface ParsedKakaoNickname {
  realName: string;
  age: number;
  nicknameTag: string;
}

export function parseKakaoNickname(nickname: string): ParsedKakaoNickname | null {
  const parts = nickname.split("/");
  if (parts.length !== 3) return null;

  const [realName, ageText, nicknameTag] = parts;
  if (realName.length === 0 || nicknameTag.length === 0) return null;

  if (!/^\d+$/.test(ageText)) return null;

  return { realName, age: Number(ageText), nicknameTag };
}
