import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getMeetingNoteImage } from "@/lib/queries/meeting-notes";

export const dynamic = "force-dynamic";

// Meeting notes are admin-only to read. Never cached: the response is per-session.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // 404 rather than 403 to a visitor: a 403 would confirm the image exists.
  if (!(await getCurrentAdmin())) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const image = await getMeetingNoteImage(prisma, params.id);
  if (!image) return new NextResponse(null, { status: 404, headers: NO_STORE });

  // Buffer is a valid BodyInit at runtime; only this lib config's DOM types disagree.
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { ...NO_STORE, "Content-Type": image.type, "X-Content-Type-Options": "nosniff" },
  });
}
