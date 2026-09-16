// The value of an <input type="date">, checked before it reaches the DB. Local
// midnight because the KakaoTalk import stores local wall-clock times too, so
// the day count treats both the same way.
export function parseLastActiveInput(
  raw: string,
  now: Date,
): { date: Date; error: null } | { date: null; error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return { date: null, error: "날짜 형식이 아닙니다." };
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  // new Date rolls 2026-02-30 over to March 2nd instead of failing; compare
  // the parts back to catch that.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { date: null, error: "날짜 형식이 아닙니다." };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today.getTime()) return { date: null, error: "미래 날짜는 넣을 수 없습니다." };
  return { date, error: null };
}
