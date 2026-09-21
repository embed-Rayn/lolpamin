"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/current-admin";
import { processKakaoExport, type ProcessKakaoExportResult } from "@/lib/kakao-import/process-export";

export async function importKakaoExportAction(exportText: string): Promise<ProcessKakaoExportResult> {
  await requireAdmin();
  const result = await processKakaoExport(prisma, exportText);
  revalidatePath("/kakao-import");
  revalidatePath("/rift");
  revalidatePath("/inactive");
  return result;
}
