import type { MemberLane, PrismaClient } from "@lolpamin/db";

export type LaneSlot = "primary" | "secondary";

export async function updateMemberLane(
  prisma: PrismaClient,
  memberId: string,
  slot: LaneSlot,
  lane: MemberLane | null
): Promise<void> {
  await prisma.member.update({
    where: { id: memberId },
    data: slot === "primary" ? { primaryLane: lane } : { secondaryLane: lane },
  });
}
