import { TOURNAMENT_SLOTS } from "@lolpamin/core";
import type { PrismaClient } from "@lolpamin/db";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";
import { ALLOWED_EVENT_IMAGE_TYPES, EVENT_IMAGE_MAX_BYTES } from "@/lib/mutations/event-posts";
import { isTournamentEnabled } from "./queries";

export const TOURNAMENT_IMAGE_MAX = 20;
export const TOURNAMENT_TEAM_NAME_MAX = 20;

export class TournamentValidationError extends Error {}

export interface TournamentImageUpload {
  bytes: Buffer;
  type: string;
}

async function requireEnabled(prisma: PrismaClient): Promise<void> {
  if (!(await isTournamentEnabled(prisma))) throw new TournamentValidationError("대회 페이지가 꺼져 있습니다.");
}

export async function setTournamentEnabled(
  prisma: PrismaClient,
  enabled: boolean,
  adminId: string | null,
): Promise<void> {
  void adminId;
  await prisma.siteSetting.upsert({
    where: { id: SITE_SETTING_ID },
    create: { id: SITE_SETTING_ID, tournamentEnabled: enabled },
    update: { tournamentEnabled: enabled },
  });
}

export async function renameTournamentTeam(
  prisma: PrismaClient,
  slot: number,
  name: string,
  adminId: string | null,
): Promise<void> {
  await requireEnabled(prisma);
  if (!(TOURNAMENT_SLOTS as readonly number[]).includes(slot)) throw new TournamentValidationError("없는 팀입니다.");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > TOURNAMENT_TEAM_NAME_MAX) {
    throw new TournamentValidationError("팀 이름은 1~20자입니다.");
  }
  await prisma.tournamentTeam.upsert({
    where: { slot },
    create: { slot, name: trimmed, updatedById: adminId },
    update: { name: trimmed, updatedById: adminId },
  });
}

export async function addTournamentImage(prisma: PrismaClient, upload: TournamentImageUpload): Promise<string> {
  await requireEnabled(prisma);
  if (!ALLOWED_EVENT_IMAGE_TYPES.includes(upload.type)) {
    throw new TournamentValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > EVENT_IMAGE_MAX_BYTES) {
    throw new TournamentValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.tournamentImage.aggregate({ _count: { _all: true }, _max: { position: true } });
    if (current._count._all >= TOURNAMENT_IMAGE_MAX) {
      throw new TournamentValidationError(`사진은 ${TOURNAMENT_IMAGE_MAX}장까지 올릴 수 있습니다.`);
    }
    const created = await tx.tournamentImage.create({
      data: { position: (current._max.position ?? -1) + 1, bytes: upload.bytes, type: upload.type },
      select: { id: true },
    });
    return created.id;
  });
}

// Deleting twice is harmless. Positions may keep a gap; order is all that matters.
export async function deleteTournamentImage(prisma: PrismaClient, id: string): Promise<void> {
  await requireEnabled(prisma);
  await prisma.tournamentImage.deleteMany({ where: { id } });
}

// Swaps positions with the nearest neighbour; at either end nothing changes.
export async function moveTournamentImage(
  prisma: PrismaClient,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await requireEnabled(prisma);
  if (direction !== "up" && direction !== "down") throw new TournamentValidationError("잘못된 이동 방향입니다.");
  await prisma.$transaction(async (tx) => {
    const image = await tx.tournamentImage.findUnique({ where: { id }, select: { id: true, position: true } });
    if (!image) return;
    const neighbour = await tx.tournamentImage.findFirst({
      where: { position: direction === "up" ? { lt: image.position } : { gt: image.position } },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (!neighbour) return;
    await tx.tournamentImage.update({ where: { id: image.id }, data: { position: neighbour.position } });
    await tx.tournamentImage.update({ where: { id: neighbour.id }, data: { position: image.position } });
  });
}
