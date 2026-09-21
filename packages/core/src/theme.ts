/**
 * Site skins. "clean" is the light blue reference design and the default;
 * "pink" is the pastel variant; "dark" is the original operator palette.
 * The id is what goes into <html data-theme> and into SiteSetting.theme, so
 * it must stay a plain lowercase word.
 */
export const THEMES = ["clean", "pink", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "clean";

export const THEME_LABELS: Record<Theme, { name: string; description: string }> = {
  clean: { name: "클린", description: "흰 바탕에 파란 포인트. 기본 스킨." },
  pink: { name: "핑크", description: "분홍 파스텔 바탕. 배너와 같은 분위기." },
  dark: { name: "다크", description: "어두운 남색 바탕의 운영 도구 스킨." },
};

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}
