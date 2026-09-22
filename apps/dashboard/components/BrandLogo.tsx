import { NavIcon } from "./nav-icons";

// logoSvg는 저장 시점에 sanitizeSvg를 이미 통과한 값이다(lib/mutations/set-branding.ts)
// — 여기서 다시 새니타이즈하지 않는다. 색 있는 아이콘 타일(사이드바/드로어가 각자
// 그린다) 안에 들어갈 내용물만 이 컴포넌트가 고른다: 커스텀 SVG가 있으면 그것,
// 없으면 지금까지 쓰던 게임패드 아이콘.
export function BrandLogo({ logoSvg, size }: { logoSvg: string | null; size: number }) {
  if (!logoSvg) return <NavIcon name="gamepad" size={size} />;
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-block [&>svg]:h-full [&>svg]:w-full"
      // eslint-disable-next-line react/no-danger -- 저장 시점에 새니타이즈된 값만 여기 온다.
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
