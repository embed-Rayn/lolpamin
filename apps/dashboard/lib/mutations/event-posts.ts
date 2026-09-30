import type { EventImageKind, PrismaClient } from "@lolpamin/db";

export const EVENT_TITLE_MAX = 100;
export const EVENT_BODY_MAX = 5000;
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_IMAGES_PER_KIND = 20;
export const ALLOWED_EVENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const EVENT_IMAGE_KINDS: EventImageKind[] = ["MAIN", "HIDDEN"];

export class EventPostValidationError extends Error {}

export interface EventPostInput {
  title: string;
  body: string;
}

export interface EventImageUpload {
  bytes: Buffer;
  type: string;
}

const POST_NOT_FOUND = "글을 찾을 수 없습니다.";

function cleanInput(input: EventPostInput): EventPostInput {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new EventPostValidationError("제목을 입력해 주세요.");
  if (title.length > EVENT_TITLE_MAX) {
    throw new EventPostValidationError(`제목은 ${EVENT_TITLE_MAX}자를 넘을 수 없습니다.`);
  }
  if (body.length > EVENT_BODY_MAX) {
    throw new EventPostValidationError(`본문은 ${EVENT_BODY_MAX}자를 넘을 수 없습니다.`);
  }
  return { title, body };
}

export async function createEventPost(
  prisma: PrismaClient,
  input: EventPostInput,
  adminId: string | null,
): Promise<{ id: string }> {
  const data = cleanInput(input);
  return prisma.eventPost.create({
    data: { ...data, createdById: adminId, updatedById: adminId },
    select: { id: true },
  });
}

export async function updateEventPost(
  prisma: PrismaClient,
  id: string,
  input: EventPostInput,
  adminId: string | null,
): Promise<void> {
  const data = cleanInput(input);
  const { count } = await prisma.eventPost.updateMany({ where: { id }, data: { ...data, updatedById: adminId } });
  if (count === 0) throw new EventPostValidationError(POST_NOT_FOUND);
}

// Images go with it (onDelete: Cascade). Deleting twice is harmless.
export async function deleteEventPost(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.eventPost.deleteMany({ where: { id } });
}

export async function setEventPostRevealed(
  prisma: PrismaClient,
  id: string,
  revealed: boolean,
  adminId: string | null,
): Promise<void> {
  const { count } = await prisma.eventPost.updateMany({
    where: { id },
    data: { revealedAt: revealed ? new Date() : null, updatedById: adminId },
  });
  if (count === 0) throw new EventPostValidationError(POST_NOT_FOUND);
}

export async function addEventImage(
  prisma: PrismaClient,
  postId: string,
  kind: EventImageKind,
  upload: EventImageUpload,
): Promise<{ id: string }> {
  // kind arrives from the browser; the type alone does not stop "BANNER".
  if (!EVENT_IMAGE_KINDS.includes(kind)) throw new EventPostValidationError("잘못된 사진 구역입니다.");
  if (!ALLOWED_EVENT_IMAGE_TYPES.includes(upload.type)) {
    throw new EventPostValidationError("지원하지 않는 이미지 형식입니다(png, jpg, webp, gif만 가능합니다).");
  }
  if (upload.bytes.byteLength > EVENT_IMAGE_MAX_BYTES) {
    throw new EventPostValidationError("이미지 용량은 5MB를 넘을 수 없습니다.");
  }

  return prisma.$transaction(async (tx) => {
    // Checked here rather than left to the FK so a post deleted in another tab
    // gives a readable message instead of a Postgres error.
    const post = await tx.eventPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new EventPostValidationError(POST_NOT_FOUND);

    const current = await tx.eventImage.aggregate({
      where: { postId, kind },
      _count: { _all: true },
      _max: { position: true },
    });
    if (current._count._all >= EVENT_IMAGES_PER_KIND) {
      throw new EventPostValidationError(`사진은 구역마다 ${EVENT_IMAGES_PER_KIND}장까지 올릴 수 있습니다.`);
    }

    return tx.eventImage.create({
      data: { postId, kind, position: (current._max.position ?? -1) + 1, bytes: upload.bytes, type: upload.type },
      select: { id: true },
    });
  });
}

// Returns the owning post id so the caller can revalidate its page; null if already gone.
// Removing the last hidden image also clears revealedAt: otherwise hidden images uploaded
// later for a second surprise would go public the moment they land, on a post whose
// reveal button is not even drawn (it needs at least one hidden image).
export async function deleteEventImage(prisma: PrismaClient, imageId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const image = await tx.eventImage.findUnique({ where: { id: imageId }, select: { postId: true, kind: true } });
    if (!image) return null;
    await tx.eventImage.deleteMany({ where: { id: imageId } });
    if (image.kind === "HIDDEN" && (await tx.eventImage.count({ where: { postId: image.postId, kind: "HIDDEN" } })) === 0) {
      await tx.eventPost.update({ where: { id: image.postId }, data: { revealedAt: null } });
    }
    return image.postId;
  });
}

// Swaps positions with the nearest image of the same post and kind; at either end
// there is no neighbour and nothing changes.
export async function moveEventImage(
  prisma: PrismaClient,
  imageId: string,
  direction: "up" | "down",
): Promise<string | null> {
  if (direction !== "up" && direction !== "down") throw new EventPostValidationError("잘못된 이동 방향입니다.");

  return prisma.$transaction(async (tx) => {
    const image = await tx.eventImage.findUnique({
      where: { id: imageId },
      select: { id: true, postId: true, kind: true, position: true },
    });
    if (!image) return null;

    const neighbour = await tx.eventImage.findFirst({
      where: {
        postId: image.postId,
        kind: image.kind,
        position: direction === "up" ? { lt: image.position } : { gt: image.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });
    if (neighbour) {
      await tx.eventImage.update({ where: { id: image.id }, data: { position: neighbour.position } });
      await tx.eventImage.update({ where: { id: neighbour.id }, data: { position: image.position } });
    }
    return image.postId;
  });
}
