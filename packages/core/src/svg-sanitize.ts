const MAX_SVG_LENGTH = 60_000;

// 완전한 XML/DOM 파서가 아니라, 알려진 SVG XSS 벡터를 겨냥한 차단목록이다. 관리자
// 로그인 뒤의 입력이지만, 로고는 로그인 없이도 모든 방문자에게 렌더되는 저장형
// 콘텐츠라 그대로 믿지 않는다.
const WRAPPED_ELEMENTS = ["script", "foreignObject", "iframe", "object"] as const;

export function sanitizeSvg(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SVG_LENGTH) return null;
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return null;

  let out = trimmed;

  // 여는/닫는 태그 쌍과 그 안의 내용을 통째로 제거한다.
  for (const tag of WRAPPED_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  // 자기닫힘 형태(<iframe .../>, <embed .../>)와 닫는 태그가 따로 없는 <embed> 단독형.
  out = out.replace(/<(iframe|embed|object)\b[^>]*\/>/gi, "");
  out = out.replace(/<embed\b[^>]*>/gi, "");

  // 이벤트 핸들러 속성(onload=, onclick= 등). 큰따옴표·작은따옴표·따옴표 없는 값 순서.
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s"'>]+/gi, "");

  // href/xlink:href의 javascript: 스킴만 속성째로 제거한다(값 자체가 아니라 속성을
  // 통째로 없애야 남은 따옴표가 마크업을 깨지 않는다).
  out = out.replace(/\s(?:xlink:href|href)\s*=\s*"javascript:[^"]*"/gi, "");
  out = out.replace(/\s(?:xlink:href|href)\s*=\s*'javascript:[^']*'/gi, "");

  return out;
}
