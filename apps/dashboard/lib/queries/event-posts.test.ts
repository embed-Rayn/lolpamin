import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import { addEventImage, createEventPost, deleteEventImage, setEventPostRevealed } from "../mutations/event-posts";
import { eventImageSrc, getEventImageForViewer, getEventPost, listEventPosts } from "./event-posts";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const png = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: "image/png" };

async function postWithImages() {
  const { id } = await createEventPost(prisma, { title: "9월 이벤트", body: "본문" }, null);
  const main = await addEventImage(prisma, id, "MAIN", png);
  const hidden = await addEventImage(prisma, id, "HIDDEN", png);
  return { id, main: main.id, hidden: hidden.id };
}

describe("getEventPost", () => {
  it("leaves unrevealed hidden images out for a visitor", async () => {
    const { id, main } = await postWithImages();
    const post = await getEventPost(prisma, id, false);

    expect(post?.revealed).toBe(false);
    expect(post?.hiddenImages).toEqual([]);
    expect(post?.mainImages).toEqual([{ id: main, src: eventImageSrc(main) }]);
  });

  it("includes unrevealed hidden images for an admin", async () => {
    const { id, hidden } = await postWithImages();
    const post = await getEventPost(prisma, id, true);
    expect(post?.hiddenImages.map((i) => i.id)).toEqual([hidden]);
  });

  it("includes hidden images for everyone once revealed", async () => {
    const { id, hidden } = await postWithImages();
    await setEventPostRevealed(prisma, id, true, null);
    const post = await getEventPost(prisma, id, false);
    expect(post?.revealed).toBe(true);
    expect(post?.hiddenImages.map((i) => i.id)).toEqual([hidden]);
  });

  it("returns null for a missing id", async () => {
    expect(await getEventPost(prisma, "missing", true)).toBeNull();
  });
});

describe("listEventPosts", () => {
  it("lists newest first with the visitor-view thumbnail", async () => {
    const first = await postWithImages();
    await new Promise((r) => setTimeout(r, 5));
    const second = await createEventPost(prisma, { title: "사진 없음", body: "" }, null);

    let list = await listEventPosts(prisma);
    expect(list.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(list[0].thumbnailSrc).toBeNull();
    expect(list[1].thumbnailSrc).toBe(eventImageSrc(first.main));

    await setEventPostRevealed(prisma, first.id, true, null);
    list = await listEventPosts(prisma);
    expect(list[1].thumbnailSrc).toBe(eventImageSrc(first.hidden));
  });

  it("falls back to the main image when every hidden image is deleted after reveal", async () => {
    const post = await postWithImages();
    await setEventPostRevealed(prisma, post.id, true, null);
    await deleteEventImage(prisma, post.hidden);

    const [card] = await listEventPosts(prisma);
    expect(card.thumbnailSrc).toBe(eventImageSrc(post.main));
  });
});

describe("getEventImageForViewer", () => {
  it("serves a main image to anyone", async () => {
    const { main } = await postWithImages();
    const image = await getEventImageForViewer(prisma, main, false);
    expect(image?.type).toBe("image/png");
    expect(image?.kind).toBe("MAIN");
    expect(Buffer.from(image!.bytes).equals(png.bytes)).toBe(true);
  });

  it("refuses an unrevealed hidden image to a visitor, before reveal and after hiding again", async () => {
    const { id, hidden } = await postWithImages();
    expect(await getEventImageForViewer(prisma, hidden, false)).toBeNull();
    expect(await getEventImageForViewer(prisma, hidden, true)).not.toBeNull();

    await setEventPostRevealed(prisma, id, true, null);
    expect(await getEventImageForViewer(prisma, hidden, false)).not.toBeNull();

    await setEventPostRevealed(prisma, id, false, null);
    expect(await getEventImageForViewer(prisma, hidden, false)).toBeNull();
  });

  it("returns null for a missing id", async () => {
    expect(await getEventImageForViewer(prisma, "missing", true)).toBeNull();
  });
});
