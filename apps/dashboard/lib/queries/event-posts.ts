import { canViewEventImage, isEventRevealed, pickEventThumbnailId } from "@lolpamin/core";
import type { EventImageKind, PrismaClient } from "@lolpamin/db";

export const EVENT_REVEAL_LABEL_DEFAULT = "추후 공개까지";

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
  // The stored reveal time whatever the state (edit form default, admin badge).
  revealedAt: Date | null;
  revealLabel: string | null;
  // Set while a reveal is scheduled and there is something to reveal — shown to everyone.
  countdown: { at: Date; label: string } | null;
  thumbnailImageId: string | null;
  hiddenImages: EventImageRef[];
  mainImages: EventImageRef[];
}

// Never `bytes` — a list of posters would drag every image through the query.
const IMAGE_REFS = {
  select: { id: true, kind: true, position: true },
  orderBy: { position: "asc" as const },
};

// `now` is a parameter so tests can stand on either side of a scheduled reveal.
export async function listEventPosts(prisma: PrismaClient, now: Date = new Date()): Promise<EventPostCard[]> {
  const posts = await prisma.eventPost.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, createdAt: true, revealedAt: true, thumbnailImageId: true, images: IMAGE_REFS },
  });
  return posts.map((post) => {
    const thumbnailId = pickEventThumbnailId(
      post.images,
      isEventRevealed(post.revealedAt, now),
      post.thumbnailImageId,
    );
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
  now: Date = new Date(),
): Promise<EventPostDetail | null> {
  const post = await prisma.eventPost.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      revealedAt: true,
      revealLabel: true,
      thumbnailImageId: true,
      images: IMAGE_REFS,
    },
  });
  if (!post) return null;

  const revealed = isEventRevealed(post.revealedAt, now);
  const hasHidden = post.images.some((image) => image.kind === "HIDDEN");
  const visible = post.images.filter((image) =>
    canViewEventImage({ kind: image.kind, revealedAt: post.revealedAt }, isAdmin, now),
  );
  const refs = (kind: EventImageKind) =>
    visible.filter((image) => image.kind === kind).map((image) => ({ id: image.id, src: eventImageSrc(image.id) }));

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    revealed,
    revealedAt: post.revealedAt,
    revealLabel: post.revealLabel,
    // Deliberately public: a scheduled surprise is announced with its timer, and the
    // images themselves still stay out of reach until the time.
    countdown:
      post.revealedAt && !revealed && hasHidden
        ? { at: post.revealedAt, label: post.revealLabel ?? EVENT_REVEAL_LABEL_DEFAULT }
        : null,
    thumbnailImageId: post.thumbnailImageId,
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
  now: Date = new Date(),
): Promise<{ bytes: Buffer; type: string; kind: EventImageKind } | null> {
  const image = await prisma.eventImage.findUnique({
    where: { id },
    select: { bytes: true, type: true, kind: true, post: { select: { revealedAt: true } } },
  });
  if (!image || !canViewEventImage({ kind: image.kind, revealedAt: image.post.revealedAt }, isAdmin, now)) return null;
  return { bytes: image.bytes, type: image.type, kind: image.kind };
}
