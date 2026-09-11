import { createHash } from "node:crypto";
import type { ReplayMetadata } from "@lolpamin/core";

/**
 * 같은 리플레이의 재업로드를 막는 내용 해시. 카톡 임포트는 워터마크로 멱등성을 얻지만
 * (max(MentionLog.mentionedAt)) 리플레이에는 시간 축이 없다 — 파일에 벽시계 시각이
 * 아예 없으므로 내용으로 잡는다.
 *
 * 파일 바이트 전체가 아니라 참가자 PUUID와 경기 길이만 쓴다. 파일명을 바꾸거나 클라이언트가
 * 리플레이를 다시 받아 저장해도 같은 값이 나와야 한다. PUUID를 정렬하는 것은 참가자 순서가
 * 보장되지 않기 때문이다.
 *
 * node:crypto를 쓰므로 packages/core에 둘 수 없다 — core는 클라이언트 번들에도 들어간다.
 */
export function computeReplayKey(meta: ReplayMetadata): string {
  const puuids = meta.players.map((p) => p.puuid).sort();
  return createHash("sha256").update(`${puuids.join(",")}|${meta.gameLengthMs}`).digest("hex");
}
