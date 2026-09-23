"use server";

import { revalidatePath } from "next/cache";
import type { GameMode } from "@lolpamin/db";
import { ROFL_PARSE_ERRORS, type ReplayPlayer } from "@lolpamin/core";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  prepareReplayImport,
  REPLAY_IMPORT_ERRORS,
  type PreparedReplayImport,
} from "@/lib/replay-import/prepare-import";
import {
  saveReplayImport,
  SAVE_REPLAY_IMPORT_ERRORS,
  type ReplayAssignment,
} from "@/lib/mutations/save-replay-import";

// 프로덕션 빌드는 서버 액션이 던진 메시지를 Next의 영어 일반 문구로 바꿔 버린다 — 그래서
// 던지지 않고 돌려준다. 일부러 던진 한글 안내만 그대로 보여주고, 나머지(Prisma 예외 등)는 대체 문구로.
function messageFor(error: unknown, expected: readonly string[], fallback: string): string {
  return error instanceof Error && expected.includes(error.message) ? error.message : fallback;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// 파일은 FormData로 받는다. 13.8MB짜리 바이트 배열을 서버 액션 인자로 직렬화하는 것보다
// 싸고, next.config.js의 bodySizeLimit("20mb")이 이미 이 크기를 받도록 잡혀 있다.
export async function prepareReplayImportAction(formData: FormData): Promise<ActionResult<PreparedReplayImport>> {
  await requireAdmin();
  const file = formData.get("replay");
  if (!(file instanceof File)) {
    return { ok: false, error: "리플레이 파일이 없습니다." };
  }
  try {
    return { ok: true, data: await prepareReplayImport(prisma, new Uint8Array(await file.arrayBuffer())) };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: messageFor(
        error,
        [...Object.values(ROFL_PARSE_ERRORS), ...Object.values(REPLAY_IMPORT_ERRORS)],
        "리플레이를 읽는 중 오류가 발생했습니다.",
      ),
    };
  }
}

export interface SaveReplayImportActionInput {
  replayKey: string;
  /** 미리보기가 받은 경기 정보를 그대로 돌려보낸다. 서버가 replayKey로 대조한다. */
  replay: { gameLengthMs: number; players: ReplayPlayer[] };
  /** "2026-09-05" 형식. Date를 그대로 넘기지 않고 화면이 고른 날짜 문자열을 받는다. */
  playedAt: string;
  winner: "BLUE" | "RED";
  assignments: ReplayAssignment[];
  mode?: GameMode;
}

export async function saveReplayImportAction(
  input: SaveReplayImportActionInput,
): Promise<ActionResult<Awaited<ReturnType<typeof saveReplayImport>>>> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof saveReplayImport>>;
  try {
    // createdById는 세션에서만 온다. 클라이언트가 보낸 값을 쓰면 아무나 남의 이름으로
    // 입력 기록을 남길 수 있다 — 경기 결과를 직접 입력할 때와 같은 규칙이다.
    result = await saveReplayImport(prisma, {
      ...input,
      playedAt: new Date(input.playedAt),
      createdById: admin.id,
    });
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: messageFor(error, Object.values(SAVE_REPLAY_IMPORT_ERRORS), "저장 중 오류가 발생했습니다."),
    };
  }
  revalidatePath("/replay-import");
  revalidatePath("/match-history");
  revalidatePath("/matches");
  revalidatePath("/rift");
  revalidatePath("/inactive");
  return { ok: true, data: result };
}
