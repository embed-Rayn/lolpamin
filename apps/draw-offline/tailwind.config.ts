import type { Config } from "tailwindcss";
import dashboard from "../dashboard/tailwind.config";

// Same skin tokens as the dashboard; only the scanned files differ.
const config: Config = {
  ...dashboard,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../dashboard/components/draw/**/*.{ts,tsx}",
    "../dashboard/components/MultiNameSearch.tsx",
  ],
};

export default config;
