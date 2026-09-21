import type { Config } from "tailwindcss";

// Every colour is a CSS variable holding an RGB triplet ("68 114 196") so the
// opacity modifier keeps working: bg-accent/20 → rgb(var(--c-accent) / 0.2).
// The triplets per skin live in app/globals.css under [data-theme=…]; components
// only ever name the role, never a hex value.
function token(name: string): string {
  return `rgb(var(--c-${name}) / <alpha-value>)`;
}

const ROLES = [
  // surfaces, from the page floor up
  "page",
  "surface",
  "surface-2",
  "surface-3",
  "inset",
  "hover",
  "raised",
  "raised-hover",
  // text
  "fg",
  "fg-2",
  "muted",
  "faint",
  "ghost",
  "ghost-2",
  // "ink" is the colour lines and washes are drawn in: white on the dark skin,
  // near-black on the light ones. Always used with an opacity.
  "ink",
  // brand + semantic
  "accent",
  "accent-hover",
  "accent-soft",
  "accent-tint",
  "success",
  "success-soft",
  "danger",
  "danger-soft",
  "danger-tint",
  "gold",
  "gold-deep",
  "orange",
  "purple",
  "purple-tint",
  "discord",
] as const;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(ROLES.map((role) => [role, token(role)])),
      fontFamily: {
        // The CDN's variable build registers itself as 'Pretendard Variable'.
        // "Pretendard" alone matched no face and silently fell back.
        sans: ["'Pretendard Variable'", "Pretendard", "'Noto Sans KR'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
