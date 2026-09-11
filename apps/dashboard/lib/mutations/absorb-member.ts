import type { Prisma, PrismaClient } from "@lolpamin/db";

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

// 취소된 경기는 활동으로 세지 않는다 — 없던 일이 된 경기다.
async function latestGameAt(tx: Prisma.TransactionClient, memberIds: string[]): Promise<Date | null> {
  const latest = await tx.gameParticipant.findFirst({
    where: { memberId: { in: memberIds }, gameResult: { cancelledAt: null } },
    orderBy: { gameResult: { playedAt: "desc" } },
    select: { gameResult: { select: { playedAt: true } } },
  });
  return latest?.gameResult.playedAt ?? null;
}

// mergedIntoId를 심기 전, 각 회원의 실제 마지막 활동을 구한다. lastActiveAt 필드는
// 보통 카톡 임포트가 멘션 로그와 함께 갱신하지만, 필드가 갱신되지 않은 채 로그만 있는
// 경우도 있으므로 필드와 자기 로그 중 더 나중 값을 취한다. 리플레이 임포트가 생긴 뒤로는
// 멘션 없이 경기만 뛴 회원이 있을 수 있어 경기 날짜도 함께 본다.
async function effectiveLastActiveAt(
  tx: Prisma.TransactionClient,
  memberId: string,
  fieldValue: Date | null,
): Promise<Date | null> {
  const latest = await tx.mentionLog.aggregate({ where: { memberId }, _max: { mentionedAt: true } });
  return laterOf(laterOf(fieldValue, latest._max.mentionedAt), await latestGameAt(tx, [memberId]));
}

// absorbMember가 의도적으로 던지는 안내 문구. 서버 액션은 이 목록에 있는 메시지만
// 관리자 화면에 그대로 보여준다 — Prisma가 던지는 영어 예외를 노출하지 않기 위해서다.
export const ABSORB_MEMBER_ERRORS = {
  alreadyMerged: "이미 다른 회원에게 흡수된 계정입니다.",
  platformAccountId: "플랫폼 계정 ID를 가진 회원은 흡수할 수 없습니다. 카톡 닉네임만 있는 회원만 흡수됩니다.",
  selfAbsorb: "자기 자신에게 흡수시킬 수 없습니다.",
  sharedGame: "같은 경기에 두 회원이 모두 참가해 있어 흡수할 수 없습니다. 경기 기록을 먼저 정리해 주세요.",
} as const;

/**
 * loser를 survivor에게 흡수시킨다. 행을 지우지 않고 mergedIntoId만 심으므로
 * releaseMember로 되돌릴 수 있고, loser의 kakaoNickname은 과거 닉네임으로 남아
 * 이후 카톡 임포트가 같은 사람에게 활동을 이어붙이는 데 쓰인다.
 */
export async function absorbMember(
  prisma: PrismaClient,
  loserId: string,
  survivorId: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const loser = await tx.member.findUniqueOrThrow({ where: { id: loserId } });

      if (loser.mergedIntoId !== null) {
        throw new Error(ABSORB_MEMBER_ERRORS.alreadyMerged);
      }
      // 묘비가 유니크 컬럼을 쥐고 있으면 같은 계정을 다시 가져올 때 제약에 막힌다.
      if (loser.discordUserId !== null || loser.kakaoUserId !== null) {
        throw new Error(ABSORB_MEMBER_ERRORS.platformAccountId);
      }

      // 대상이 이미 묘비면 그 생존자를 가리키게 한다 — mergedIntoId는 항상 활성 회원을 가리킨다.
      const target = await tx.member.findUniqueOrThrow({ where: { id: survivorId } });
      const survivor =
        target.mergedIntoId === null
          ? target
          : await tx.member.findUniqueOrThrow({ where: { id: target.mergedIntoId } });

      if (survivor.id === loser.id) {
        throw new Error(ABSORB_MEMBER_ERRORS.selfAbsorb);
      }

      // 두 행이 같은 경기에 들어 있으면 이관이 @@unique([gameResultId, memberId])에 막힌다.
      // Prisma의 영어 예외를 노출하는 대신 여기서 막고 안내 문구를 던진다.
      const loserGames = await tx.gameParticipant.findMany({
        where: { memberId: loser.id },
        select: { gameResultId: true },
      });
      if (loserGames.length > 0) {
        const clash = await tx.gameParticipant.findFirst({
          where: { memberId: survivor.id, gameResultId: { in: loserGames.map((g) => g.gameResultId) } },
        });
        if (clash) throw new Error(ABSORB_MEMBER_ERRORS.sharedGame);
      }

      const survivorLastActiveAt = await effectiveLastActiveAt(tx, survivor.id, survivor.lastActiveAt);
      const loserLastActiveAt = await effectiveLastActiveAt(tx, loser.id, loser.lastActiveAt);

      // mmr은 건드리지 않는다 — 경기 기록에서 계산된 값이라 병합으로 만들어낼 수 없다.
      await tx.member.update({
        where: { id: survivor.id },
        data: {
          realName: survivor.realName ?? loser.realName,
          age: survivor.age ?? loser.age,
          riotId: survivor.riotId ?? loser.riotId,
          // tier는 not-null이라 ??가 통하지 않는다 — UNRANKED를 "값 없음"으로 취급한다.
          tier: survivor.tier === "UNRANKED" ? loser.tier : survivor.tier,
          // kakaoNickname은 생존자에게 복사하지 않는다. 과거 닉네임을 한 행만 들고 있어야
          // processKakaoExport의 닉네임 조회가 묘비를 정확히 집어 멘션 로그를 거기 남기고,
          // 그래야 해제가 mergedIntoId 한 컬럼으로 끝난다. "연결 완료" 판정은 묘비까지
          // 함께 보는 쪽(queries/*, saveGameResult)에서 처리한다.
          lastActiveAt: laterOf(survivorLastActiveAt, loserLastActiveAt),
        },
      });

      // loser가 이미 다른 묘비들을 흡수해 뒀다면, 그 묘비들도 함께 새 survivor를
      // 가리키도록 옮긴다. 그러지 않으면 그 묘비들의 mergedIntoId가 이제 묘비가 될
      // loser를 가리킨 채로 남아 불변식 2(항상 활성 회원을 가리킨다)가 깨진다.
      await tx.member.updateMany({
        where: { mergedIntoId: loser.id },
        data: { mergedIntoId: survivor.id },
      });

      // 경기 기록과 라이엇 계정은 생존자에게 옮긴다. 카톡 닉네임과 달리 묘비에 남겨 두면
      // 전적과 MMR이 이름만 바뀐 채 사라진 것처럼 보인다.
      //
      // absorbedFromId는 비어 있을 때만 채운다. loser가 이미 다른 묘비의 기록을 넘겨받았다면
      // 그 행의 원주인은 loser가 아니라 더 앞의 묘비이고, 그 값을 덮으면 되돌릴 길이 없어진다.
      // 그래서 두 번에 나눠 쓴다 — 먼저 표식이 없는 행만, 그다음 남은 행을 옮긴다.
      //
      // 두 모델을 배열로 돌리지 않는다. tx[model]은 두 델리게이트 타입의 유니언이 되어
      // updateMany 호출이 타입 오류를 낸다("none of those signatures are compatible").
      await tx.gameParticipant.updateMany({
        where: { memberId: loser.id, absorbedFromId: null },
        data: { memberId: survivor.id, absorbedFromId: loser.id },
      });
      await tx.gameParticipant.updateMany({
        where: { memberId: loser.id },
        data: { memberId: survivor.id },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: loser.id, absorbedFromId: null },
        data: { memberId: survivor.id, absorbedFromId: loser.id },
      });
      await tx.riotAccount.updateMany({
        where: { memberId: loser.id },
        data: { memberId: survivor.id },
      });

      await tx.member.update({ where: { id: loser.id }, data: { mergedIntoId: survivor.id } });
    },
    { timeout: 20000 },
  );
}
