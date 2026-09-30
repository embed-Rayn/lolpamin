import { canViewEventImage, pickEventThumbnailId } from "@lolpamin/core";
import type { EventImageKind, PrismaClient } from "@lolpamin/db";

export function eventImageSrc(id: string): string {
  return `/api/events/images/${id}`;
}

export interface EventPostCard {
  id: string;
  title: string;
  createdAt: Date;
  thumbnailSrc: string | null;
}

export interface EventImageRef {
  id: string;
  src: string;
}

export interface EventPostDetail {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  revealed: boolean;
  hiddenImages: EventImageRef[];
  mainImages: EventImageRef[];
}

// Never `bytes` — a list of posters would drag every image through the query.
const IMAGE_REFS = {
  select: { id: true, kind: true, position: true },
  orderBy: { position: "asc" as const },
};

export async function listEventPosts(prisma: PrismaClient): Promise<EventPostCard[]> {
  const posts = await prisma.eventPost.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, createdAt: true, revealedAt: true, images: IMAGE_REFS },
  });
  return posts.map((post) => {
    const thumbnailId = pickEventThumbnailId(post.images, post.revealedAt !== null);
    return {
      id: post.id,
      title: post.title,
      createdAt: post.createdAt,
      thumbnailSrc: thumbnailId ? eventImageSrc(thumbnailId) : null,
    };
  });
}

// For a visitor an unrevealed hidden image is dropped here, so its id never reaches the HTML.
export async function getEventPost(
  prisma: PrismaClient,
  id: string,
  isAdmin: boolean,
): Promise<EventPostDetail | null> {
  const post = await prisma.eventPost.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, createdAt: true, revealedAt: true, images: IMAGE_REFS },
  });
  if (!post) return null;

  const visible = post.images.filter((image) =>
    canViewEventImage({ kind: image.kind, revealedAt: post.revealedAt }, isAdmin),
  );
  const refs = (kind: EventImageKind) =>
    visible.filter((image) => image.kind === kind).map((image) => ({ id: image.id, src: eventImageSrc(image.id) }));

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    revealed: post.revealedAt !== null,
    hiddenImages: refs("HIDDEN"),
    mainImages: refs("MAIN"),
  };
}

// null covers both "no such image" and "not yours to see" — the route answers 404
// either way so a visitor cannot learn that a hidden image exists.
export async function getEventImageForViewer(
  prisma: PrismaClient,
  id: string,
  isAdmin: boolean,
): Promise<{ bytes: Buffer; type: string; kind: EventImageKind } | null> {
  const image = await prisma.eventImage.findUnique({
    where: { id },
    select: { bytes: true, type: true, kind: true, post: { select: { revealedAt: true } } },
  });
  if (!image || !canViewEventImage({ kind: image.kind, revealedAt: image.post.revealedAt }, isAdmin)) return null;
  return { bytes: image.bytes, type: image.type, kind: image.kind };
}
