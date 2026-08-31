import type { Member, PrismaClient } from "@lolpamin/db";
import { normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";

export interface MergedPair {
  survivorId: string;
  survivorNickname: string;
  loserId: string;
  loserNickname: string;
  loserMentionLogs: number;
  loserGameParticipants: number;
}

export interface NormalizeResult {
  normalized: number;
  merged: number;
  realNamesFilled: number;
  mergedPairs: MergedPair[];
}

// 병합에서 살아남을 회원: 디스코드까지 연결된 쪽을 우선하고, 그다음 먼저 만들어진 쪽.
// 연결된 레코드를 지우면 계정 연결 작업을 다시 해야 하므로 그쪽을 남긴다.
function pickSurvivor(members: Member[]): Member {
  const sorted = [...members].sort((a, b) => {
    const aLinked = a.discordUserId !== null ? 0 : 1;
    const bLinked = b.discordUserId !== null ? 0 : 1;
    if (aLinked !== bLinked) return aLinked - bLinked;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0];
}

function latest(dates: Array<Date | null>): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

function datesDiffer(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a !== b;
  return a.getTime() !== b.getTime();
}

export async function normalizeKakaoNicknames(prisma: PrismaClient): Promise<NormalizeResult> {
  return prisma.$transaction(
    async (tx) => {
      // createdAt으로 정렬해 그룹핑·pickSurvivor의 tie-break가 결정적이도록 한다.
      // Postgres는 findMany의 행 순서를 보장하지 않으므로 명시하지 않으면 3자 이상
      // 충돌에서 어느 값이 승계될지가 실행마다 달라질 수 있다.
      const members = await tx.member.findMany({
        where: { mergedIntoId: null, kakaoNickname: { not: null } },
        orderBy: { createdAt: "asc" },
      });

      const groups = new Map<string, Member[]>();
      let normalized = 0;
      for (const member of members) {
        const normalizedNickname = normalizeKakaoNickname(member.kakaoNickname!);
        if (normalizedNickname.length === 0) continue;
        if (normalizedNickname !== member.kakaoNickname) normalized++;
        const group = groups.get(normalizedNickname);
        if (group) group.push(member);
        else groups.set(normalizedNickname, [member]);
      }

      let merged = 0;
      const mergedPairs: MergedPair[] = [];

      for (const [nickname, group] of groups) {
        // 정규화 후 닉네임이 같아지는 회원 중 디스코드가 연결된 게 둘 이상이면, 그중
        // 하나를 자동으로 버리는 건 관리자가 손으로 한 계정 연결을 조용히 지우는
        // 것과 같다. 스펙에 없는 상황이므로 사람이 판단하도록 트랜잭션을 통째로
        // 롤백시킨다.
        const linkedMembers = group.filter((m) => m.discordUserId !== null);
        if (linkedMembers.length > 1) {
          throw new Error(
            `카톡 닉네임 정규화 결과 "${nickname}"로 합쳐지는 회원 중 디스코드 연동이 2명 이상입니다: ` +
              linkedMembers.map((m) => `id=${m.id}(discordUserId=${m.discordUserId})`).join(", ") +
              " — 자동 병합을 중단합니다. 어느 쪽을 남길지 수동으로 정리한 뒤 다시 실행하세요.",
          );
        }

        const survivor = pickSurvivor(group);
        const losers = group.filter((m) => m.id !== survivor.id);

        for (const loser of losers) {
          // 활동기록을 옮기지 않고 묘비에 남긴다 — 연결을 끊으면 기록도 함께
          // 돌아가야 하고, 그래야 되돌리기가 mergedIntoId 한 줄로 끝난다.
          const loserMentionLogs = await tx.mentionLog.count({ where: { memberId: loser.id } });
          const loserGameParticipants = await tx.gameParticipant.count({ where: { memberId: loser.id } });
          await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });
          merged++;
          mergedPairs.push({
            survivorId: survivor.id,
            survivorNickname: nickname,
            loserId: loser.id,
            loserNickname: loser.kakaoNickname!,
            loserMentionLogs,
            loserGameParticipants,
          });
        }

        // elo는 생존자 값을 유지한다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
        const nextLastActiveAt = latest([survivor.lastActiveAt, ...losers.map((l) => l.lastActiveAt)]);
        const nextRealName = survivor.realName ?? losers.find((l) => l.realName !== null)?.realName ?? null;
        const nextAge = survivor.age ?? losers.find((l) => l.age !== null)?.age ?? null;
        const nextRiotId = survivor.riotId ?? losers.find((l) => l.riotId !== null)?.riotId ?? null;

        // 아무 값도 바뀌지 않는 no-op UPDATE라도 Prisma는 @updatedAt을 갱신한다.
        // 재실행이 진짜 아무것도 안 건드리도록, 실제로 달라지는 그룹에서만 UPDATE를 낸다.
        const survivorChanged =
          losers.length > 0 ||
          nickname !== survivor.kakaoNickname ||
          datesDiffer(nextLastActiveAt, survivor.lastActiveAt) ||
          nextRealName !== survivor.realName ||
          nextAge !== survivor.age ||
          nextRiotId !== survivor.riotId;

        if (survivorChanged) {
          await tx.member.update({
            where: { id: survivor.id },
            data: {
              kakaoNickname: nickname,
              lastActiveAt: nextLastActiveAt,
              realName: nextRealName,
              age: nextAge,
              riotId: nextRiotId,
            },
          });
        }
      }

      const blankRealNames = await tx.member.findMany({
        where: { mergedIntoId: null, realName: null, kakaoNickname: { not: null } },
      });
      let realNamesFilled = 0;
      for (const member of blankRealNames) {
        // 정규화를 거치지 않은 원본을 넘기면, 닉네임 전체가 "(8시 도착)"처럼 메모뿐인
        // 회원의 경우 슬래시가 없어 문자열 전체가 realName으로 저장돼 버린다.
        // 먼저 정규화해야 그런 닉네임은 빈 문자열이 되어 realNameFromKakaoNickname이
        // null을 반환하고 자동으로 건너뛴다.
        const realName = realNameFromKakaoNickname(normalizeKakaoNickname(member.kakaoNickname!));
        if (realName === null) continue;
        await tx.member.update({ where: { id: member.id }, data: { realName } });
        realNamesFilled++;
      }

      return { normalized, merged, realNamesFilled, mergedPairs };
    },
    { timeout: 20000 },
  );
}
