import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import {
  addEventImage,
  createEventPost,
  deleteEventImage,
  deleteEventPost,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGES_PER_KIND,
  EventPostValidationError,
  moveEventImage,
  setEventPostRevealed,
  updateEventPost,
} from "./event-posts";

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

async function positions(postId: string, kind: "MAIN" | "HIDDEN") {
  const rows = await prisma.eventImage.findMany({
    where: { postId, kind },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

describe("createEventPost / updateEventPost", () => {
  it("trims and stores title and body", async () => {
    const { id } = await createEventPost(prisma, { title: "  9월 이벤트 ", body: " 본문\n둘째 줄 " }, null);
    const row = await prisma.eventPost.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe("9월 이벤트");
    expect(row.body).toBe("본문\n둘째 줄");
    expect(row.revealedAt).toBeNull();

    await updateEventPost(prisma, id, { title: "10월 이벤트", body: "" }, null);
    const updated = await prisma.eventPost.findUniqueOrThrow({ where: { id } });
    expect(updated.title).toBe("10월 이벤트");
    expect(updated.body).toBe("");
  });

  it("rejects a blank title, a too-long title and a too-long body", async () => {
    await expect(createEventPost(prisma, { title: "   ", body: "" }, null)).rejects.toThrow("제목을 입력해 주세요.");
    await expect(createEventPost(prisma, { title: "가".repeat(101), body: "" }, null)).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(createEventPost(prisma, { title: "제목", body: "가".repeat(5001) }, null)).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(createEventPost(prisma, { title: "가".repeat(100), body: "가".repeat(5000) }, null)).resolves.toBeDefined();
  });

  it("refuses to update a missing post", async () => {
    await expect(updateEventPost(prisma, "missing", { title: "제목", body: "" }, null)).rejects.toThrow(
      "글을 찾을 수 없습니다.",
    );
  });
});

describe("deleteEventPost", () => {
  it("removes the post with its images and is a no-op when already gone", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    await addEventImage(prisma, id, "MAIN", png);
    await addEventImage(prisma, id, "HIDDEN", png);

    await deleteEventPost(prisma, id);
    await deleteEventPost(prisma, id);

    expect(await prisma.eventPost.count()).toBe(0);
    expect(await prisma.eventImage.count()).toBe(0);
  });
});

describe("setEventPostRevealed", () => {
  it("reveals and hides again", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);

    await setEventPostRevealed(prisma, id, true, null);
    expect((await prisma.eventPost.findUniqueOrThrow({ where: { id } })).revealedAt).toBeInstanceOf(Date);

    await setEventPostRevealed(prisma, id, false, null);
    expect((await prisma.eventPost.findUniqueOrThrow({ where: { id } })).revealedAt).toBeNull();
  });

  it("refuses a missing post", async () => {
    await expect(setEventPostRevealed(prisma, "missing", true, null)).rejects.toThrow("글을 찾을 수 없습니다.");
  });
});

describe("addEventImage", () => {
  it("appends at the end of its own kind", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    const h = await addEventImage(prisma, id, "HIDDEN", png);

    expect(await positions(id, "MAIN")).toEqual([a.id, b.id]);
    expect(await positions(id, "HIDDEN")).toEqual([h.id]);
  });

  it("keeps appending after a deletion left a gap", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    await deleteEventImage(prisma, a.id);
    const c = await addEventImage(prisma, id, "MAIN", png);

    expect(await positions(id, "MAIN")).toEqual([b.id, c.id]);
  });

  it("rejects a disallowed type, an oversized file and an unknown kind", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    await expect(addEventImage(prisma, id, "MAIN", { bytes: png.bytes, type: "image/svg+xml" })).rejects.toThrow(
      EventPostValidationError,
    );
    await expect(
      addEventImage(prisma, id, "MAIN", { bytes: Buffer.alloc(EVENT_IMAGE_MAX_BYTES + 1), type: "image/png" }),
    ).rejects.toThrow(EventPostValidationError);
    // @ts-expect-error — the server action receives this from the browser unchecked
    await expect(addEventImage(prisma, id, "BANNER", png)).rejects.toThrow(EventPostValidationError);
  });

  it("caps each kind at the limit", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    for (let i = 0; i < EVENT_IMAGES_PER_KIND; i++) await addEventImage(prisma, id, "MAIN", png);

    await expect(addEventImage(prisma, id, "MAIN", png)).rejects.toThrow(EventPostValidationError);
    await expect(addEventImage(prisma, id, "HIDDEN", png)).resolves.toBeDefined();
  });

  it("gives a Korean error for a post deleted meanwhile", async () => {
    await expect(addEventImage(prisma, "missing", "MAIN", png)).rejects.toThrow("글을 찾을 수 없습니다.");
  });
});

describe("deleteEventImage", () => {
  it("returns the post id, then null once gone", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);

    expect(await deleteEventImage(prisma, a.id)).toBe(id);
    expect(await deleteEventImage(prisma, a.id)).toBeNull();
  });
});

describe("moveEventImage", () => {
  it("swaps with the neighbour of the same kind only", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const h = await addEventImage(prisma, id, "HIDDEN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);
    const c = await addEventImage(prisma, id, "MAIN", png);

    expect(await moveEventImage(prisma, c.id, "up")).toBe(id);
    expect(await positions(id, "MAIN")).toEqual([a.id, c.id, b.id]);

    await moveEventImage(prisma, a.id, "down");
    expect(await positions(id, "MAIN")).toEqual([c.id, a.id, b.id]);
    expect(await positions(id, "HIDDEN")).toEqual([h.id]);
  });

  it("does nothing at either end", async () => {
    const { id } = await createEventPost(prisma, { title: "제목", body: "" }, null);
    const a = await addEventImage(prisma, id, "MAIN", png);
    const b = await addEventImage(prisma, id, "MAIN", png);

    await moveEventImage(prisma, a.id, "up");
    await moveEventImage(prisma, b.id, "down");
    expect(await positions(id, "MAIN")).toEqual([a.id, b.id]);
  });

  it("returns null for a missing image and rejects an unknown direction", async () => {
    expect(await moveEventImage(prisma, "missing", "up")).toBeNull();
    // @ts-expect-error — the server action receives this from the browser unchecked
    await expect(moveEventImage(prisma, "missing", "left")).rejects.toThrow(EventPostValidationError);
  });
});
