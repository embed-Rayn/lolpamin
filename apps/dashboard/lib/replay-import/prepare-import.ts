import type { PrismaClient } from "@lolpamin/db";
import { getDisplayName, isAutoAssignable, parseRoflMetadata, scoreRiotAccountMatch } from "@lolpamin/core";
import type { ReplayPlayer } from "@lolpamin/core";
import { computeReplayKey } from "./replay-key";

/** confirmed는 PUUID로 확정, auto는 점수로 자동 배정, outsider는 "회원 아님"으로 확정한 계정. */
export type SlotStatus = "confirmed" | "auto" | "unresolved" | "outsider";

export interface SlotCandidate {
  memberId: string;
  label: string;
  score: number;
  reasons: string[];
}

export interface ImportSlot {
  puuid: string;
  gameName: string;
  tagLine: string;
  team: "BLUE" | "RED";
  position: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  level: number;
  wasAfk: boolean;
  wasLeaver: boolean;
  status: SlotStatus;
  memberId: string | null;
  candidates: SlotCandidate[];
}

export interface MemberOption {
  id: string;
  label: string;
}

export interface PreparedReplayImport {
  replayKey: string;
  gameVersion: string;
  gameLengthMs: number;
  winner: "BLUE" | "RED";
  endedInSurrender: boolean;
  slots: ImportSlot[];
  /** 후보가 빗나갔을 때 관리자가 직접 고르는 전체 명단. */
  members: MemberOption[];
}

export const REPLAY_IMPORT_ERRORS = {
  alreadyImported: "이미 등록된 경기입니다.",
} as const;

/** 한 슬롯에 칩으로 띄울 후보 수. 그보다 많이 나와도 상위 몇 개만 낸다. */
const MAX_CANDIDATES = 5;

interface LabelSource {
  realName: string | null;
  discordHandle: string | null;
  kakaoNickname: string | null;
  age: number | null;
}

// 동명이인이 목록에서 구분되지 않으므로 출생연도를 붙인다. 카톡 match key가 이미
// 실명/출생연도이므로 일관된다.
function memberLabel(member: LabelSource): string {
  const name = getDisplayName(member);
  return member.age === null ? name : `${name} / ${member.age}`;
}

function baseSlot(player: ReplayPlayer) {
  return {
    puuid: player.puuid,
    gameName: player.gameName,
    tagLine: player.tagLine,
    team: player.team,
    position: player.position,
    champion: player.champion,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    cs: player.cs,
    level: player.level,
    wasAfk: player.wasAfk,
    wasLeaver: player.wasLeaver,
  };
}

/**
 * 업로드된 리플레이를 화면이 그릴 수 있는 슬롯 10개로 바꾼다. 아무것도 저장하지 않는다.
 *
 * 순서가 중요하다 — PUUID로 확정되는 슬롯을 먼저 채워 배정 집합을 만든 뒤 나머지를 채점한다.
 * 채점을 먼저 하면 이미 확정된 회원이 다른 슬롯의 1순위로 올라와 자동 배정을 훔쳐 간다.
 */
export async function prepareReplayImport(
  prisma: PrismaClient,
  bytes: Uint8Array
): Promise<PreparedReplayImport> {
  const meta = parseRoflMetadata(bytes);
  const replayKey = computeReplayKey(meta);

  const already = await prisma.gameResult.findUnique({ where: { replayKey } });
  if (already) throw new Error(REPLAY_IMPORT_ERRORS.alreadyImported);

  const [accounts, members] = await Promise.all([
    prisma.riotAccount.findMany({
      where: { puuid: { in: meta.players.map((p) => p.puuid) } },
      include: { member: { select: { id: true, mergedIntoId: true } } },
    }),
    prisma.member.findMany({
      where: { mergedIntoId: null },
      select: {
        id: true,
        realName: true,
        age: true,
        kakaoNickname: true,
        discordHandle: true,
        discordDisplayName: true,
        riotId: true,
        // absorbMember는 카톡 닉네임을 생존자에게 복사하지 않고 묘비에 남긴다(그래야
        // processKakaoExport가 묘비를 집어 멘션을 이어붙인다). 그래서 실제로 연결이 끝난
        // 회원은 대부분 자기 행의 kakaoNickname이 비어 있고, 묘비까지 봐야 카톡 힌트가
        // scoreRiotAccountMatch에 닿는다 — queries/members.ts의 displayKakaoNickname과 같은 규칙.
        absorbed: { select: { kakaoNickname: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ realName: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const byPuuid = new Map(accounts.map((a) => [a.puuid, a]));
  // 이미 이 경기의 다른 슬롯에 앉은 회원. 같은 사람이 두 슬롯에 앉으면 저장이
  // @@unique([gameResultId, memberId])에 막힌다.
  const taken = new Set<string>();

  const slots: ImportSlot[] = meta.players.map((player) => {
    const account = byPuuid.get(player.puuid);
    if (!account) {
      return { ...baseSlot(player), status: "unresolved" as SlotStatus, memberId: null, candidates: [] };
    }
    if (account.member === null) {
      // "회원 아님"으로 확정해 둔 외부인. 다음 업로드에서 다시 묻지 않는다.
      return { ...baseSlot(player), status: "outsider" as SlotStatus, memberId: null, candidates: [] };
    }
    // 묘비에 붙어 있으면 생존자로 올린다 — processKakaoExport와 같은 규칙이다.
    const memberId = account.member.mergedIntoId ?? account.member.id;
    taken.add(memberId);
    return { ...baseSlot(player), status: "confirmed" as SlotStatus, memberId, candidates: [] };
  });

  const pending = slots.filter((s) => s.status === "unresolved");
  const ranked = new Map<string, SlotCandidate[]>();
  for (const slot of pending) {
    ranked.set(
      slot.puuid,
      members
        .map((m) => {
          // 자기 행이 비어 있으면 가장 최근 묘비의 카톡 닉네임을 쓴다 — displayKakaoNickname과 같은 규칙.
          const kakaoNickname = m.kakaoNickname ?? m.absorbed.find((a) => a.kakaoNickname !== null)?.kakaoNickname ?? null;
          const { score, reasons } = scoreRiotAccountMatch(
            { gameName: slot.gameName, tagLine: slot.tagLine, position: slot.position },
            { ...m, kakaoNickname },
          );
          return { memberId: m.id, label: memberLabel(m), score, reasons };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)),
    );
  }

  // 확신이 큰 슬롯부터 가져간다. 두 슬롯이 같은 회원을 1순위로 들고 있을 때 점수가 높은
  // 쪽이 먼저 배정돼야 낮은 쪽이 엉뚱하게 자동 확정되지 않는다.
  //
  // 점수가 같으면 puuid로 순서를 고정한다. 그러지 않으면 정렬이 안정적이어도 동점 처리
  // 순서가 리플레이 파일 안의 참가자 나열 순서를 그대로 따르게 되어, 같은 파일을 다시
  // 올려도 결과가 달라질 여지를 남긴다.
  const byConfidence = [...pending].sort(
    (a, b) => (ranked.get(b.puuid)![0]?.score ?? 0) - (ranked.get(a.puuid)![0]?.score ?? 0) || a.puuid.localeCompare(b.puuid),
  );
  for (const slot of byConfidence) {
    const available = ranked.get(slot.puuid)!.filter((c) => !taken.has(c.memberId));
    const top = available[0];
    if (top && isAutoAssignable(top.score, available[1]?.score ?? 0)) {
      slot.status = "auto";
      slot.memberId = top.memberId;
      taken.add(top.memberId);
    }
  }

  // 후보 목록은 자동 배정이 전부 끝난 뒤에 굳힌다. 먼저 채점된 슬롯의 목록에 나중에
  // 배정된 회원이 남아 있으면 관리자가 고를 수 없는 칩을 보게 된다.
  for (const slot of slots) {
    if (slot.status !== "unresolved") continue;
    slot.candidates = ranked
      .get(slot.puuid)!
      .filter((c) => !taken.has(c.memberId))
      .slice(0, MAX_CANDIDATES);
  }

  return {
    replayKey,
    gameVersion: meta.gameVersion,
    gameLengthMs: meta.gameLengthMs,
    winner: meta.winner,
    endedInSurrender: meta.endedInSurrender,
    slots,
    members: members.map((m) => ({ id: m.id, label: memberLabel(m) })),
  };
}
