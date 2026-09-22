import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { homeBannerMobile: true, homeBannerMobileType: true },
  });

  if (!row?.homeBannerMobile) {
    // 모바일 배너를 따로 안 올렸으면 데스크톱 라우트로 넘긴다 — 그쪽이 커스텀이든
    // 기본값이든, 모바일은 그걸 그대로 따라간다("축소해서 보여줌").
    return NextResponse.redirect(new URL("/api/branding/banner/desktop", request.url), 302);
  }

  // Buffer는 런타임에 실제로 유효한 BodyInit이다 — 이 lib 설정의 DOM 타입이 그걸
  // 구조적으로 인정하지 않을 뿐이라 타입만 다시 씌운다(복사 없음).
  return new NextResponse(row.homeBannerMobile as unknown as BodyInit, {
    headers: {
      "Content-Type": row.homeBannerMobileType ?? "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}
