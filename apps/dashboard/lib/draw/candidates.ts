import type { DrawCandidate } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";

export const MAX_NUMBER_CANDIDATES = 1000;

export function toMemberCandidates(
  members: LinkedMemberOption[],
  selectedIds: ReadonlySet<string>
): DrawCandidate[] {
  return members.filter((m) => selectedIds.has(m.id)).map((m) => ({ id: m.id, label: m.name }));
}

export function toNumberCandidates(min: number, max: number): DrawCandidate[] {
  if (validateNumberRange(min, max) !== null) return [];
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    id: `n-${min + i}`,
    label: String(min + i),
  }));
}

export function validateNumberRange(min: number, max: number): string | null {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return "정수만 입력할 수 있습니다.";
  if (min > max) return "시작 숫자가 끝 숫자보다 큽니다.";
  if (max - min + 1 > MAX_NUMBER_CANDIDATES) {
    return `숫자는 최대 ${MAX_NUMBER_CANDIDATES}개까지 뽑을 수 있습니다.`;
  }
  return null;
}

export function normalizeManualName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function nextManualId(existing: DrawCandidate[]): string {
  const used = existing
    .map((c) => /^manual-(\d+)$/.exec(c.id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  return `manual-${used.length === 0 ? 1 : Math.max(...used) + 1}`;
}
