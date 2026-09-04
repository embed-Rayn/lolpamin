import type { MmrConfig } from "@lolpamin/core";
import { DEFAULT_MMR_CONFIG } from "@lolpamin/core";
import type { Prisma, PrismaClient } from "@lolpamin/db";

// 설정 행은 하나뿐이고 id가 고정이다. 다른 id로 들어간 행은 설정이 아니므로 읽지 않는다.
export const MMR_SETTING_ID = "singleton";

// 저장 트랜잭션 안에서도 읽히므로 트랜잭션 클라이언트를 함께 받는다.
type MmrSettingReader = PrismaClient | Prisma.TransactionClient;

export interface StoredMmrConfig extends MmrConfig {
  updatedAt: Date | null;
  updatedById: string | null;
}

/**
 * 저장된 MMR 계산 설정. 아직 아무도 저장한 적이 없으면 코드 기본값을 돌려준다 —
 * 새 DB에서도 계산이 되어야 하므로 행이 없는 것은 오류가 아니다.
 */
export async function getMmrConfig(prisma: MmrSettingReader): Promise<MmrConfig> {
  const row = await prisma.mmrSetting.findUnique({ where: { id: MMR_SETTING_ID } });
  if (!row) return { ...DEFAULT_MMR_CONFIG };
  return { k: row.k, winPoint: row.winPoint, lossPoint: row.lossPoint };
}

/** 위와 같지만 "언제 누가 바꿨는지"까지 필요한 설정 화면용. */
export async function getStoredMmrConfig(prisma: MmrSettingReader): Promise<StoredMmrConfig> {
  const row = await prisma.mmrSetting.findUnique({ where: { id: MMR_SETTING_ID } });
  if (!row) return { ...DEFAULT_MMR_CONFIG, updatedAt: null, updatedById: null };
  return {
    k: row.k,
    winPoint: row.winPoint,
    lossPoint: row.lossPoint,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  };
}
