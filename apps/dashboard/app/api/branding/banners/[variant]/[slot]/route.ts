import { NextResponse } from "next/server";
import type { BannerVariant } from "@lolpamin/db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VARIANTS: Record<string, BannerVariant> = { desktop: "DESKTOP", mobile: "MOBILE" };

export async function GET(_request: Request, { params }: { params: { variant: string; slot: string } }) {
  const variant = VARIANTS[params.variant];
  const slot = Number(params.slot);
  if (!variant || !Number.isInteger(slot)) return new NextResponse(null, { status: 404 });

  const row = await prisma.homeBanner.findUnique({
    where: { variant_slot: { variant, slot } },
    select: { bytes: true, type: true },
  });
  // 빈 슬롯은 대체 이미지로 넘기지 않는다 — 대체 규칙은 홈 화면(resolveHomeBannerSources)이 정한다.
  if (!row) return new NextResponse(null, { status: 404 });

  // Buffer는 런타임에 실제로 유효한 BodyInit이다 — 이 lib 설정의 DOM 타입이 그걸
  // 구조적으로 인정하지 않을 뿐이라 타입만 다시 씌운다(복사 없음).
  // 화면은 항상 ?v=updatedAt을 붙여 부르므로 같은 URL의 내용은 바뀌지 않는다.
  return new NextResponse(row.bytes as unknown as BodyInit, {
    headers: { "Content-Type": row.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
