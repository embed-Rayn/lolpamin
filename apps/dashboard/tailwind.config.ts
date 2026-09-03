import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
