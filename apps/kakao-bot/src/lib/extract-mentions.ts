export interface RawMention {
  user_id: string | number | { toString(): string };
}

export function extractMentionedKakaoUserIds(mentions: RawMention[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const mention of mentions) {
    const kakaoUserId = String(mention.user_id);
    if (seen.has(kakaoUserId)) continue;
    seen.add(kakaoUserId);
    result.push(kakaoUserId);
  }

  return result;
}
