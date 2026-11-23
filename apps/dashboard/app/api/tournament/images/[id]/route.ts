import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { prisma } from "@/lib/prisma";
import { getTournamentImageForViewer } from "@/lib/tournament/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  const image = await getTournamentImageForViewer(prisma, params.id, admin !== null);
  // A visitor gets 404 while the page is off, so nothing is cached: an immutable response
  // would keep showing the image to anyone who saw it before the switch-off.
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  // Buffer is a valid BodyInit at runtime; only this lib config's DOM types disagree.
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
