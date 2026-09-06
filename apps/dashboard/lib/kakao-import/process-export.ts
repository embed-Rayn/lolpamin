import type { PrismaClient } from "@lolpamin/db";
import { kakaoMatchKey, normalizeKakaoNickname, realNameFromKakaoNickname } from "@lolpamin/core";
import { parseKakaoExport } from "./parse-export";

export interface ProcessKakaoExportResult {
  newMembers: number;
  activityUpdates: number;
  skippedAsAlreadyProcessed: number;
}

export async function processKakaoExport(
  prisma: PrismaClient,
  exportText: string
): Promise<ProcessKakaoExportResult> {
  const mentions = parseKakaoExport(exportText);

  const watermark = await prisma.mentionLog.aggregate({ _max: { mentionedAt: true } });
  const cutoff = watermark._max.mentionedAt;

  const toProcess = cutoff ? mentions.filter((m) => m.mentionedAt > cutoff) : mentions;
  const skippedAsAlreadyProcessed = mentions.length - toProcess.length;

  return prisma.$transaction(async (tx) => {
    let newMembers = 0;
    let activityUpdates = 0;

    // 닉네임 문자열이 아니라 매칭 키로 사람을 찾는다(kakaoMatchKey 참고). 같은 사람이
    // "늑 구#kr1 (5시)"와 "늑구#KR1"을 번갈아 써도, 롤 닉을 바꿔도 한 회원에 붙는다.
    //
    // 회원 수가 수십 명이라 전부 한 번에 읽어 키 → 회원 맵을 만든다. 멘션마다 조회하지
    // 않으므로 키 계산 규칙이 SQL로 표현될 필요가 없고, 저장해 둘 컬럼도 필요 없다.
    // 정렬은 예전 findFirst의 orderBy를 그대로 옮긴 것이다 — 같은 키에 여러 행이 걸릴 때
    // 묘비(mergedIntoId != null)가 먼저 와야 아래 "히트한 행에 로그를 단다"가 되돌리기
    // 가능한 쪽에 붙고, createdAt·id가 동률을 끊어 결과가 실행마다 달라지지 않는다.
    const known = await tx.member.findMany({
      where: { kakaoNickname: { not: null } },
      orderBy: [{ mergedIntoId: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, kakaoNickname: true, mergedIntoId: true },
    });

    const byMatchKey = new Map<string, { id: string; mergedIntoId: string | null }>();
    for (const member of known) {
      const key = kakaoMatchKey(member.kakaoNickname!);
      if (key.length === 0 || byMatchKey.has(key)) continue;
      byMatchKey.set(key, { id: member.id, mergedIntoId: member.mergedIntoId });
    }

    for (const mention of toProcess) {
      // 닉네임 뒤에 붙은 "(7시30분 도착)" 같은 메모를 떼고 매칭한다. 메모까지 포함해
      // 매칭하면 같은 사람이 여러 회원으로 갈라진다.
      const nickname = normalizeKakaoNickname(mention.mentionedNickname);
      if (nickname.length === 0) continue;

      const matchKey = kakaoMatchKey(nickname);
      const existing = byMatchKey.get(matchKey) ?? null;

      let memberId: string;
      if (existing) {
        // 묘비(과거 닉네임)에 히트했으면 활동은 생존자에게 올린다. 닉네임을 바꾼
        // 회원의 활동이 끊기지 않게 하는 지점이다. 멘션 로그는 히트한 행에 그대로
        // 달아, 나중에 연결을 끊으면 로그도 함께 돌아가게 한다.
        // realName은 건드리지 않는다 — 사람이 고쳐둔 값을 재업로드가 되돌리면 안 된다.
        const activeId = existing.mergedIntoId ?? existing.id;
        await tx.member.update({ where: { id: activeId }, data: { lastActiveAt: mention.mentionedAt } });
        memberId = existing.id;
        activityUpdates++;
      } else {
        const created = await tx.member.create({
          data: {
            kakaoNickname: nickname,
            realName: realNameFromKakaoNickname(nickname),
            lastActiveAt: mention.mentionedAt,
          },
        });
        memberId = created.id;
        newMembers++;
        // 같은 사람이 한 파일 안에서 여러 번 언급되면 두 번째부터는 방금 만든 행에 붙어야
        // 한다. 조회를 맵으로 바꾼 뒤로는 새로 만든 회원을 여기서 직접 넣어 줘야 한다.
        if (matchKey.length > 0) byMatchKey.set(matchKey, { id: created.id, mergedIntoId: null });
      }

      await tx.mentionLog.create({
        data: { memberId, mentionedAt: mention.mentionedAt, rawMessage: mention.rawMessage },
      });
    }

    return { newMembers, activityUpdates, skippedAsAlreadyProcessed };
  });
}
