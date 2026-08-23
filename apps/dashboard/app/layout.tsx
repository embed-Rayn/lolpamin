import "./globals.css";

export const metadata = {
  title: "롤파민 · 내부 운영 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
