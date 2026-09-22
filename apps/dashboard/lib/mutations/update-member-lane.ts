import type { Lane, PrismaClient } from "@lolpamin/db";

export type LaneSlot = "main" | "sub";

/**
 * 회원의 주라인 또는 부라인을 저장한다. null은 「모름」으로 되돌린다.
 * 한 라인이 주이면서 부일 수는 없다 — 반대 칸에 이미 있는 라인을 고르면 반대 칸을 비운다.
 */
export async function updateMemberLane(
  prisma: PrismaClient,
  memberId: string,
  slot: LaneSlot,
  lane: Lane | null,
): Promise<void> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { mainLane: true, subLane: true },
  });

  const other = slot === "main" ? member.subLane : member.mainLane;
  const clearOther = lane !== null && lane === other;

  await prisma.member.update({
    where: { id: memberId },
    data:
      slot === "main"
        ? { mainLane: lane, ...(clearOther ? { subLane: null } : {}) }
        : { subLane: lane, ...(clearOther ? { mainLane: null } : {}) },
  });
}
