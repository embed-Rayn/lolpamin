import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";

// 매 요청 DB를 읽는다 — 관리자가 방금 바꾼 배너가 다음 요청에 바로 나와야 한다.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { homeBannerDesktop: true, homeBannerDesktopType: true },
  });

  if (!row?.homeBannerDesktop) {
    // 커스텀 배너가 없으면 저장소에 커밋된 기본 이미지로 넘긴다.
    return NextResponse.redirect(new URL("/banner.png", request.url), 302);
  }

  // Buffer는 런타임에 실제로 유효한 BodyInit이다 — 이 lib 설정의 DOM 타입이 그걸
  // 구조적으로 인정하지 않을 뿐이라 타입만 다시 씌운다(복사 없음).
  return new NextResponse(row.homeBannerDesktop as unknown as BodyInit, {
    headers: {
      "Content-Type": row.homeBannerDesktopType ?? "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}
