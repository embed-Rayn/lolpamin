"use client";

import { useState } from "react";
import { tierScore } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { MemberTierCell } from "@/components/MemberTierCell";
import { MemberRiotIdCell } from "@/components/MemberRiotIdCell";

const POSITIONS = ["TOP", "JG", "MID", "AD", "SUP"] as const;
type Position = (typeof POSITIONS)[number];

// 「블루」와 「레드」는 경기 결과 입력·경기 기록이 이미 쓰는 이름이다.
const SIDES = ["blue", "red"] as const;
type Side = (typeof SIDES)[number];

type Slots = Record<Side, Record<Position, string | null>>;

function emptySlots(): Slots {
  return {
    blue: { TOP: null, JG: null, MID: null, AD: null, SUP: null },
    red: { TOP: null, JG: null, MID: null, AD: null, SUP: null },
  };
}

export function TeamBuilder({ pool, isAdmin }: { pool: LinkedMemberOption[]; isAdmin: boolean }) {
  // 팀 구성은 저장하지 않는다. 화면 하나를 띄워놓고 다 같이 보는 용도라 저장할 이유가
  // 없고, 저장하면 「어제 짠 팀」이 남아 다음 판에 헷갈린다 — 뽑기 게임과 같은 방침이다.
  const [slots, setSlots] = useState<Slots>(emptySlots);

  const byId = new Map(pool.map((p) => [p.id, p]));
  const seated = new Set(
    SIDES.flatMap((side) => POSITIONS.map((position) => slots[side][position])).filter(
      (id): id is string => id !== null,
    ),
  );

  function seat(side: Side, position: Position, memberId: string | null) {
    setSlots({ ...slots, [side]: { ...slots[side], [position]: memberId } });
  }

  function total(side: Side): number {
    return POSITIONS.reduce((sum, position) => {
      const id = slots[side][position];
      const member = id === null ? null : byId.get(id);
      return sum + (member ? tierScore(member.tier) : 0);
    }, 0);
  }

  const blueTotal = total("blue");
  const redTotal = total("red");

  // 한 사람이 두 자리에 앉는 것은 언제나 실수다. 자기 칸에서는 계속 보여야 선택을 바꿀 수 있다.
  function candidates(currentId: string | null): LinkedMemberOption[] {
    return pool.filter((p) => !seated.has(p.id) || p.id === currentId);
  }

  // 컴포넌트가 아니라 평범한 함수다. <Slot />로 만들면 렌더마다 새 컴포넌트 타입이
  // 되어 React가 하위를 통째로 다시 마운트하고, 그러면 Riot ID를 타이핑하던 input이
  // 매 렌더마다 사라진다.
  function slotCells(side: Side, position: Position) {
    const id = slots[side][position];
    const member = id === null ? null : byId.get(id) ?? null;
    const score = member === null ? null : tierScore(member.tier);

    return (
      <>
        {/* 점수. 0(아이언·언랭)은 빈칸이다 — 0을 찍으면 "0점짜리 실력"으로 읽히지만
            실제 의미는 "점수를 매기지 않는 구간"이다. */}
        <div className="text-right font-mono text-[15.5px] font-bold text-[#E6EAF2]">
          {score === null || score === 0 ? "" : score}
        </div>

        <div className="min-w-0">
          {member === null ? (
            <div className="text-[13.5px] text-[#5C6577]">—</div>
          ) : (
            <MemberTierCell memberId={member.id} tier={member.tier} isAdmin={isAdmin} />
          )}
        </div>

        {/* 위는 회원을 고르는 드롭다운, 아래는 그 회원의 Riot ID(운영진이면 편집 가능).
            한 칸에 「고르기」와 「고치기」를 동시에 넣을 수 없어 두 줄로 나눴다. */}
        <div className="flex min-w-0 flex-col gap-1">
          <select
            value={id ?? ""}
            onChange={(e) => seat(side, position, e.target.value === "" ? null : e.target.value)}
            className="w-full min-w-0 cursor-pointer rounded-md border border-white/[.09] bg-[#0F131B] px-1.5 py-1 text-[13.5px] text-[#E6EAF2] outline-none focus:border-[#4472C4]"
          >
            <option value="">— 비어 있음 —</option>
            {candidates(id).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {member !== null && (
            <MemberRiotIdCell memberId={member.id} riotId={member.riotId} isAdmin={isAdmin} />
          )}
        </div>
      </>
    );
  }

  const GRID = "grid grid-cols-[56px_112px_1fr_64px_1fr_112px_56px] items-start gap-3";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <h2 className="m-0 text-[14px] font-bold">팀 배치</h2>
          <span className="text-[12px] text-[#6E7889]">
            매핑 완료 회원만 · 짠 팀은 저장되지 않습니다
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSlots(emptySlots())}
          className="rounded-lg bg-[#20293A] px-3 py-1.5 text-[13px] font-bold text-[#C7D0DF] transition-colors hover:bg-[#27324A]"
        >
          전부 비우기
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[.06] bg-[#151A24] p-5">
        <div className="min-w-[860px]">
          <div className={`${GRID} border-b border-white/[.06] pb-2 text-[12.5px] font-bold tracking-wide text-[#6E7889]`}>
            <div className="text-right">점수</div>
            <div>티어</div>
            <div>블루</div>
            <div className="text-center">포지션</div>
            <div>레드</div>
            <div>티어</div>
            <div className="text-right">점수</div>
          </div>

          {POSITIONS.map((position) => (
            <div key={position} className={`${GRID} border-b border-white/[.04] py-3`}>
              {slotCells("blue", position)}
              <div className="pt-1.5 text-center font-mono text-[13px] font-bold text-[#8A94A6]">
                {position}
              </div>
              {slotCells("red", position)}
            </div>
          ))}

          <div className={`${GRID} pt-3 text-[15.5px] font-bold`}>
            <div className="text-right font-mono text-[#8FB4F5]">{blueTotal}</div>
            <div />
            <div />
            <div className="text-center text-[13px] text-[#8A94A6]">합</div>
            <div />
            <div />
            <div className="text-right font-mono text-[#EE8B8B]">{redTotal}</div>
          </div>

          <div className="pt-2 text-center text-[12.5px] text-[#6E7889]">
            차이 <span className="font-mono font-bold text-[#E6EAF2]">{Math.abs(blueTotal - redTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
