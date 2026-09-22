# 사이트 브랜딩 설정 (로고 · 홈 배너) 설계

- 작성일: 2026-09-22
- 관련 스펙: `docs/superpowers/specs/2026-09-20-site-navigation-and-member-info-design.md`(사이드바 구조),
  스킨 시스템은 `CLAUDE.md`의 `## Skins` 절 참고

## 배경 및 목적

좌상단 로고(아이콘+"롤파민"+부제)와 홈 화면 배너(`/banner.png`)가 전부 코드·저장소에
박혀 있다. 모임 운영진이 로고나 배너를 바꾸고 싶으면 코드를 고치고 다시 배포해야 한다.
`/admins`에서 관리자가 직접 바꿀 수 있게 한다 — 로고는 icon-icons.com 같은 사이트에서
SVG를 복사해 붙여넣는 방식, 홈 배너는 데스크톱·모바일 이미지를 따로(또는 하나만) 올리는
방식.

## 범위

**포함**

- `/admins`에 새 패널: 로고 SVG 붙여넣기(+사용법 안내 뱃지), 사이트 이름·부제 텍스트,
  데스크톱/모바일 홈 배너 업로드(각각 미리보기·리셋 버튼)
- 저장된 값을 사이드바(`AppShell`)·모바일 드로어(`MobileDrawer`)의 로고/이름/부제,
  홈 화면(`app/page.tsx`)의 배너 이미지에 반영
- 아무것도 저장하지 않았을 때의 동작: 로고는 지금의 게임패드 아이콘, 이름/부제는 지금의
  "롤파민"/"함께라서 더 즐거운 게임", 배너는 지금의 `/banner.png`, 모바일 배너는 데스크톱
  배너를 그대로 축소해서 보여줌(별도로 안 올려도 된다)

**제외**

- 페이지 `<title>` 메타데이터(브라우저 탭 제목)는 그대로 "롤파민 · 내부 운영 도구" 고정 —
  사이드바/드로어에 보이는 이름만 바꾼다
- 스킨(색 테마)별로 다른 로고/배너를 두는 기능은 없음 — 하나의 로고·배너가 세 스킨
  전부에 적용됨
- 이미지 리사이즈·크롭 UI는 없음 — 올린 원본 그대로 `w-full` CSS로만 맞춘다(지금 배너와
  동일한 방식)

## 결정 사항

| 질문 | 결정 | 이유 |
|---|---|---|
| 저장 위치 | Postgres(`SiteSetting` 테이블 확장) | 이 서버는 배포마다 git 트리로 파일을 통째로 덮어쓰고 도커 이미지를 새로 빌드한다(`CLAUDE.md` Deployment 절) — `public/`에 런타임으로 쓴 파일은 다음 배포에서 사라진다. DB만 배포와 무관하게 살아남는다. |
| 로고 교체 범위 | 아이콘만 교체 + 이름·부제는 별도 입력으로 편집 가능 | 사용자 확인. SVG는 아이콘 하나짜리 사이트(icon-icons.com)에서 오므로 텍스트·레이아웃까지 담긴 SVG를 기대하기 어렵다. |
| 모바일 배너 기본값 | 안 올리면 데스크톱 배너를 그대로 보여줌 | 사용자 확인. 지금 배너 하나가 이미 반응형으로 잘 보이고 있어서, 모바일 배너는 "다르게 보이고 싶을 때만" 쓰는 선택 사항이다. |
| SVG 검증 | 서버에서 차단목록 방식 새니타이즈 | 로고는 로그인 없이도 모든 방문자에게 렌더되는 저장형 콘텐츠다. 관리자 전용 입력이라도 `<script>`·이벤트 핸들러·`javascript:` URI를 그대로 저장·렌더하면 계정이 여러 개인 이 앱(운영진 여러 명)에서 저장형 XSS로 이어질 수 있다. |
| 배너 업로드 형식 | png/jpg/jpeg/webp/gif, 5MB 캡. svg는 받지 않음 | `<img>`로만 쓰이므로 래스터 형식이면 충분하고, svg를 이미지 업로드로도 받으면 새니타이즈 표면이 두 곳으로 늘어난다. |

## 설계

### 1. 데이터 모델

`packages/db/prisma/schema.prisma`의 `SiteSetting`(이미 `theme` 하나만 들고 있는
싱글턴, id 고정값)에 필드를 추가한다:

```prisma
model SiteSetting {
  id          String   @id
  theme       String   @default("clean")
  // 아래 6개가 이번에 추가되는 필드. 전부 nullable — null이면 기본값을 쓴다.
  logoSvg               String?
  siteName              String?
  siteTagline           String?
  homeBannerDesktop     Bytes?
  homeBannerDesktopType String?
  homeBannerMobile      Bytes?
  homeBannerMobileType  String?
  updatedAt   DateTime @updatedAt
  updatedById String?
}
```

`homeBanner*Type`은 업로드된 파일의 MIME(`image/png` 등) — 라우트 핸들러가 응답
`Content-Type`으로 그대로 돌려준다.

### 2. 조회 (`lib/queries/branding.ts`)

```ts
export interface Branding {
  logoSvg: string | null;
  siteName: string;       // 저장값 없으면 기본 "롤파민"
  siteTagline: string;    // 저장값 없으면 기본 "함께라서 더 즐거운 게임"
  hasDesktopBanner: boolean;
  hasMobileBanner: boolean;
}

export async function getBranding(prisma: PrismaClient): Promise<Branding>
```

`AppShell`이 페이지마다 이미 여러 쿼리를 `Promise.all`로 묶어 부르므로(총원수,
미활동 배지 등) 여기에 하나 더 얹는다. 배너의 실제 바이트는 여기서 가져오지 않는다 —
`Bytes` 컬럼은 무거울 수 있어서, 페이지 렌더 경로에는 "있다/없다"만 싣고 실제 픽셀은
아래 라우트 핸들러가 요청 시점에 따로 읽는다.

### 3. 저장 (`lib/mutations/set-branding.ts`)

```ts
export async function setBranding(
  prisma: PrismaClient,
  input: {
    logoSvg?: string | null;        // undefined = 이 필드는 안 건드림, null = 기본값으로 리셋
    siteName?: string | null;
    siteTagline?: string | null;
    homeBannerDesktop?: { bytes: Buffer; type: string } | null;
    homeBannerMobile?: { bytes: Buffer; type: string } | null;
  },
  adminId: string | null,
): Promise<void>
```

- `logoSvg`가 주어지면(빈 문자열이 아니면) `sanitizeSvg`(packages/core)를 통과시킨다.
  실패하면(허용되지 않는 루트 태그, 60KB 초과 등) `SetBrandingValidationError`를 던진다.
- `siteName`은 40자, `siteTagline`은 80자 캡. 넘으면 같은 에러 클래스.
- 배너는 5MB 캡 + `image/png|jpeg|jpg|webp|gif` 화이트리스트. `ThemePanel`이 쓰는
  `revalidatePath("/", "layout")` 패턴을 그대로 따른다(모든 페이지가 새 값으로 다시
  렌더돼야 한다).

### 4. SVG 새니타이즈 (`packages/core/src/svg-sanitize.ts`)

순수 함수, DB·DOM 의존성 없음(패키지 컨벤션대로):

```ts
export function sanitizeSvg(raw: string): string | null
```

- 앞뒤 공백을 자르고 `<svg` 로 시작해 `</svg>`로 끝나는지 확인 — 아니면 `null`.
- 60,000자 초과면 `null`.
- 정규식으로 제거: `<script ...>...</script>`, `on[a-z]+\s*=\s*"..."`(작은따옴표
  버전도), `<foreignObject ...>...</foreignObject>`, `<iframe...>`, `<embed...>`,
  `<object...>`.
- `href`/`xlink:href` 값이 `javascript:`로 시작하면 그 속성만 제거.
- 완전한 XML 파서가 아니라 알려진 SVG XSS 벡터를 겨냥한 차단목록이다 — 관리자 로그인
  뒤에 있는 입력이라는 전제하에 실용적으로 충분한 수준으로 잡는다(스펙 결정 사항 참고).

이 함수는 `packages/core`에 있으므로 순수 함수 유닛 테스트로 검증한다(각 벡터별 하나씩,
정상 SVG는 그대로 통과하는지도 하나).

### 5. 배너 서빙 (`app/api/branding/banner/desktop/route.ts`, `.../mobile/route.ts`)

```ts
export async function GET() {
  const row = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTING_ID },
    select: { homeBannerDesktop: true, homeBannerDesktopType: true },
  });
  if (!row?.homeBannerDesktop) {
    return NextResponse.redirect(new URL("/banner.png", ...), 302);
  }
  return new NextResponse(row.homeBannerDesktop, {
    headers: { "Content-Type": row.homeBannerDesktopType ?? "image/png" },
  });
}
```

`mobile` 라우트는 같은 모양이되, 비어 있으면 **`/banner.png`가 아니라 desktop 라우트로
302** 한다(`/api/branding/banner/desktop`) — desktop 쪽이 커스텀이든 기본값이든, 모바일은
그걸 그대로 따라간다. 이게 "모바일 배너 안 올리면 데스크톱을 축소해서 보여준다"를
코드 한 줄로 만든다.

### 6. 홈 화면 (`app/page.tsx`)

```tsx
<picture>
  <source media="(max-width: 767px)" srcSet="/api/branding/banner/mobile" />
  <img src="/api/branding/banner/desktop" alt={branding.siteName} className="w-full max-w-4xl rounded-xl border border-ink/[.06]" />
</picture>
```

`alt`는 저장된 사이트 이름을 쓴다(기본값이면 "롤파민"과 같다).

### 7. 로고·이름 렌더 (`components/BrandLogo.tsx`)

```tsx
export function BrandLogo({ logoSvg, size }: { logoSvg: string | null; size: number }) {
  if (!logoSvg) return <NavIcon name="gamepad" size={size} />;
  return (
    <span
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
```

`logoSvg`는 이미 저장 시점에 새니타이즈를 거친 값이라 여기서는 그대로 렌더한다(다시
새니타이즈하지 않는다 — 저장한 값을 신뢰하는 경계는 "쓸 때 한 번"으로 정한다).
`AppShell.tsx`·`MobileDrawer.tsx`가 각자 갖고 있던 `<NavIcon name="gamepad" .../>` 호출을
이걸로 바꾸고, 옆의 "롤파민"/"함께라서 더 즐거운 게임" 텍스트를 `branding.siteName`/
`branding.siteTagline`으로 바꾼다.

### 8. 관리자 패널 (`components/BrandingPanel.tsx`)

`ThemePanel`과 같은 자리, 같은 카드 스타일로 `/admins`에 추가한다. 구성:

- **로고**: `<textarea>`(SVG 붙여넣기) + 오른쪽에 ⓘ 버튼. 누르면 작은 안내 박스가 펼쳐짐:
  "1. icon-icons.com에서 아이콘을 고른다 → 2. '무료 다운로드' 옆 SVG 복사하기를 누른다
  → 3. 여기에 붙여넣는다" + `https://icon-icons.com/ko/ui-icons` 링크(새 탭). 저장된
  SVG가 있으면 위에 `<BrandLogo>`로 실시간 미리보기.
- **이름 / 부제**: `<input>` 두 개, placeholder로 기본값 표시.
- **배너**: 데스크톱/모바일 각각 `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif">`
  + 현재 이미지 썸네일 + "기본값으로" 버튼(그 배너만 `null`로 리셋).
- 전부 한 `<form action={setBrandingAction}>` 안에 있고, 저장 버튼 하나로 한 번에
  커밋한다 — `updateMmrConfigAction` 같은 기존 폼 액션 패턴을 따른다.

### 9. 서버 액션 (`app/admins/actions.ts`)

```ts
export async function setBrandingAction(formData: FormData): Promise<{ error: string | null }>
```

`requireAdmin()` 뒤 `formData`에서 텍스트 필드와 `File` 두 개를 꺼내 `setBranding`
호출. `File.arrayBuffer()`로 바이트를 읽어 `Buffer`로 변환. "기본값으로" 버튼은 숨겨진
`resetDesktopBanner`/`resetMobileBanner` 필드를 같이 보내는 방식으로 구현(체크박스
아니라 각자의 submit 버튼이 자기 name/value를 실어 보냄 — `<button name="reset" value="desktop">`).

## 데이터 흐름

1. 관리자가 `/admins`에서 SVG 붙여넣기/텍스트 수정/이미지 선택 → 저장 버튼.
2. `setBrandingAction` → `sanitizeSvg` 통과 → `setBranding`이 `SiteSetting` upsert →
   `revalidatePath("/", "layout")`.
3. 다음 요청부터 `AppShell`이 새 `branding` 값을 읽어 로고·이름·부제 렌더, `app/page.tsx`가
   새 배너 라우트를 가리킴(라우트 자체는 매 요청 DB를 읽으므로 그냥 새 값이 나온다).

## 오류 처리

- `sanitizeSvg`가 `null`을 반환하면 저장 자체를 막고 "올바른 SVG가 아니거나 허용되지
  않는 내용이 포함되어 있습니다" 안내.
- 이름/부제 길이 초과, 이미지 형식/용량 초과도 저장 전 검증, 한글 안내 문구는
  `CANCEL_GAME_RESULT_ERRORS` 같은 기존 패턴대로 상수 객체로 모아 서버 액션이 그 목록에
  있는 메시지만 그대로 보여준다(Prisma 원본 에러는 노출하지 않음).
- 배너 라우트 핸들러는 DB 조회 실패 시(연결 끊김 등) 500 대신 `/banner.png`로 302 —
  방문자 화면에서 배너 하나 깨지는 것보다 기본 이미지가 나오는 편이 낫다.

## 테스트

- **유닛**: `packages/core/src/svg-sanitize.test.ts` — 정상 SVG 통과, `<script>` 제거,
  `onload=` 제거, `javascript:` href 제거, `<foreignObject>`/`<iframe>` 제거, svg 아닌
  입력 거부, 60KB 초과 거부.
- **통합**: `apps/dashboard/lib/mutations/set-branding.test.ts` — 저장 후 `getBranding`이
  그 값을 돌려주는지, 텍스트/이미지 길이 초과 시 거부하는지, "기본값으로" 리셋이 해당
  필드만 null로 되돌리는지(다른 필드는 그대로인지), 유효하지 않은 SVG를 거부하는지.
- **회귀**: 기존 `getSiteTheme`/`setSiteTheme` 테스트는 그대로 통과해야 한다(같은 테이블을
  확장하는 것이지 갈아엎는 게 아니다).
- **시각 확인**(Playwright): 로고 SVG 저장 후 사이드바·드로어에 반영되는지, 배너 업로드
  후 홈 화면 desktop/mobile 폭에서 각각 반영되는지, 둘 다 "기본값으로"를 누르면 원래
  게임패드 아이콘·`/banner.png`로 돌아오는지.

## 건드리는 파일

| 구분 | 파일 |
|---|---|
| 스키마 | `packages/db/prisma/schema.prisma`, 새 마이그레이션 |
| 새니타이즈 | `packages/core/src/svg-sanitize.ts`(+테스트), `packages/core/src/index.ts` export 추가 |
| 쿼리/뮤테이션 | `apps/dashboard/lib/queries/branding.ts`, `apps/dashboard/lib/mutations/set-branding.ts`(+테스트) |
| 배너 서빙 | `apps/dashboard/app/api/branding/banner/desktop/route.ts`, `.../mobile/route.ts` |
| 컴포넌트 | `apps/dashboard/components/BrandLogo.tsx`, `apps/dashboard/components/BrandingPanel.tsx` |
| 반영 지점 | `apps/dashboard/components/AppShell.tsx`, `apps/dashboard/components/MobileDrawer.tsx`, `apps/dashboard/app/page.tsx` |
| 관리자 화면 | `apps/dashboard/app/admins/actions.ts`, `apps/dashboard/app/admins/page.tsx` |
| 문서 | `CLAUDE.md` — 브랜딩 저장 규칙 한 단락 |
