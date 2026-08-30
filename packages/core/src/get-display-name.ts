export interface DisplayNameSource {
  realName: string | null;
  discordHandle: string | null;
  kakaoNickname: string | null;
}

export function getDisplayName(member: DisplayNameSource): string {
  return member.realName ?? member.discordHandle ?? member.kakaoNickname ?? "이름 미확인";
}
