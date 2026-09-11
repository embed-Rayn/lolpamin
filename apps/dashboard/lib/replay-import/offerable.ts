/**
 * 이 회원을 이 슬롯에 제안해도 되는가. 이미 다른 슬롯에 앉은 회원은 제안하지 않는다 —
 * 같은 회원이 두 슬롯에 들어가면 저장이 @@unique([gameResultId, memberId])에 막힌다.
 * 자기 슬롯이 이미 고른 회원은 다시 고를 수 있어야 하므로 예외로 둔다.
 */
export function isMemberOfferable(
  memberId: string,
  takenMemberIds: ReadonlySet<string>,
  currentMemberId: string | null,
): boolean {
  return !takenMemberIds.has(memberId) || memberId === currentMemberId;
}
