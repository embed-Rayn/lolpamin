import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./svg-sanitize";

// icon-icons.com에서 실제로 "SVG 복사하기"로 받은 아이콘 — 정상 입력의 대표 사례.
const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><defs><style>.cls-1{fill:url(#linear-gradient);}</style><linearGradient id="linear-gradient" x1="68.51" y1="462.46" x2="443.44" y2="87.53" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ef486c"/><stop offset="1" stop-color="#f98f80"/></linearGradient></defs><g id="ESSENTIAL_UI" data-name="ESSENTIAL UI"><path class="cls-1" d="M378.26,249.34a28.09,28.09,0,0,1-27.33,28.81h-.78a28.08,28.08,0,0,1-.69-56.16h.72A28.09,28.09,0,0,1,378.26,249.34Z"/></g></svg>`;

describe("sanitizeSvg", () => {
  it("passes a normal icon-icons.com SVG through unchanged", () => {
    expect(sanitizeSvg(HEART_ICON)).toBe(HEART_ICON);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeSvg(`  \n${HEART_ICON}\n  `)).toBe(HEART_ICON);
  });

  it("strips a <script> element and its content", () => {
    const withScript = `<svg viewBox="0 0 10 10"><script>alert(1)</script><circle r="5"/></svg>`;
    const out = sanitizeSvg(withScript);
    expect(out).not.toBeNull();
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<circle");
  });

  it("strips onload= and other event handler attributes", () => {
    const withHandler = `<svg viewBox="0 0 10 10" onload="alert(1)"><circle r="5" onclick='steal()'/></svg>`;
    const out = sanitizeSvg(withHandler);
    expect(out).not.toBeNull();
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("steal()");
  });

  it("strips javascript: URIs from href and xlink:href", () => {
    const withJsUri = `<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><circle r="5"/></a><use xlink:href="javascript:alert(2)"/></svg>`;
    const out = sanitizeSvg(withJsUri);
    expect(out).not.toBeNull();
    expect(out).not.toContain("javascript:");
  });

  it("strips <foreignObject> and its content", () => {
    const withForeign = `<svg viewBox="0 0 10 10"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject><circle r="5"/></svg>`;
    const out = sanitizeSvg(withForeign);
    expect(out).not.toBeNull();
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<circle");
  });

  it("strips <iframe> elements", () => {
    const withIframe = `<svg viewBox="0 0 10 10"><iframe src="https://evil.example"></iframe><circle r="5"/></svg>`;
    const out = sanitizeSvg(withIframe);
    expect(out).not.toBeNull();
    expect(out).not.toContain("iframe");
    expect(out).toContain("<circle");
  });

  it("rejects input that isn't an <svg> root", () => {
    expect(sanitizeSvg("<div>not an icon</div>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("   ")).toBeNull();
    expect(sanitizeSvg("just text")).toBeNull();
  });

  it("rejects input over 60,000 characters", () => {
    const huge = `<svg viewBox="0 0 10 10">${"a".repeat(60_000)}</svg>`;
    expect(sanitizeSvg(huge)).toBeNull();
  });
});
