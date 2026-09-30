import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getEventImageForViewer } from "@/lib/queries/event-posts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  const image = await getEventImageForViewer(prisma, params.id, admin !== null);
  // 404 rather than 403: a 403 would tell a visitor that a hidden image exists.
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

  // A main image row never changes (replacing = new id), so its URL can be cached forever.
  // A hidden one can be hidden again after reveal, and an admin's preview must not land
  // in a shared cache, so it is never cached.
  const cacheControl = image.kind === "MAIN" ? "public, max-age=31536000, immutable" : "private, no-store";
  // Buffer is a valid BodyInit at runtime; only this lib config's DOM types disagree.
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.type, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
  });
}
