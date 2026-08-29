"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { processKakaoExport, type ProcessKakaoExportResult } from "@/lib/kakao-import/process-export";

export async function importKakaoExportAction(exportText: string): Promise<ProcessKakaoExportResult> {
  const result = await processKakaoExport(prisma, exportText);
  revalidatePath("/kakao-import");
  revalidatePath("/members");
  revalidatePath("/inactive");
  return result;
}
