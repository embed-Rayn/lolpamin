"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { prepareReplayImport, type PreparedReplayImport } from "@/lib/replay-import/prepare-import";
import { saveReplayImport, type ReplayAssignment } from "@/lib/mutations/save-replay-import";

// 파일은 FormData로 받는다. 13.8MB짜리 바이트 배열을 서버 액션 인자로 직렬화하는 것보다
// 싸고, next.config.js의 bodySizeLimit("20mb")이 이미 이 크기를 받도록 잡혀 있다.
export async function prepareReplayImportAction(formData: FormData): Promise<PreparedReplayImport> {
  await requireAdmin();
  const file = formData.get("replay");
  if (!(file instanceof File)) {
    throw new Error("리플레이 파일이 없습니다.");
  }
  return prepareReplayImport(prisma, new Uint8Array(await file.arrayBuffer()));
}

export interface SaveReplayImportActionInput {
  replayKey: string;
  /** "2026-09-05" 형식. Date를 그대로 넘기지 않고 화면이 고른 날짜 문자열을 받는다. */
  playedAt: string;
  winner: "BLUE" | "RED";
  assignments: ReplayAssignment[];
}

export async function saveReplayImportAction(input: SaveReplayImportActionInput) {
  const admin = await requireAdmin();
  // createdById는 세션에서만 온다. 클라이언트가 보낸 값을 쓰면 아무나 남의 이름으로
  // 입력 기록을 남길 수 있다 — saveGameResultAction과 같은 규칙이다.
  const result = await saveReplayImport(prisma, {
    ...input,
    playedAt: new Date(input.playedAt),
    createdById: admin.id,
  });
  revalidatePath("/replay-import");
  revalidatePath("/match-history");
  revalidatePath("/matches");
  revalidatePath("/members");
  revalidatePath("/inactive");
  return result;
}
