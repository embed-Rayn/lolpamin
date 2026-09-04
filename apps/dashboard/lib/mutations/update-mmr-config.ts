import type { MmrConfig } from "@lolpamin/core";
import { validateMmrConfig } from "@lolpamin/core";
import type { PrismaClient } from "@lolpamin/db";
import { MMR_SETTING_ID } from "../queries/mmr-config";

/** 검증에서 막힌 경우. 메시지들은 그대로 화면에 보여줘도 되는 한글이다. */
export class MmrConfigValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "MmrConfigValidationError";
  }
}

export interface UpdateMmrConfigInput extends MmrConfig {
  // 마지막으로 바꾼 운영진. 스크립트로 넣는 경로가 생기면 null이 된다.
  updatedById?: string | null;
}

/**
 * MMR 계산 설정을 싱글턴 행에 덮어쓴다. 이미 기록된 GameParticipant의
 * mmrBefore/mmrAfter는 건드리지 않는다 — 그건 그 경기 시점의 사실이고, 새 설정은
 * 다음 경기부터 적용된다.
 */
export async function updateMmrConfig(prisma: PrismaClient, input: UpdateMmrConfigInput): Promise<MmrConfig> {
  const config: MmrConfig = { k: input.k, winPoint: input.winPoint, lossPoint: input.lossPoint };

  const errors = validateMmrConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const data = { ...config, updatedById: input.updatedById ?? null };
  await prisma.mmrSetting.upsert({
    where: { id: MMR_SETTING_ID },
    create: { id: MMR_SETTING_ID, ...data },
    update: data,
  });

  return config;
}
