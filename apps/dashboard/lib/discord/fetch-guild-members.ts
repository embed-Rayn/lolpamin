import type { DiscordGuildMember } from "@/lib/mutations/import-discord-members";

// 디스코드 응답 중 이 시스템이 쓰는 필드만 옮겨 담는다. 네트워크와 디스코드의 응답
// 형식을 아는 유일한 파일이며, 실제 API에 의존하므로 자동 테스트 대상이 아니다.
interface DiscordApiGuildMember {
  user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null;
  joined_at?: string;
}

const MAX_MEMBERS_PER_REQUEST = 1000;

export async function fetchGuildMembers(token: string, guildId: string): Promise<DiscordGuildMember[]> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members?limit=${MAX_MEMBERS_PER_REQUEST}`,
    { headers: { Authorization: `Bot ${token}` }, cache: "no-store" }
  );

  if (response.status === 403) {
    throw new Error(
      "디스코드가 회원 목록 조회를 거부했습니다. 개발자 포털에서 Server Members Intent를 켜야 합니다."
    );
  }
  if (!response.ok) {
    throw new Error(`디스코드 API 오류 (${response.status})`);
  }

  const body = (await response.json()) as DiscordApiGuildMember[];

  if (body.length === MAX_MEMBERS_PER_REQUEST) {
    console.warn(
      `[discord] 길드 회원이 ${MAX_MEMBERS_PER_REQUEST}명에 도달했습니다. 그 이후 인원은 가져오지 않습니다.`
    );
  }

  return body.flatMap((entry) => {
    if (!entry.user) return [];
    return [
      {
        discordUserId: entry.user.id,
        username: entry.user.username,
        // 매칭·표시용 이름. 서버 별명이 카톡 닉네임과 가장 비슷한 형식이라 먼저 보고,
        // 없으면 global_name으로 떨어진다. username은 "k._.dj" 같은 값이라 쓰지 않는다.
        displayName: entry.nick ?? entry.user.global_name ?? null,
        isBot: entry.user.bot === true,
        joinedAt: entry.joined_at ? new Date(entry.joined_at) : null,
      },
    ];
  });
}
