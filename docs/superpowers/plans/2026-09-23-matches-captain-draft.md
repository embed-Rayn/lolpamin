# 팀 드래프트(`/matches`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/matches`를 결과 입력 화면에서 팀장 스네이크 드래프트 화면으로 바꾸고, 후보마다 Riot Champion-Mastery 기반 숙련 챔피언 3개를 보여준다.

**Architecture:** 드래프트 규칙은 `packages/core/src/draft.ts`의 순수 reducer, 숙련도 합산은 `packages/core/src/mastery.ts`. 숙련도는 계정 단위로 `ChampionMastery` 테이블에 캐시하고 하루 한 번 관리자 버튼으로 갱신한다. 화면은 클라이언트 컴포넌트 `DraftBoard`가 참여자·게스트·드래프트 상태를 들고 `sessionStorage`에 보존하며, 네이티브 HTML5 DnD로 옮긴다.

**Tech Stack:** Next.js 14 App Router, React 18, Prisma 5 / Postgres 16, vitest 2, Tailwind 3 (semantic color tokens).

**Spec:** `docs/superpowers/specs/2026-09-23-matches-captain-draft-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·식별자·주석·커밋 메시지는 영어(기존 파일이 한국어 주석이면 그 파일 관례를 따른다).
- 컴포넌트 색은 hex 금지. `bg-accent/10`(블루), `bg-danger/10`(레드) 같은 토큰만. 인라인은 `rgb(var(--c-…))`.
- `packages/core`는 I/O 없음, `@lolpamin/db`에서는 `import type`만.
- DB 로직은 `lib/{queries,mutations}/`에 두고 `prisma`를 첫 인자로 받는다. 여러 행 쓰기는 `$transaction`.
- DB 테스트 파일은 `DATABASE_URL_TEST` 가드로 시작하고 `beforeEach`에서 `resetDatabase()`.
- 새 의존성 추가 금지(드래그는 네이티브 HTML5 DnD).
- 드래프트 상태는 DB에 쓰지 않는다. `sessionStorage` 키 `lolpamin.draft.v1`.
- 스네이크 순서 `B R R B B R R B`, 선픽 블루. 게스트 기본 MMR 1000. MMR은 저장값 `Member.mmr`.
- 숙련도 갱신은 24시간 1회(`SiteSetting.masteryRefreshedAt`), 호출을 한 번이라도 쓴 실행만 시각을 남긴다.
- Mastery API 호스트: `https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}`.
- 모든 명령은 Windows Git Bash 기준. Docker 명령은 PowerShell.

## Review Focus

1. **드래프트 중 참여자 체크 해제** — 뽑힌 사람을 빼면 그 칸이 비고 차례가 그 팀으로 돌아와야 하며, 팀장을 빼면 드래프트가 초기화돼야 한다. (Task 1 테스트 `removeParticipant`, Task 9 배선)
2. **sessionStorage 복원 시 사라진 회원** — 저장 후 회원이 삭제·흡수돼 풀에서 빠졌으면 그 key는 칸·픽에서 조용히 빠지고 화면은 깨지지 않아야 한다. 깨진 JSON도 빈 상태로 시작. (Task 8 테스트)
3. **숙련도 갱신 중 한도 초과/키 만료** — `unauthorized`면 즉시 멈추고 시각을 남기지 않는다. `rate_limited`는 한 번 재시도 후 멈추고, 멈추기 전까지 갱신한 계정은 유지. (Task 6 테스트)
4. **새 패치 챔피언(모르는 숫자 키)** — 아이콘 자리에 빈 칸, 예외 없음. (Task 3 테스트)
5. **게스트 이름 공백·중복·회원 이름과 충돌** — 앞뒤 공백 정리 후 빈 이름, 기존 게스트·회원 이름과 같은 이름은 거부. (Task 8 테스트)

---

### Task 1: 드래프트 reducer (core)

**Files:**
- Create: `packages/core/src/draft.ts`
- Create: `packages/core/src/draft.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Lane` type from `@lolpamin/db` (`"TOP" | "JUG" | "MID" | "AD" | "SUP"`).
- Produces:
  - `type DraftSide = "blue" | "red"`, `DRAFT_SIDES`, `DRAFT_LANES: readonly Lane[]`
  - `type DraftSlots = Record<DraftSide, Record<Lane, string | null>>`
  - `interface DraftState { captains: Record<DraftSide, string | null>; slots: DraftSlots; picks: string[] }`
  - `interface LanePrefs { mainLane: Lane | null; subLane: Lane | null }`, `interface SlotRef { side: DraftSide; lane: Lane }`
  - `type DraftAction` (아래 코드)
  - `SNAKE_ORDER`, `DRAFT_PICK_COUNT` (= 8)
  - `emptyDraft(): DraftState`, `autoLane(row, prefs): Lane | null`, `seatOf(state, key): SlotRef | null`,
    `isCaptain(state, key): boolean`, `currentTurn(state): DraftSide | null`, `draftPickCount(state): number`,
    `isDraftComplete(state): boolean`, `draftReducer(state, action): DraftState`

규칙 요약(스펙에서 바뀐 점 포함):
- 차례는 `picks` 길이가 아니라 **팀별 좌석 수**로 계산한다(팀 좌석 수 − 팀장 1 = 그 팀 픽 수). 참여자를 빼서 한 팀의 픽이 줄면 그 팀의 다음 스네이크 순번이 앞당겨져 차례가 자연스럽게 돌아온다. `picks`는 되돌리기 순서용으로만 쓴다.
- 드래프트 진행 중(팀장 둘 지정 ~ 8픽 전)에는 **팀을 넘는 이동을 막는다.** 넘는 이동을 허용하면 팀별 좌석 수가 흔들려 차례가 틀어진다. 같은 팀 안 라인 이동·맞바꾸기는 항상 허용. 드래프트 완료 후에는 팀 간 맞바꾸기도 허용.
- 완료 후 후보→엔트리 드롭은 "교체": 그 칸의 사람을 벤치로 보내고 새 사람을 앉힌다. 빠지는 사람이 팀장이면 팀장 자리도 넘긴다.

- [ ] **Step 1: Write the failing test**

`packages/core/src/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  autoLane,
  currentTurn,
  draftPickCount,
  draftReducer,
  emptyDraft,
  isDraftComplete,
  seatOf,
  SNAKE_ORDER,
  type DraftAction,
  type DraftState,
  type LanePrefs,
} from "./draft";

const none: LanePrefs = { mainLane: null, subLane: null };
const run = (actions: DraftAction[], from: DraftState = emptyDraft()) => actions.reduce(draftReducer, from);

// Blue captain on TOP, red captain on TOP.
const withCaptains = (): DraftState =>
  run([
    { type: "setCaptain", side: "blue", key: "bc", prefs: { mainLane: "TOP", subLane: null } },
    { type: "setCaptain", side: "red", key: "rc", prefs: { mainLane: "TOP", subLane: null } },
  ]);

// Eight picks in snake order, each by auto-lane with no preference.
const completed = (): DraftState =>
  run(
    ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((key) => ({ type: "pick", key, prefs: none }) as DraftAction),
    withCaptains(),
  );

describe("autoLane", () => {
  const row = { TOP: "x", JUG: null, MID: null, AD: null, SUP: null };
  it("prefers the main lane, then the sub lane, then the first free lane", () => {
    expect(autoLane(row, { mainLane: "MID", subLane: "AD" })).toBe("MID");
    expect(autoLane(row, { mainLane: "TOP", subLane: "AD" })).toBe("AD");
    expect(autoLane(row, { mainLane: "TOP", subLane: "TOP" })).toBe("JUG");
    expect(autoLane(row, none)).toBe("JUG");
  });
  it("returns null on a full team", () => {
    expect(autoLane({ TOP: "a", JUG: "b", MID: "c", AD: "d", SUP: "e" }, none)).toBeNull();
  });
});

describe("captains", () => {
  it("does not start the draft until both captains are set", () => {
    const blueOnly = run([{ type: "setCaptain", side: "blue", key: "bc", prefs: none }]);
    expect(currentTurn(blueOnly)).toBeNull();
    expect(draftReducer(blueOnly, { type: "pick", key: "p1", prefs: none })).toBe(blueOnly);
    expect(currentTurn(withCaptains())).toBe("blue");
  });

  it("seats a captain on their main lane", () => {
    const state = run([{ type: "setCaptain", side: "blue", key: "bc", prefs: { mainLane: "MID", subLane: null } }]);
    expect(seatOf(state, "bc")).toEqual({ side: "blue", lane: "MID" });
  });

  it("replaces a side's captain before any pick", () => {
    const state = run([{ type: "setCaptain", side: "blue", key: "other", prefs: none }], withCaptains());
    expect(state.captains.blue).toBe("other");
    expect(seatOf(state, "bc")).toBeNull();
  });

  it("refuses to make the other side's captain a captain again, and refuses once picking started", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "setCaptain", side: "blue", key: "rc", prefs: none })).toBe(state);
    const picked = draftReducer(state, { type: "pick", key: "p1", prefs: none });
    expect(draftReducer(picked, { type: "setCaptain", side: "blue", key: "z", prefs: none })).toBe(picked);
  });
});

describe("snake order", () => {
  it("is B R R B B R R B", () => {
    expect(SNAKE_ORDER).toEqual(["blue", "red", "red", "blue", "blue", "red", "red", "blue"]);
  });

  it("walks the turn through the snake as picks land", () => {
    let state = withCaptains();
    const turns: string[] = [];
    for (let i = 1; i <= 8; i++) {
      turns.push(currentTurn(state)!);
      state = draftReducer(state, { type: "pick", key: `p${i}`, prefs: none });
    }
    expect(turns).toEqual([...SNAKE_ORDER]);
    expect(currentTurn(state)).toBeNull();
    expect(isDraftComplete(state)).toBe(true);
    expect(draftPickCount(state)).toBe(8);
  });

  it("puts a pick on the current team's preferred free lane", () => {
    const state = run([{ type: "pick", key: "p1", prefs: { mainLane: "TOP", subLane: "SUP" } }], withCaptains());
    expect(seatOf(state, "p1")).toEqual({ side: "blue", lane: "SUP" });
  });

  it("ignores a pick of someone already seated", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "pick", key: "bc", prefs: none })).toBe(state);
  });
});

describe("dropFromBench", () => {
  it("seats onto an empty lane of the team whose turn it is", () => {
    const state = run([{ type: "dropFromBench", key: "p1", to: { side: "blue", lane: "SUP" } }], withCaptains());
    expect(seatOf(state, "p1")).toEqual({ side: "blue", lane: "SUP" });
    expect(currentTurn(state)).toBe("red");
  });

  it("refuses the team that is not on the clock, and an occupied lane during the draft", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "dropFromBench", key: "p1", to: { side: "red", lane: "SUP" } })).toBe(state);
    expect(draftReducer(state, { type: "dropFromBench", key: "p1", to: { side: "blue", lane: "TOP" } })).toBe(state);
  });

  it("replaces the occupant after the draft is complete, passing on captaincy", () => {
    const done = completed();
    const replaced = draftReducer(done, { type: "dropFromBench", key: "bench", to: { side: "blue", lane: "TOP" } });
    expect(seatOf(replaced, "bench")).toEqual({ side: "blue", lane: "TOP" });
    expect(seatOf(replaced, "bc")).toBeNull();
    expect(replaced.captains.blue).toBe("bench");
    expect(isDraftComplete(replaced)).toBe(true);
  });
});

describe("move", () => {
  it("swaps two lanes within a team at any time", () => {
    const state = run([{ type: "pick", key: "p1", prefs: { mainLane: "SUP", subLane: null } }], withCaptains());
    const moved = draftReducer(state, { type: "move", from: { side: "blue", lane: "SUP" }, to: { side: "blue", lane: "TOP" } });
    expect(seatOf(moved, "p1")).toEqual({ side: "blue", lane: "TOP" });
    expect(seatOf(moved, "bc")).toEqual({ side: "blue", lane: "SUP" });
  });

  it("refuses to cross teams while the draft is in progress", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "move", from: { side: "blue", lane: "TOP" }, to: { side: "red", lane: "SUP" } })).toBe(state);
  });

  it("swaps across teams once the draft is complete", () => {
    const done = completed();
    const a = done.slots.blue.JUG!;
    const b = done.slots.red.JUG!;
    const swapped = draftReducer(done, { type: "move", from: { side: "blue", lane: "JUG" }, to: { side: "red", lane: "JUG" } });
    expect(swapped.slots.blue.JUG).toBe(b);
    expect(swapped.slots.red.JUG).toBe(a);
    expect(isDraftComplete(swapped)).toBe(true);
  });
});

describe("undo", () => {
  it("takes back the last pick and hands the turn back", () => {
    const state = run([{ type: "pick", key: "p1", prefs: none }, { type: "undo" }], withCaptains());
    expect(seatOf(state, "p1")).toBeNull();
    expect(currentTurn(state)).toBe("blue");
  });

  it("clears captains, red first, when there is no pick left", () => {
    const once = draftReducer(withCaptains(), { type: "undo" });
    expect(once.captains).toEqual({ blue: "bc", red: null });
    const twice = draftReducer(once, { type: "undo" });
    expect(twice).toEqual(emptyDraft());
  });
});

describe("removeParticipant", () => {
  it("frees the seat and gives the turn back to the team that lost a player", () => {
    // After p1(blue) p2(red) p3(red), it is blue's turn. Removing p2 makes it red's turn again.
    const state = run(
      [
        { type: "pick", key: "p1", prefs: none },
        { type: "pick", key: "p2", prefs: none },
        { type: "pick", key: "p3", prefs: none },
        { type: "removeParticipant", key: "p2" },
      ],
      withCaptains(),
    );
    expect(seatOf(state, "p2")).toBeNull();
    expect(state.picks).toEqual(["p1", "p3"]);
    expect(currentTurn(state)).toBe("red");
  });

  it("resets the whole draft when a captain leaves", () => {
    const state = run([{ type: "pick", key: "p1", prefs: none }, { type: "removeParticipant", key: "rc" }], withCaptains());
    expect(state).toEqual(emptyDraft());
  });

  it("is a no-op for someone on the bench", () => {
    const state = withCaptains();
    expect(draftReducer(state, { type: "removeParticipant", key: "nobody" })).toBe(state);
  });
});

it("reset empties everything", () => {
  expect(draftReducer(completed(), { type: "reset" })).toEqual(emptyDraft());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/draft.test.ts`
Expected: FAIL — `Failed to resolve import "./draft"`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/draft.ts`:

```ts
// `type` is load-bearing — a value import would boot the Prisma client (see lane.ts).
import type { Lane } from "@lolpamin/db";

export type DraftSide = "blue" | "red";
export const DRAFT_SIDES: readonly DraftSide[] = ["blue", "red"];
export const DRAFT_LANES: readonly Lane[] = ["TOP", "JUG", "MID", "AD", "SUP"];

export type DraftSlots = Record<DraftSide, Record<Lane, string | null>>;

export interface DraftState {
  captains: Record<DraftSide, string | null>;
  slots: DraftSlots;
  // Non-captain seats in the order they were taken. Only undo reads it — the turn is derived
  // from seat counts so that removing a participant hands the turn back without bookkeeping.
  picks: string[];
}

export interface LanePrefs {
  mainLane: Lane | null;
  subLane: Lane | null;
}

export interface SlotRef {
  side: DraftSide;
  lane: Lane;
}

export type DraftAction =
  | { type: "setCaptain"; side: DraftSide; key: string; prefs: LanePrefs }
  | { type: "pick"; key: string; prefs: LanePrefs }
  | { type: "dropFromBench"; key: string; to: SlotRef }
  | { type: "move"; from: SlotRef; to: SlotRef }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "removeParticipant"; key: string };

// Captains are seated first; these are the eight picks after them. Blue has first pick.
export const SNAKE_ORDER: readonly DraftSide[] = ["blue", "red", "red", "blue", "blue", "red", "red", "blue"];
export const DRAFT_PICK_COUNT = SNAKE_ORDER.length;

const SNAKE_INDEXES: Record<DraftSide, number[]> = {
  blue: SNAKE_ORDER.flatMap((side, i) => (side === "blue" ? [i] : [])),
  red: SNAKE_ORDER.flatMap((side, i) => (side === "red" ? [i] : [])),
};

function emptyRow(): Record<Lane, string | null> {
  return { TOP: null, JUG: null, MID: null, AD: null, SUP: null };
}

export function emptyDraft(): DraftState {
  return { captains: { blue: null, red: null }, slots: { blue: emptyRow(), red: emptyRow() }, picks: [] };
}

export function autoLane(row: Record<Lane, string | null>, prefs: LanePrefs): Lane | null {
  if (prefs.mainLane !== null && row[prefs.mainLane] === null) return prefs.mainLane;
  if (prefs.subLane !== null && row[prefs.subLane] === null) return prefs.subLane;
  return DRAFT_LANES.find((lane) => row[lane] === null) ?? null;
}

export function seatOf(state: DraftState, key: string): SlotRef | null {
  for (const side of DRAFT_SIDES) {
    for (const lane of DRAFT_LANES) {
      if (state.slots[side][lane] === key) return { side, lane };
    }
  }
  return null;
}

export function isCaptain(state: DraftState, key: string): boolean {
  return state.captains.blue === key || state.captains.red === key;
}

function seatedCount(state: DraftState, side: DraftSide): number {
  return DRAFT_LANES.filter((lane) => state.slots[side][lane] !== null).length;
}

// One seat per side belongs to its captain. Seat counts stay put under same-side moves and
// cross-side swaps, which is why the turn is derived from them rather than from `picks`.
function sidePickCount(state: DraftState, side: DraftSide): number {
  return Math.max(0, seatedCount(state, side) - (state.captains[side] === null ? 0 : 1));
}

export function draftPickCount(state: DraftState): number {
  return sidePickCount(state, "blue") + sidePickCount(state, "red");
}

export function currentTurn(state: DraftState): DraftSide | null {
  if (state.captains.blue === null || state.captains.red === null) return null;
  const next = (side: DraftSide) => SNAKE_INDEXES[side][sidePickCount(state, side)] ?? Infinity;
  const blue = next("blue");
  const red = next("red");
  if (blue === Infinity && red === Infinity) return null;
  return blue < red ? "blue" : "red";
}

export function isDraftComplete(state: DraftState): boolean {
  return state.captains.blue !== null && state.captains.red !== null && currentTurn(state) === null;
}

function withSeat(slots: DraftSlots, ref: SlotRef, key: string | null): DraftSlots {
  return { ...slots, [ref.side]: { ...slots[ref.side], [ref.lane]: key } };
}

function withoutKey(state: DraftState, key: string): DraftSlots {
  const ref = seatOf(state, key);
  return ref === null ? state.slots : withSeat(state.slots, ref, null);
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "setCaptain": {
      const { side, key, prefs } = action;
      if (state.picks.length > 0) return state;
      if (isCaptain(state, key)) return state;
      const previous = state.captains[side];
      const cleared = previous === null ? state : { ...state, slots: withoutKey(state, previous) };
      // Before any pick a side holds at most its captain, so a lane is always free.
      const lane = autoLane(cleared.slots[side], prefs)!;
      return {
        ...cleared,
        captains: { ...state.captains, [side]: key },
        slots: withSeat(cleared.slots, { side, lane }, key),
      };
    }

    case "pick": {
      const turn = currentTurn(state);
      if (turn === null || seatOf(state, action.key) !== null) return state;
      const lane = autoLane(state.slots[turn], action.prefs);
      if (lane === null) return state;
      return {
        ...state,
        slots: withSeat(state.slots, { side: turn, lane }, action.key),
        picks: [...state.picks, action.key],
      };
    }

    case "dropFromBench": {
      const { key, to } = action;
      if (seatOf(state, key) !== null) return state;
      const occupant = state.slots[to.side][to.lane];
      if (isDraftComplete(state)) {
        // After the draft a bench drop is a substitution — the occupant goes back to the bench.
        if (occupant === null) return state;
        return {
          captains: {
            blue: state.captains.blue === occupant ? key : state.captains.blue,
            red: state.captains.red === occupant ? key : state.captains.red,
          },
          slots: withSeat(state.slots, to, key),
          picks: state.picks.map((k) => (k === occupant ? key : k)),
        };
      }
      if (currentTurn(state) !== to.side || occupant !== null) return state;
      return { ...state, slots: withSeat(state.slots, to, key), picks: [...state.picks, key] };
    }

    case "move": {
      const { from, to } = action;
      if (from.side === to.side && from.lane === to.lane) return state;
      const moving = state.slots[from.side][from.lane];
      if (moving === null) return state;
      // Crossing teams mid-draft would change seat counts and with them whose turn it is.
      if (from.side !== to.side && !isDraftComplete(state)) return state;
      const target = state.slots[to.side][to.lane];
      return { ...state, slots: withSeat(withSeat(state.slots, to, moving), from, target) };
    }

    case "undo": {
      if (state.picks.length > 0) {
        const last = state.picks[state.picks.length - 1];
        return { ...state, slots: withoutKey(state, last), picks: state.picks.slice(0, -1) };
      }
      for (const side of ["red", "blue"] as const) {
        const captain = state.captains[side];
        if (captain !== null) {
          return { ...state, captains: { ...state.captains, [side]: null }, slots: withoutKey(state, captain) };
        }
      }
      return state;
    }

    case "reset":
      return emptyDraft();

    case "removeParticipant": {
      if (isCaptain(state, action.key)) return emptyDraft();
      if (seatOf(state, action.key) === null) return state;
      return {
        ...state,
        slots: withoutKey(state, action.key),
        picks: state.picks.filter((k) => k !== action.key),
      };
    }
  }
}
```

`packages/core/src/index.ts` 끝에 추가:

```ts
export * from "./draft";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/draft.test.ts`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/draft.ts packages/core/src/draft.test.ts packages/core/src/index.ts
git commit -m "feat(core): snake draft reducer for captain picks"
```

---

### Task 2: 숙련도 합산 (core)

**Files:**
- Create: `packages/core/src/mastery.ts`
- Create: `packages/core/src/mastery.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `interface MasteryEntry { championId: number; level: number; points: number }`,
  `topMasteries(entries: readonly MasteryEntry[], n?: number): MasteryEntry[]`

- [ ] **Step 1: Write the failing test**

`packages/core/src/mastery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { topMasteries } from "./mastery";

describe("topMasteries", () => {
  it("sums points across accounts and keeps the highest level", () => {
    const result = topMasteries([
      { championId: 1, level: 7, points: 100 },
      { championId: 1, level: 12, points: 50 },
      { championId: 2, level: 30, points: 120 },
    ]);
    expect(result).toEqual([
      { championId: 1, level: 12, points: 150 },
      { championId: 2, level: 30, points: 120 },
    ]);
  });

  it("finds a champion that is fourth on each account but first combined", () => {
    const main = [
      { championId: 10, level: 5, points: 90 },
      { championId: 11, level: 5, points: 80 },
      { championId: 12, level: 5, points: 70 },
      { championId: 99, level: 5, points: 60 },
    ];
    const smurf = [
      { championId: 20, level: 5, points: 90 },
      { championId: 21, level: 5, points: 80 },
      { championId: 22, level: 5, points: 70 },
      { championId: 99, level: 5, points: 60 },
    ];
    expect(topMasteries([...main, ...smurf])[0]).toEqual({ championId: 99, level: 5, points: 120 });
  });

  it("returns at most n, breaking ties by champion id", () => {
    const result = topMasteries(
      [
        { championId: 3, level: 1, points: 10 },
        { championId: 1, level: 1, points: 10 },
        { championId: 2, level: 1, points: 10 },
        { championId: 4, level: 1, points: 10 },
      ],
      3,
    );
    expect(result.map((m) => m.championId)).toEqual([1, 2, 3]);
  });

  it("returns fewer than n, or none, when there is not enough data", () => {
    expect(topMasteries([])).toEqual([]);
    expect(topMasteries([{ championId: 1, level: 2, points: 3 }])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/mastery.test.ts`
Expected: FAIL — `Failed to resolve import "./mastery"`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/mastery.ts`:

```ts
export interface MasteryEntry {
  championId: number;
  level: number;
  points: number;
}

// One member can own several accounts. Points add up across them; levels do not — a level 12
// main plus a level 7 smurf is not "level 19", so the highest level stands for the champion.
export function topMasteries(entries: readonly MasteryEntry[], n = 3): MasteryEntry[] {
  const byChampion = new Map<number, MasteryEntry>();
  for (const entry of entries) {
    const previous = byChampion.get(entry.championId);
    byChampion.set(
      entry.championId,
      previous
        ? { championId: entry.championId, level: Math.max(previous.level, entry.level), points: previous.points + entry.points }
        : { ...entry },
    );
  }
  return [...byChampion.values()].sort((a, b) => b.points - a.points || a.championId - b.championId).slice(0, n);
}
```

`packages/core/src/index.ts` 끝에 추가:

```ts
export * from "./mastery";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/mastery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mastery.ts packages/core/src/mastery.test.ts packages/core/src/index.ts
git commit -m "feat(core): combine champion mastery across accounts"
```

---

### Task 3: Data Dragon 숫자 챔피언 키

**Files:**
- Modify: `apps/dashboard/lib/ddragon/build-map.ts`
- Modify: `apps/dashboard/lib/ddragon/build-map.test.ts`
- Modify: `apps/dashboard/lib/ddragon/assets.ts`
- Modify: `apps/dashboard/lib/ddragon/assets.test.ts`
- Regenerate: `apps/dashboard/lib/ddragon/ddragon-map.json` (스크립트 출력)

**Interfaces:**
- Produces: `DdragonMap.championKeys: Record<string, string>` (`"266" → "Aatrox"`),
  `championIdByKey(key: number): string | null` in `lib/ddragon/assets.ts`.

- [ ] **Step 1: Write the failing tests**

`build-map.test.ts` — 픽스처의 챔피언에 `key`를 넣고 테스트 하나를 더한다:

```ts
  champion: { data: { Trundle: { id: "Trundle", key: "48", name: "트런들" } } },
```

```ts
  it("indexes champions by the numeric key the mastery API returns", () => {
    expect(buildDdragonMap(sources).championKeys).toEqual({ "48": "Trundle" });
  });
```

`assets.test.ts` — import에 `championIdByKey`를 더하고:

```ts
  it("resolves a mastery championId to the Data Dragon id, or null for an unknown patch", () => {
    expect(championIdByKey(266)).toBe("Aatrox");
    expect(championIdByKey(48)).toBe("Trundle");
    expect(championIdByKey(999999)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/ddragon`
Expected: FAIL — `championKeys` undefined / `championIdByKey is not a function`.

- [ ] **Step 3: Implement**

`build-map.ts`:
- `DdragonMap`에 `championKeys: Record<string, string>;` (champions 바로 아래).
- `DdragonSources.champion` 타입을 `{ data: Record<string, { id: string; key: string; name: string }> }`로.
- `buildDdragonMap` 안:

```ts
  // Champion-Mastery-V4 identifies champions by champion.json's numeric "key", not its id.
  const championKeys = Object.fromEntries(Object.values(input.champion.data).map((c) => [c.key, c.id]));
```

  반환값을 `{ version: input.version, champions, championKeys, items, spells, runes }`로.

`assets.ts` 끝에 추가:

```ts
// Mastery rows carry the numeric key. A champion released after the committed patch has no
// entry and resolves to null, which the board draws as an empty square.
export function championIdByKey(key: number): string | null {
  return map.championKeys[String(key)] ?? null;
}
```

맵 재생성(덤프 `16.18.1/`이 레포 루트에 있다):

```bash
cd apps/dashboard && npx tsx scripts/sync-ddragon.ts ../../16.18.1
```

Expected: `ddragon 16.18.1: copied N images, …`. `git status`에서 `public/ddragon/` 아래 변경이 **없어야** 하고 `ddragon-map.json`에만 `championKeys` 블록이 추가돼야 한다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/ddragon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/ddragon
git commit -m "feat(ddragon): map numeric champion keys to ids"
```

---

### Task 4: `ChampionMastery` 스키마

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260923180000_champion_mastery/migration.sql`

**Interfaces:**
- Produces: Prisma model `championMastery` (`riotAccountId`, `championId`, `level`, `points`, PK `[riotAccountId, championId]`), relation `RiotAccount.masteries`, column `SiteSetting.masteryRefreshedAt: Date | null`.

- [ ] **Step 1: Edit the schema**

`model RiotAccount` 안 마지막 필드들 옆에:

```prisma
  masteries ChampionMastery[]
```

새 모델(`RiotAccount` 바로 아래):

```prisma
// 계정 하나의 챔피언 숙련도. 회원별 합산은 읽을 때 한다(topMasteries) — 흡수·해제·계정
// 재배정은 RiotAccount.memberId만 옮기므로 합산을 저장하지 않으면 그 경로들이 손댈 게 없다.
// 계정의 부속물이라 계정을 지우면 같이 지운다(Restrict가 필요한 "확정 상태"가 아니다).
model ChampionMastery {
  riotAccountId String
  riotAccount   RiotAccount @relation(fields: [riotAccountId], references: [id], onDelete: Cascade)
  // Data Dragon champion.json의 숫자 "key".
  championId Int
  level      Int
  points     Int

  @@id([riotAccountId, championId])
}
```

`model SiteSetting`의 `riotIdRefreshedAt` 아래:

```prisma
  // 챔피언 숙련도를 마지막으로 받아 온 시각. riotIdRefreshedAt과 같은 이유로 DB에 둔다.
  masteryRefreshedAt DateTime?
```

- [ ] **Step 2: Write the migration**

`packages/db/prisma/migrations/20260923180000_champion_mastery/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "ChampionMastery" (
    "riotAccountId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "ChampionMastery_pkey" PRIMARY KEY ("riotAccountId","championId")
);

-- AddForeignKey
ALTER TABLE "ChampionMastery" ADD CONSTRAINT "ChampionMastery_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN "masteryRefreshedAt" TIMESTAMP(3);
```

- [ ] **Step 3: Generate the client and apply to dev + test DBs**

Postgres가 떠 있어야 한다(PowerShell: `docker compose up -d`).

```bash
cd packages/db
npx prisma generate
DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '"\r') npx prisma migrate deploy
DATABASE_URL=$(grep '^DATABASE_URL_TEST=' ../../.env | cut -d= -f2- | tr -d '"\r') npx prisma migrate deploy
```

Expected: 두 번 모두 `All migrations have been successfully applied.`

- [ ] **Step 4: Verify the SQL matches the schema**

```bash
cd packages/db
DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '"\r') npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: `No difference detected.` exit 0. 차이가 나오면 SQL을 그 출력에 맞춰 고치고 다시 적용한다.

`resetDatabase`(`packages/db/src/test-utils.ts`)는 고치지 않는다 — `riotAccount.deleteMany()`가 cascade로 숙련도를 지운다. 전체 테스트로 확인:

Run: `npm test`
Expected: 기존 테스트 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): cache champion mastery per riot account"
```

---

### Task 5: Mastery-V4 클라이언트

**Files:**
- Create: `apps/dashboard/lib/riot-api/request.ts`
- Modify: `apps/dashboard/lib/riot-api/account.ts`
- Create: `apps/dashboard/lib/riot-api/mastery.ts`
- Create: `apps/dashboard/lib/riot-api/mastery.test.ts`

**Interfaces:**
- Consumes: `MasteryEntry` from `@lolpamin/core`.
- Produces:
  - `request.ts`: `type LookupFailure`, `interface LookupDeps`, `riotGet(url: string, deps: LookupDeps): Promise<{ ok: true; body: unknown } | { ok: false; reason: LookupFailure }>`
  - `account.ts`: 기존 export 유지(`LookupFailure`, `LookupDeps`는 re-export).
  - `mastery.ts`: `type MasteryLookupResult = { ok: true; masteries: MasteryEntry[] } | { ok: false; reason: LookupFailure }`, `type LookupChampionMasteries = (puuid: string) => Promise<MasteryLookupResult>`, `lookupChampionMasteries(puuid: string, deps?: LookupDeps): Promise<MasteryLookupResult>`

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/riot-api/mastery.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { lookupChampionMasteries } from "./mastery";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("lookupChampionMasteries", () => {
  it("maps the response rows to mastery entries", async () => {
    const fetch = fakeFetch(200, [
      { puuid: "p", championId: 266, championLevel: 12, championPoints: 150000, lastPlayTime: 0 },
      { puuid: "p", championId: 48, championLevel: 5, championPoints: 20000, lastPlayTime: 0 },
    ]);

    const result = await lookupChampionMasteries("p", { fetch, apiKey: "k" });

    expect(result).toEqual({
      ok: true,
      masteries: [
        { championId: 266, level: 12, points: 150000 },
        { championId: 48, level: 5, points: 20000 },
      ],
    });
  });

  it("calls the kr platform host with the encoded puuid and the token header", async () => {
    const fetch = fakeFetch(200, []);

    await lookupChampionMasteries("a/b", { fetch, apiKey: "RGAPI-test" });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/a%2Fb",
    );
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("RGAPI-test");
  });

  it("maps failures the same way the account lookup does", async () => {
    const at = (status: number) => lookupChampionMasteries("p", { fetch: fakeFetch(status), apiKey: "k" });
    expect(await at(404)).toEqual({ ok: false, reason: "not_found" });
    expect(await at(403)).toEqual({ ok: false, reason: "unauthorized" });
    expect(await at(429)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await at(500)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("answers unauthorized without calling when there is no key", async () => {
    const fetch = fakeFetch(200, []);
    expect(await lookupChampionMasteries("p", { fetch, apiKey: "" })).toEqual({ ok: false, reason: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/riot-api/mastery.test.ts`
Expected: FAIL — `Failed to resolve import "./mastery"`.

- [ ] **Step 3: Implement**

`apps/dashboard/lib/riot-api/request.ts` — `account.ts`의 `requestAccount` 본문에서 URL·바디 처리를 뺀 공통부:

```ts
export type LookupFailure = "not_found" | "unauthorized" | "rate_limited" | "unavailable";

export interface LookupDeps {
  fetch?: typeof fetch;
  apiKey?: string;
}

export type RiotGetResult = { ok: true; body: unknown } | { ok: false; reason: LookupFailure };

/**
 * 네트워크와 라이엇 상태 코드를 아는 유일한 자리다.
 *
 * 실패를 던지지 않고 결과로 돌려준다 — 배치가 한 건의 404 때문에 멈추면 안 되고,
 * 키 만료(401/403)는 호출자가 즉시 중단할 수 있어야 한다.
 */
export async function riotGet(url: string, deps: LookupDeps): Promise<RiotGetResult> {
  const apiKey = deps.apiKey ?? process.env.RIOT_API_KEY ?? "";
  // 키가 없으면 어차피 401이다. 호출을 아껴 곧바로 같은 답을 낸다.
  if (apiKey.length === 0) return { ok: false, reason: "unauthorized" };

  const doFetch = deps.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(url, { headers: { "X-Riot-Token": apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  return { ok: true, body: await response.json() };
}
```

`account.ts` — `LookupFailure`/`LookupDeps` 선언을 지우고 re-export, `requestAccount`를 `riotGet` 위에 다시 쓴다:

```ts
import { riotGet, type LookupDeps, type LookupFailure } from "./request";

export type { LookupDeps, LookupFailure } from "./request";
```

```ts
async function requestAccount(path: string, deps: LookupDeps): Promise<LookupResult> {
  const result = await riotGet(`${ACCOUNT_V1}/${path}`, deps);
  if (!result.ok) return result;
  const body = result.body as { puuid: string; gameName: string; tagLine: string };
  // 응답의 표기를 그대로 쓴다 — 대소문자·공백이 라이엇 쪽 정본으로 정리돼 온다.
  return { ok: true, account: { puuid: body.puuid, gameName: body.gameName, tagLine: body.tagLine } };
}
```

(기존 JSDoc "네트워크와 라이엇 응답 형식을 아는 유일한 자리다…"는 `request.ts`로 옮겼으니 `requestAccount` 위에서는 지운다.)

`apps/dashboard/lib/riot-api/mastery.ts`:

```ts
import type { MasteryEntry } from "@lolpamin/core";
import { riotGet, type LookupDeps, type LookupFailure } from "./request";

export type MasteryLookupResult = { ok: true; masteries: MasteryEntry[] } | { ok: false; reason: LookupFailure };

export type LookupChampionMasteries = (puuid: string) => Promise<MasteryLookupResult>;

// Champion-Mastery-V4는 Account-V1과 달리 플랫폼 호스트(kr)를 쓴다.
const MASTERY_V4 = "https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid";

/**
 * 계정 하나의 전체 숙련도 목록. `/top`이 아니라 전체를 받는다 — 계정마다 상위 3개만 받으면
 * 두 계정에서 각각 4위인 챔피언이 합산으로는 1위가 되는 경우를 놓친다. 호출 수는 같다.
 */
export async function lookupChampionMasteries(puuid: string, deps: LookupDeps = {}): Promise<MasteryLookupResult> {
  const result = await riotGet(`${MASTERY_V4}/${encodeURIComponent(puuid)}`, deps);
  if (!result.ok) return result;
  const rows = result.body as Array<{ championId: number; championLevel: number; championPoints: number }>;
  return {
    ok: true,
    masteries: rows.map((row) => ({ championId: row.championId, level: row.championLevel, points: row.championPoints })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/riot-api`
Expected: `mastery.test.ts`와 기존 `account.test.ts` 모두 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/riot-api
git commit -m "feat(riot-api): champion mastery lookup by puuid"
```

---

### Task 6: 숙련도 갱신 mutation

**Files:**
- Create: `apps/dashboard/lib/mutations/refresh-champion-masteries.ts`
- Create: `apps/dashboard/lib/mutations/refresh-champion-masteries.test.ts`

**Interfaces:**
- Consumes: `LookupChampionMasteries`, `MasteryLookupResult` (Task 5), `REFRESH_COOLDOWN_MS` from `./refresh-riot-account-ids`, `SITE_SETTING_ID` from `../queries/site-theme`.
- Produces:
  - `interface MasteryRefreshResult { refreshed: number; notFound: number; unauthorized: boolean }`
  - `REFRESH_MASTERIES_ERRORS = { tooSoon: "오늘은 이미 숙련도를 갱신했습니다. 24시간 뒤에 다시 시도해 주세요." }`
  - `interface MasteryRefreshAvailability { allowed: boolean; lastRefreshedAt: Date | null; accountCount: number }`
  - `getMasteryRefreshAvailability(prisma, now?): Promise<MasteryRefreshAvailability>`
  - `refreshChampionMasteries(prisma, lookup, deps?: { now?: Date; sleep?: (ms: number) => Promise<void> }): Promise<MasteryRefreshResult>`

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/mutations/refresh-champion-masteries.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";
import type { MasteryLookupResult } from "@/lib/riot-api/mastery";
import { SITE_SETTING_ID } from "@/lib/queries/site-theme";
import {
  getMasteryRefreshAvailability,
  refreshChampionMasteries,
  REFRESH_MASTERIES_ERRORS,
} from "./refresh-champion-masteries";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const noSleep = { sleep: async () => {} };

const ok = (...rows: Array<[number, number, number]>): MasteryLookupResult => ({
  ok: true,
  masteries: rows.map(([championId, level, points]) => ({ championId, level, points })),
});

function lookupFrom(table: Record<string, MasteryLookupResult>) {
  return vi.fn(async (puuid: string) => table[puuid] ?? { ok: false, reason: "not_found" as const });
}

async function account(memberId: string | null, puuid: string) {
  return prisma.riotAccount.create({ data: { puuid, memberId, gameName: puuid, tagLine: "KR1", lastSeenAt: new Date() } });
}

async function masteriesOf(puuid: string) {
  const acc = await prisma.riotAccount.findUniqueOrThrow({ where: { puuid }, include: { masteries: true } });
  return acc.masteries.map((m) => [m.championId, m.level, m.points]).sort((a, b) => a[0] - b[0]);
}

describe("refreshChampionMasteries", () => {
  it("replaces an account's stored masteries with the fresh list", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    const result = await refreshChampionMasteries(prisma, lookupFrom({ "p-1": ok([266, 12, 150], [48, 5, 20]) }), noSleep);

    expect(result).toEqual({ refreshed: 1, notFound: 0, unauthorized: false });
    expect(await masteriesOf("p-1")).toEqual([[48, 5, 20], [266, 12, 150]]);
  });

  it("skips accounts confirmed as outsiders", async () => {
    await account(null, "outsider");
    const lookup = lookupFrom({});

    await refreshChampionMasteries(prisma, lookup, noSleep);

    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps the old rows on 404 and counts it", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "gone");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 2, points: 3 } });

    const result = await refreshChampionMasteries(prisma, lookupFrom({}), noSleep);

    expect(result).toEqual({ refreshed: 0, notFound: 1, unauthorized: false });
    expect(await masteriesOf("gone")).toEqual([[1, 2, 3]]);
  });

  it("stops on the first unauthorized and does not use up the day", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const lookup = vi.fn(async () => ({ ok: false, reason: "unauthorized" }) as MasteryLookupResult);

    const result = await refreshChampionMasteries(prisma, lookup, noSleep);

    expect(result.unauthorized).toBe(true);
    const setting = await prisma.siteSetting.findUnique({ where: { id: SITE_SETTING_ID } });
    expect(setting?.masteryRefreshedAt ?? null).toBeNull();
  });

  it("retries a rate limit once, then stops and keeps what it already wrote", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    await new Promise((r) => setTimeout(r, 5));
    await account(m.id, "p-2");
    const lookup = vi.fn(async (puuid: string) =>
      puuid === "p-1" ? ok([1, 1, 1]) : ({ ok: false, reason: "rate_limited" } as MasteryLookupResult),
    );

    const result = await refreshChampionMasteries(prisma, lookup, noSleep);

    expect(result.refreshed).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(await masteriesOf("p-1")).toEqual([[1, 1, 1]]);
  });

  it("allows one run per 24 hours", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    await account(m.id, "p-1");
    const now = new Date("2026-09-23T12:00:00Z");
    await refreshChampionMasteries(prisma, lookupFrom({ "p-1": ok() }), { ...noSleep, now });

    await expect(
      refreshChampionMasteries(prisma, lookupFrom({}), { ...noSleep, now: new Date("2026-09-24T11:59:00Z") }),
    ).rejects.toThrow(REFRESH_MASTERIES_ERRORS.tooSoon);

    const later = await getMasteryRefreshAvailability(prisma, new Date("2026-09-24T12:00:00Z"));
    expect(later).toEqual({ allowed: true, lastRefreshedAt: now, accountCount: 1 });
  });

  it("drops the masteries with the account", async () => {
    const m = await prisma.member.create({ data: { realName: "가" } });
    const acc = await account(m.id, "p-1");
    await prisma.championMastery.create({ data: { riotAccountId: acc.id, championId: 1, level: 1, points: 1 } });

    await prisma.riotAccount.delete({ where: { id: acc.id } });

    expect(await prisma.championMastery.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/mutations/refresh-champion-masteries.test.ts`
Expected: FAIL — `Failed to resolve import "./refresh-champion-masteries"`.

- [ ] **Step 3: Implement**

`apps/dashboard/lib/mutations/refresh-champion-masteries.ts`:

```ts
import type { PrismaClient } from "@lolpamin/db";
import type { LookupChampionMasteries, MasteryLookupResult } from "@/lib/riot-api/mastery";
import { SITE_SETTING_ID } from "../queries/site-theme";
import { REFRESH_COOLDOWN_MS } from "./refresh-riot-account-ids";

export interface MasteryRefreshResult {
  // 새 목록으로 교체한 계정.
  refreshed: number;
  // 404 — 옛 숙련도를 그대로 둔다.
  notFound: number;
  // 키 만료·부재로 중단됐다. 위 숫자는 중단 전까지의 집계다.
  unauthorized: boolean;
}

export const REFRESH_MASTERIES_ERRORS = {
  tooSoon: "오늘은 이미 숙련도를 갱신했습니다. 24시간 뒤에 다시 시도해 주세요.",
} as const;

const RATE_LIMIT_BACKOFF_MS = 2000;

export interface MasteryRefreshAvailability {
  allowed: boolean;
  lastRefreshedAt: Date | null;
  accountCount: number;
}

export async function getMasteryRefreshAvailability(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<MasteryRefreshAvailability> {
  const [row, accountCount] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { id: SITE_SETTING_ID }, select: { masteryRefreshedAt: true } }),
    prisma.riotAccount.count({ where: { memberId: { not: null } } }),
  ]);
  const lastRefreshedAt = row?.masteryRefreshedAt ?? null;
  const allowed = lastRefreshedAt === null || now.getTime() - lastRefreshedAt.getTime() >= REFRESH_COOLDOWN_MS;
  return { allowed, lastRefreshedAt, accountCount };
}

/**
 * 회원에게 붙은 계정마다 숙련도 목록을 새로 받아 통째로 바꾼다. 외부인 계정은 화면에 나갈
 * 일이 없어 호출 한도를 쓰지 않는다. 한도·시각 기록 규칙은 refreshRiotAccountIds와 같다.
 */
export async function refreshChampionMasteries(
  prisma: PrismaClient,
  lookup: LookupChampionMasteries,
  deps: { now?: Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MasteryRefreshResult> {
  const now = deps.now ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { allowed } = await getMasteryRefreshAvailability(prisma, now);
  if (!allowed) throw new Error(REFRESH_MASTERIES_ERRORS.tooSoon);

  const result: MasteryRefreshResult = { refreshed: 0, notFound: 0, unauthorized: false };
  const accounts = await prisma.riotAccount.findMany({
    where: { memberId: { not: null } },
    select: { id: true, puuid: true },
    orderBy: { firstSeenAt: "asc" },
  });

  let spentCalls = false;

  for (const account of accounts) {
    spentCalls = true;
    let outcome: MasteryLookupResult = await lookup(account.puuid);
    if (!outcome.ok && outcome.reason === "rate_limited") {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      outcome = await lookup(account.puuid);
    }

    if (!outcome.ok) {
      if (outcome.reason === "unauthorized") {
        result.unauthorized = true;
        return result;
      }
      if (outcome.reason === "rate_limited") break;
      if (outcome.reason === "not_found") result.notFound += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.championMastery.deleteMany({ where: { riotAccountId: account.id } }),
      prisma.championMastery.createMany({
        data: outcome.masteries.map((m) => ({ riotAccountId: account.id, ...m })),
      }),
    ]);
    result.refreshed += 1;
  }

  if (spentCalls) {
    await prisma.siteSetting.upsert({
      where: { id: SITE_SETTING_ID },
      create: { id: SITE_SETTING_ID, masteryRefreshedAt: now },
      update: { masteryRefreshedAt: now },
    });
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run lib/mutations/refresh-champion-masteries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/mutations/refresh-champion-masteries.ts apps/dashboard/lib/mutations/refresh-champion-masteries.test.ts
git commit -m "feat(mastery): daily refresh of champion masteries"
```

---

### Task 7: 드래프트 후보 풀 쿼리

**Files:**
- Create: `apps/dashboard/lib/queries/draft-pool.ts`
- Create: `apps/dashboard/lib/queries/draft-pool.test.ts`
- Modify: `apps/dashboard/lib/queries/linked-members.ts` (주석 한 줄)

**Interfaces:**
- Consumes: `getLinkedMembers()` (싱글턴 prisma, MMR 내림차순, 협곡 counted 승패), `topMasteries`, `MasteryEntry`.
- Produces:

```ts
export interface DraftPoolMember {
  id: string;
  name: string;
  mmr: number;
  wins: number;
  losses: number;
  mainLane: Lane | null;
  subLane: Lane | null;
  // 대표 계정 "이름#태그". 계정이 없으면 손으로 적은 Member.riotId, 그것도 없으면 null.
  riotId: string | null;
  // 대표 계정 외 계정 수("+N").
  extraAccounts: number;
  // 모든 계정 합산 상위 3개.
  masteries: MasteryEntry[];
}
export async function getDraftPool(prisma: PrismaClient): Promise<DraftPoolMember[]>
```

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/queries/draft-pool.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@lolpamin/db";
import { resetDatabase } from "@lolpamin/db/src/test-utils";

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error("DATABASE_URL_TEST must be set — refusing to run destructive tests against an unknown database");
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrlTest });

// getLinkedMembers는 앱 싱글턴 prisma를 쓴다. linked-members.test.ts와 같은 방식으로 바꿔치기한다.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient: Client } = await import("@lolpamin/db");
  return { prisma: new Client({ datasourceUrl: process.env.DATABASE_URL_TEST }) };
});

const { getDraftPool } = await import("./draft-pool");

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function accountWith(memberId: string, puuid: string, gameName: string, rows: Array<[number, number, number]>) {
  const acc = await prisma.riotAccount.create({
    data: { puuid, memberId, gameName, tagLine: "KR1", lastSeenAt: new Date() },
  });
  await prisma.championMastery.createMany({
    data: rows.map(([championId, level, points]) => ({ riotAccountId: acc.id, championId, level, points })),
  });
  return acc;
}

describe("getDraftPool", () => {
  it("combines masteries over every account and shows the heaviest account as the riot id", async () => {
    const m = await prisma.member.create({ data: { realName: "가", mainLane: "MID", subLane: "TOP" } });
    await accountWith(m.id, "p-1", "본캐", [[1, 10, 500], [2, 9, 400]]);
    await accountWith(m.id, "p-2", "부캐", [[2, 12, 300], [3, 5, 50]]);

    const [row] = await getDraftPool(prisma);

    expect(row).toMatchObject({
      id: m.id,
      mainLane: "MID",
      subLane: "TOP",
      riotId: "본캐#KR1",
      extraAccounts: 1,
      masteries: [
        { championId: 2, level: 12, points: 700 },
        { championId: 1, level: 10, points: 500 },
        { championId: 3, level: 5, points: 50 },
      ],
    });
  });

  it("falls back to the hand-written riot id and no masteries for a member without an account", async () => {
    await prisma.member.create({
      data: { discordUserId: "d-1", kakaoNickname: "가/94/닉", riotId: "손으로#적음" },
    });

    const [row] = await getDraftPool(prisma);

    expect(row).toMatchObject({ riotId: "손으로#적음", extraAccounts: 0, masteries: [] });
  });

  it("keeps getLinkedMembers' MMR order", async () => {
    const low = await prisma.member.create({ data: { realName: "낮음", mmr: 900 } });
    const high = await prisma.member.create({ data: { realName: "높음", mmr: 1100 } });
    await accountWith(low.id, "p-low", "low", []);
    await accountWith(high.id, "p-high", "high", []);

    expect((await getDraftPool(prisma)).map((r) => r.id)).toEqual([high.id, low.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/queries/draft-pool.test.ts`
Expected: FAIL — `Failed to resolve import "./draft-pool"`.

- [ ] **Step 3: Implement**

`apps/dashboard/lib/queries/draft-pool.ts`:

```ts
import type { Lane, PrismaClient } from "@lolpamin/db";
import { topMasteries, type MasteryEntry } from "@lolpamin/core";
import { getLinkedMembers } from "./linked-members";

export interface DraftPoolMember {
  id: string;
  name: string;
  mmr: number;
  wins: number;
  losses: number;
  mainLane: Lane | null;
  subLane: Lane | null;
  // 대표 계정 "이름#태그". 계정이 없으면 손으로 적은 Member.riotId, 그것도 없으면 null.
  riotId: string | null;
  // 대표 계정 외 계정 수 — 화면의 "+N".
  extraAccounts: number;
  // 모든 계정을 합산한 상위 3개.
  masteries: MasteryEntry[];
}

/**
 * 팀 드래프트의 후보. 누가 뛸 수 있는지·MMR·협곡 승패는 getLinkedMembers가 이미 정하므로
 * 그 결과에 라인·계정·숙련도만 붙인다 — 두 화면이 서로 다른 회원 목록을 말하지 않게.
 */
export async function getDraftPool(prisma: PrismaClient): Promise<DraftPoolMember[]> {
  const linked = await getLinkedMembers();
  const details = await prisma.member.findMany({
    where: { id: { in: linked.map((m) => m.id) } },
    select: {
      id: true,
      mainLane: true,
      subLane: true,
      riotAccounts: {
        orderBy: { firstSeenAt: "asc" },
        select: {
          gameName: true,
          tagLine: true,
          masteries: { select: { championId: true, level: true, points: true } },
        },
      },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));

  return linked.map((m) => {
    const detail = byId.get(m.id)!;
    const accounts = detail.riotAccounts;

    // 숙련 포인트가 가장 많은 계정을 대표로 — 사람들이 "그 사람 계정"으로 아는 쪽이다.
    // 동점이면 먼저 본 계정.
    let representative = accounts[0] ?? null;
    let best = -1;
    for (const account of accounts) {
      const total = account.masteries.reduce((sum, row) => sum + row.points, 0);
      if (total > best) {
        best = total;
        representative = account;
      }
    }

    return {
      id: m.id,
      name: m.name,
      mmr: m.mmr,
      wins: m.wins,
      losses: m.losses,
      mainLane: detail.mainLane,
      subLane: detail.subLane,
      riotId: representative ? `${representative.gameName}#${representative.tagLine}` : m.riotId,
      extraAccounts: Math.max(0, accounts.length - 1),
      masteries: topMasteries(accounts.flatMap((account) => account.masteries)),
    };
  });
}
```

`linked-members.ts` — `aramMmr` 위 주석 `// 칼바람 트랙. MatchBuilder가 모드 토글에 따라 이쪽과 협곡 값을 오간다.`를
`// 칼바람 트랙. 추첨 화면 등이 모드에 따라 이쪽과 협곡 값을 오간다.`로 바꾼다(MatchBuilder는 Task 10에서 사라진다).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run lib/queries/draft-pool.test.ts lib/queries/linked-members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/queries/draft-pool.ts apps/dashboard/lib/queries/draft-pool.test.ts apps/dashboard/lib/queries/linked-members.ts
git commit -m "feat(draft): candidate pool with lanes and combined masteries"
```

---

### Task 8: 후보 조립·게스트·sessionStorage (클라이언트 순수 로직)

**Files:**
- Create: `apps/dashboard/lib/draft/candidates.ts`
- Create: `apps/dashboard/lib/draft/candidates.test.ts`
- Create: `apps/dashboard/lib/draft/storage.ts`
- Create: `apps/dashboard/lib/draft/storage.test.ts`

**Interfaces:**
- Consumes: `DraftPoolMember` (Task 7, type-only), `DraftState`, `DraftSide`, `DRAFT_LANES`, `DRAFT_SIDES`, `draftReducer`, `emptyDraft`, `seatOf`, `isLane` from `@lolpamin/core`.
- Produces (`candidates.ts`):

```ts
export interface Guest { name: string; mmr: number; mainLane: Lane | null; subLane: Lane | null }
export const GUEST_DEFAULT_MMR = 1000;
export interface Candidate {
  key: string; isGuest: boolean; name: string; mmr: number;
  wins: number | null; losses: number | null;
  mainLane: Lane | null; subLane: Lane | null;
  riotId: string | null; extraAccounts: number; masteries: MasteryEntry[];
}
export function memberKey(id: string): string          // "m:<id>"
export function guestKey(name: string): string         // "g:<name>"
export function normalizeGuestName(raw: string): string
export function guestNameError(name: string, guests: Guest[], pool: DraftPoolMember[]): string | null
export function buildCandidates(pool: DraftPoolMember[], participantIds: string[], guests: Guest[]): Candidate[]
export function teamAverage(state: DraftState, side: DraftSide, byKey: Map<string, Candidate>): number | null
```

- Produces (`storage.ts`):

```ts
export const DRAFT_STORAGE_KEY = "lolpamin.draft.v1";
export interface StoredDraft { participantIds: string[]; guests: Guest[]; draft: DraftState }
export function loadDraft(storage: Pick<Storage, "getItem"> | null, validMemberIds: ReadonlySet<string>): StoredDraft | null
export function saveDraft(storage: Pick<Storage, "setItem"> | null, value: StoredDraft): void
```

- [ ] **Step 1: Write the failing tests**

`apps/dashboard/lib/draft/candidates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { draftReducer, emptyDraft } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { buildCandidates, guestKey, guestNameError, memberKey, normalizeGuestName, teamAverage } from "./candidates";

const member = (id: string, name: string, mmr: number): DraftPoolMember => ({
  id, name, mmr, wins: 1, losses: 2, mainLane: "TOP", subLane: null,
  riotId: `${name}#KR1`, extraAccounts: 0, masteries: [],
});

const pool = [member("a", "가", 1100), member("b", "나", 1000), member("c", "다", 900)];

describe("buildCandidates", () => {
  it("keeps only participants and sorts by MMR, guests included", () => {
    const rows = buildCandidates(pool, ["c", "a"], [{ name: "손님", mmr: 1050, mainLane: null, subLane: "SUP" }]);
    expect(rows.map((r) => r.key)).toEqual([memberKey("a"), guestKey("손님"), memberKey("c")]);
    expect(rows[1]).toMatchObject({ isGuest: true, wins: null, losses: null, riotId: null, masteries: [], subLane: "SUP" });
  });

  it("drops participant ids the pool no longer has", () => {
    expect(buildCandidates(pool, ["gone", "b"], []).map((r) => r.key)).toEqual([memberKey("b")]);
  });
});

describe("guest names", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeGuestName("  김   손님 ")).toBe("김 손님");
  });

  it("rejects empty, duplicate and member names", () => {
    const guests = [{ name: "손님", mmr: 1000, mainLane: null, subLane: null }];
    expect(guestNameError("", guests, pool)).toBe("이름을 입력해 주세요.");
    expect(guestNameError("손님", guests, pool)).toBe("이미 추가한 이름입니다.");
    expect(guestNameError("가", guests, pool)).toBe("명단에 있는 이름입니다. 위에서 선택해 주세요.");
    expect(guestNameError("새손님", guests, pool)).toBeNull();
  });
});

describe("teamAverage", () => {
  it("averages seated ratings, guests included, rounded; null for an empty team", () => {
    const rows = buildCandidates(pool, ["a"], [{ name: "손님", mmr: 1001, mainLane: null, subLane: null }]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    let state = draftReducer(emptyDraft(), { type: "setCaptain", side: "blue", key: memberKey("a"), prefs: { mainLane: null, subLane: null } });
    state = draftReducer(state, { type: "setCaptain", side: "red", key: guestKey("손님"), prefs: { mainLane: null, subLane: null } });
    expect(teamAverage(state, "blue", byKey)).toBe(1100);
    expect(teamAverage(state, "red", byKey)).toBe(1001);
    expect(teamAverage(emptyDraft(), "blue", byKey)).toBeNull();
  });
});
```

`apps/dashboard/lib/draft/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { draftReducer, emptyDraft, seatOf } from "@lolpamin/core";
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft, type StoredDraft } from "./storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const none = { mainLane: null, subLane: null };

function sample(): StoredDraft {
  let draft = draftReducer(emptyDraft(), { type: "setCaptain", side: "blue", key: "m:a", prefs: none });
  draft = draftReducer(draft, { type: "setCaptain", side: "red", key: "g:손님", prefs: none });
  draft = draftReducer(draft, { type: "pick", key: "m:b", prefs: none });
  return { participantIds: ["a", "b"], guests: [{ name: "손님", mmr: 1000, mainLane: null, subLane: "SUP" }], draft };
}

describe("draft storage", () => {
  it("round-trips a saved draft", () => {
    const storage = memoryStorage();
    saveDraft(storage, sample());
    expect(loadDraft(storage, new Set(["a", "b"]))).toEqual(sample());
  });

  it("drops members that left the pool from the participants and their seats", () => {
    const storage = memoryStorage();
    saveDraft(storage, sample());
    const loaded = loadDraft(storage, new Set(["a"]))!;
    expect(loaded.participantIds).toEqual(["a"]);
    expect(seatOf(loaded.draft, "m:b")).toBeNull();
    expect(loaded.draft.picks).toEqual([]);
  });

  it("returns null for missing, broken or mis-shaped data", () => {
    expect(loadDraft(memoryStorage(), new Set())).toBeNull();
    expect(loadDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: "{not json" }), new Set())).toBeNull();
    expect(loadDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify({ participantIds: "a" }) }), new Set())).toBeNull();
    expect(loadDraft(null, new Set())).toBeNull();
  });

  it("never throws when the storage itself throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadDraft(hostile, new Set())).toBeNull();
    expect(() => saveDraft(hostile, sample())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/draft`
Expected: FAIL — `Failed to resolve import "./candidates"` / `"./storage"`.

- [ ] **Step 3: Implement**

`apps/dashboard/lib/draft/candidates.ts`:

```ts
import type { Lane } from "@lolpamin/db";
import { DRAFT_LANES, type DraftSide, type DraftState, type MasteryEntry } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";

// 명단에 없는 사람. 팀 짜기에만 쓰고 DB에는 쓰지 않는다 — 결과는 리플레이로만 들어온다.
export interface Guest {
  name: string;
  mmr: number;
  mainLane: Lane | null;
  subLane: Lane | null;
}

export const GUEST_DEFAULT_MMR = 1000;

export interface Candidate {
  key: string;
  isGuest: boolean;
  name: string;
  mmr: number;
  wins: number | null;
  losses: number | null;
  mainLane: Lane | null;
  subLane: Lane | null;
  riotId: string | null;
  extraAccounts: number;
  masteries: MasteryEntry[];
}

// 회원 id와 게스트 이름이 같은 문자열이어도 부딪히지 않게 접두어로 나눈다.
export function memberKey(id: string): string {
  return `m:${id}`;
}

export function guestKey(name: string): string {
  return `g:${name}`;
}

export function normalizeGuestName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function guestNameError(name: string, guests: Guest[], pool: DraftPoolMember[]): string | null {
  if (name === "") return "이름을 입력해 주세요.";
  if (guests.some((g) => g.name === name)) return "이미 추가한 이름입니다.";
  if (pool.some((m) => m.name === name)) return "명단에 있는 이름입니다. 위에서 선택해 주세요.";
  return null;
}

export function buildCandidates(pool: DraftPoolMember[], participantIds: string[], guests: Guest[]): Candidate[] {
  const selected = new Set(participantIds);
  const members: Candidate[] = pool
    .filter((m) => selected.has(m.id))
    .map((m) => ({
      key: memberKey(m.id),
      isGuest: false,
      name: m.name,
      mmr: m.mmr,
      wins: m.wins,
      losses: m.losses,
      mainLane: m.mainLane,
      subLane: m.subLane,
      riotId: m.riotId,
      extraAccounts: m.extraAccounts,
      masteries: m.masteries,
    }));
  const visitors: Candidate[] = guests.map((g) => ({
    key: guestKey(g.name),
    isGuest: true,
    name: g.name,
    mmr: g.mmr,
    wins: null,
    losses: null,
    mainLane: g.mainLane,
    subLane: g.subLane,
    riotId: null,
    extraAccounts: 0,
    masteries: [],
  }));
  return [...members, ...visitors].sort((a, b) => b.mmr - a.mmr || a.name.localeCompare(b.name, "ko"));
}

export function teamAverage(state: DraftState, side: DraftSide, byKey: Map<string, Candidate>): number | null {
  const ratings = DRAFT_LANES.map((lane) => state.slots[side][lane])
    .map((key) => (key === null ? undefined : byKey.get(key)))
    .filter((c): c is Candidate => c !== undefined)
    .map((c) => c.mmr);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}
```

`apps/dashboard/lib/draft/storage.ts`:

```ts
import {
  DRAFT_LANES,
  DRAFT_SIDES,
  draftReducer,
  isLane,
  seatOf,
  type DraftState,
} from "@lolpamin/core";
import { guestKey, memberKey, type Guest } from "./candidates";

// 탭을 닫으면 사라지는 게 맞다 — 어제 짠 팀이 남아 있으면 다음 판에 헷갈린다.
export const DRAFT_STORAGE_KEY = "lolpamin.draft.v1";

export interface StoredDraft {
  participantIds: string[];
  guests: Guest[];
  draft: DraftState;
}

const isKeyOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isLaneOrNull = (v: unknown) => v === null || isLane(v);

function isGuest(v: unknown): v is Guest {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.name === "string" && typeof g.mmr === "number" && Number.isFinite(g.mmr) && isLaneOrNull(g.mainLane) && isLaneOrNull(g.subLane);
}

function isDraftState(v: unknown): v is DraftState {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, any>;
  if (typeof d.captains !== "object" || d.captains === null) return false;
  if (typeof d.slots !== "object" || d.slots === null) return false;
  if (!Array.isArray(d.picks) || !d.picks.every((k: unknown) => typeof k === "string")) return false;
  return DRAFT_SIDES.every(
    (side) =>
      isKeyOrNull(d.captains[side]) &&
      typeof d.slots[side] === "object" &&
      d.slots[side] !== null &&
      DRAFT_LANES.every((lane) => isKeyOrNull(d.slots[side][lane])),
  );
}

/** 저장본을 읽고, 풀에서 사라진 회원을 참여자·좌석·픽에서 걷어낸다. 무엇이든 실패하면 null. */
export function loadDraft(
  storage: Pick<Storage, "getItem"> | null,
  validMemberIds: ReadonlySet<string>,
): StoredDraft | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.participantIds) || !parsed.participantIds.every((id) => typeof id === "string")) return null;
    if (!Array.isArray(parsed.guests) || !parsed.guests.every(isGuest)) return null;
    if (!isDraftState(parsed.draft)) return null;

    const participantIds = (parsed.participantIds as string[]).filter((id) => validMemberIds.has(id));
    const guests = parsed.guests as Guest[];
    const validKeys = new Set([...participantIds.map(memberKey), ...guests.map((g) => guestKey(g.name))]);

    let draft = parsed.draft;
    for (const side of DRAFT_SIDES) {
      for (const lane of DRAFT_LANES) {
        const key = draft.slots[side][lane];
        if (key !== null && !validKeys.has(key)) draft = draftReducer(draft, { type: "removeParticipant", key });
      }
    }
    // 좌석에 없는 픽(손상된 저장본)은 되돌리기를 헛돌게 하니 버린다.
    draft = { ...draft, picks: draft.picks.filter((k) => seatOf(draft, k) !== null) };

    return { participantIds, guests, draft };
  } catch {
    return null;
  }
}

export function saveDraft(storage: Pick<Storage, "setItem"> | null, value: StoredDraft): void {
  if (storage === null) return;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 사생활 모드·저장소 차단: 보존만 포기하고 화면은 계속 동작한다.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/draft`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/draft
git commit -m "feat(draft): candidates, guests and session persistence"
```

---

### Task 9: 드래프트 화면 교체

**Files:**
- Create: `apps/dashboard/components/draft/dnd.ts`
- Create: `apps/dashboard/components/draft/DraftBoard.tsx`
- Create: `apps/dashboard/components/draft/ParticipantPicker.tsx`
- Create: `apps/dashboard/components/draft/CandidateTable.tsx`
- Create: `apps/dashboard/components/draft/TurnBanner.tsx`
- Create: `apps/dashboard/components/draft/EntryBoard.tsx`
- Modify: `apps/dashboard/components/MmrSimulator.tsx`
- Modify: `apps/dashboard/app/matches/page.tsx`
- Delete: `apps/dashboard/app/matches/actions.ts`
- Modify: `apps/dashboard/components/AppShell.tsx:80`
- Delete: `apps/dashboard/components/MatchBuilder.tsx`

**Interfaces:**
- Consumes: 모든 이전 Task의 export. `championIdByKey`, `championIcon`, `championName` from `@/lib/ddragon/assets`. `LANE_OPTIONS`, `laneLabel` from `@lolpamin/core`. `getDraftPool` (Task 7). 숙련도 갱신 버튼·액션은 이 Task에 **없다** — 버튼은 다른 화면에 따로 만든다(Task 6의 mutation은 그쪽이 쓴다).
- Produces: `MmrSimulator` 새 옵션 prop `blueAverage?: number | null`, `redAverage?: number | null`.

`saveGameResult`(`lib/mutations/save-game-result.ts`)는 **고치지 않는다.** `saveReplayImport`가 `saveGameResultTx`를 쓰고, 래퍼 `saveGameResult`는 수많은 통합 테스트의 진입점이다. 이 Task가 끝나면 앱 코드에서 래퍼를 부르는 곳은 없어지지만 테스트용으로 남긴다.

이 Task는 UI라 자동 테스트 대신 Step 7의 수동 점검과 `tsc`로 확인한다.

- [ ] **Step 1: 결과 입력 제거**

```bash
git rm apps/dashboard/components/MatchBuilder.tsx
```

```bash
git rm apps/dashboard/app/matches/actions.ts
```

경기 결과는 더 이상 `/matches`에서 입력하지 않는다 — `/replay-import`가 유일한 경로다. 이 화면에는 서버 액션이 남지 않는다.

`AppShell.tsx:80`:

```tsx
      { key: "matches", href: "/matches", label: "팀 드래프트", icon: "crown" },
```

- [ ] **Step 2: MmrSimulator가 평균을 받게**

`components/MmrSimulator.tsx`:
- import를 `import { useEffect, useState } from "react";`로.
- 시그니처와 효과:

```tsx
export function MmrSimulator({
  config,
  blueAverage = null,
  redAverage = null,
}: {
  config: MmrConfig;
  // 드래프트 엔트리의 팀 평균. 바뀔 때마다 입력칸을 덮는다 — 손으로 고친 값은 다음 변경까지만 산다.
  blueAverage?: number | null;
  redAverage?: number | null;
}) {
  const [blueRaw, setBlueRaw] = useState(String(blueAverage ?? DEFAULT_BLUE));
  const [redRaw, setRedRaw] = useState(String(redAverage ?? DEFAULT_RED));

  useEffect(() => {
    if (blueAverage !== null) setBlueRaw(String(blueAverage));
  }, [blueAverage]);
  useEffect(() => {
    if (redAverage !== null) setRedRaw(String(redAverage));
  }, [redAverage]);
```

(나머지 본문은 그대로.)

- [ ] **Step 3: 드래그 페이로드 헬퍼**

`apps/dashboard/components/draft/dnd.ts`:

```ts
import type { DragEvent } from "react";
import type { SlotRef } from "@lolpamin/core";

// 다른 앱에서 끌어온 텍스트·파일을 무시하려고 전용 MIME을 쓴다.
const DRAG_TYPE = "application/x-lolpamin-draft";

export type DragPayload = { kind: "bench"; key: string } | { kind: "slot"; from: SlotRef };

export function setDragPayload(event: DragEvent, payload: DragPayload): void {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
}

export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_TYPE);
  if (raw === "") return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

// dragover에서 preventDefault를 해야 drop이 온다. 우리 페이로드일 때만 받는다.
export function acceptDrag(event: DragEvent): void {
  if (event.dataTransfer.types.includes(DRAG_TYPE)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
}
```

- [ ] **Step 4: 참여자 선택 + 게스트**

`apps/dashboard/components/draft/ParticipantPicker.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { guestNameError, normalizeGuestName, type Guest } from "@/lib/draft/candidates";

export function ParticipantPicker({
  pool,
  selectedIds,
  guests,
  onToggle,
  onAddGuest,
  onRemoveGuest,
}: {
  pool: DraftPoolMember[];
  selectedIds: string[];
  guests: Guest[];
  onToggle: (id: string) => void;
  onAddGuest: (name: string) => void;
  onRemoveGuest: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [guestInput, setGuestInput] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);

  const selected = new Set(selectedIds);
  const visible = [...pool]
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .filter((m) => query === "" || m.name.toLowerCase().includes(query.toLowerCase()));

  function addGuest() {
    const name = normalizeGuestName(guestInput);
    const error = guestNameError(name, guests, pool);
    setGuestError(error);
    if (error !== null) return;
    onAddGuest(name);
    setGuestInput("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[14px] font-bold">참여자 선택</h2>
        <span className="text-[12px] text-faint">
          {selectedIds.length + guests.length}명 선택
        </span>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 검색"
        className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
      />
      <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-6 xl:grid-cols-8">
        {visible.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] ${
              selected.has(m.id) ? "border-accent/40 bg-accent/10 text-fg" : "border-ink/[.08] text-muted"
            }`}
          >
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => onToggle(m.id)} className="accent-[rgb(var(--c-accent))]" />
            <span className="truncate">{m.name}</span>
          </label>
        ))}
        {guests.map((g) => (
          <div key={g.name} className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[13px]">
            <span className="rounded bg-ink/[.08] px-1 text-[10.5px] font-bold text-muted">게스트</span>
            <span className="flex-1 truncate">{g.name}</span>
            <button onClick={() => onRemoveGuest(g.name)} className="text-faint" aria-label={`${g.name} 제거`}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={guestInput}
          onChange={(e) => setGuestInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addGuest();
          }}
          placeholder="명단에 없는 사람 이름 추가"
          className="flex-1 rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
        />
        <button onClick={addGuest} className="rounded-lg border border-ink/[.12] px-3 text-[12.5px] font-bold">
          추가
        </button>
      </div>
      {guestError && <div className="text-[12px] text-danger-soft">{guestError}</div>}
    </section>
  );
}
```

- [ ] **Step 5: 후보 표·차례 배너·엔트리**

`apps/dashboard/components/draft/CandidateTable.tsx`:

```tsx
"use client";

import type { Lane } from "@lolpamin/db";
import { isCaptain, LANE_OPTIONS, laneLabel, seatOf, type DraftSide, type DraftState } from "@lolpamin/core";
import { championIcon, championIdByKey, championName } from "@/lib/ddragon/assets";
import type { Candidate, Guest } from "@/lib/draft/candidates";
import { setDragPayload } from "./dnd";

const GRID = "grid grid-cols-[28px_120px_1.2fr_150px_40px_40px_56px_56px_56px_64px_150px] items-center gap-2";

function MasteryIcons({ candidate }: { candidate: Candidate }) {
  if (candidate.masteries.length === 0) return <span className="text-ghost">—</span>;
  return (
    <div className="flex gap-1.5">
      {candidate.masteries.map((m) => {
        const id = championIdByKey(m.championId);
        const icon = id ? championIcon(id) : null;
        return (
          <div key={m.championId} className="flex items-center gap-0.5" title={id ? championName(id) : undefined}>
            {icon ? (
              <img src={icon} alt="" width={24} height={24} className="rounded" />
            ) : (
              <span className="inline-block h-6 w-6 rounded bg-ink/[.08]" />
            )}
            <span className="font-mono text-[11px] text-muted">x{m.level}</span>
          </div>
        );
      })}
    </div>
  );
}

function LaneSelect({ value, onChange }: { value: Lane | null; onChange: (lane: Lane | null) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as Lane))}
      className="w-full rounded border border-ink/[.09] bg-inset px-1 py-0.5 text-[12px] text-fg"
    >
      <option value="">-</option>
      {LANE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CandidateTable({
  candidates,
  draft,
  turn,
  onSetCaptain,
  onPick,
  onGuestChange,
}: {
  candidates: Candidate[];
  draft: DraftState;
  turn: DraftSide | null;
  onSetCaptain: (side: DraftSide, candidate: Candidate) => void;
  onPick: (candidate: Candidate) => void;
  onGuestChange: (name: string, patch: Partial<Omit<Guest, "name">>) => void;
}) {
  const captainsReady = draft.captains.blue !== null && draft.captains.red !== null;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-ink/[.06] bg-surface px-4 py-3.5">
      <h2 className="m-0 text-[14px] font-bold">후보 선수</h2>
      <div className={`${GRID} border-b border-ink/[.06] pb-1.5 text-[11.5px] font-bold text-faint`}>
        <span>#</span>
        <span>이름</span>
        <span>Riot ID</span>
        <span>숙련 챔피언</span>
        <span className="text-right">승</span>
        <span className="text-right">패</span>
        <span className="text-right">MMR</span>
        <span>주라인</span>
        <span>부라인</span>
        <span>팀</span>
        <span />
      </div>
      {candidates.length === 0 && <div className="py-6 text-center text-[13px] text-faint">위에서 참여자를 선택하세요.</div>}
      {candidates.map((c, index) => {
        const seat = seatOf(draft, c.key);
        const tone = seat?.side === "blue" ? "bg-accent/10" : seat?.side === "red" ? "bg-danger/10" : "";
        return (
          <div
            key={c.key}
            draggable={seat === null}
            onDragStart={(e) => setDragPayload(e, { kind: "bench", key: c.key })}
            className={`${GRID} rounded-md px-1 py-1.5 text-[13px] ${tone} ${seat === null ? "cursor-grab" : ""}`}
          >
            <span className="font-mono text-faint">{index + 1}</span>
            <span className="truncate font-bold">
              {isCaptain(draft, c.key) && <span title="팀장">👑 </span>}
              {c.name}
              {c.isGuest && <span className="ml-1 text-[10.5px] font-normal text-faint">게스트</span>}
            </span>
            <span className="truncate font-mono text-[12px] text-muted">
              {c.riotId ?? "—"}
              {c.extraAccounts > 0 && <span className="text-faint"> +{c.extraAccounts}</span>}
            </span>
            <MasteryIcons candidate={c} />
            <span className="text-right font-mono text-success-soft">{c.wins ?? "—"}</span>
            <span className="text-right font-mono text-danger-soft">{c.losses ?? "—"}</span>
            {c.isGuest ? (
              <input
                type="number"
                step={10}
                value={c.mmr}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) onGuestChange(c.name, { mmr: value });
                }}
                className="w-full rounded border border-ink/[.09] bg-inset px-1 py-0.5 text-right font-mono text-[12px] text-fg"
              />
            ) : (
              <span className="text-right font-mono font-bold">{c.mmr}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.mainLane} onChange={(lane) => onGuestChange(c.name, { mainLane: lane })} />
            ) : (
              <span>{laneLabel(c.mainLane)}</span>
            )}
            {c.isGuest ? (
              <LaneSelect value={c.subLane} onChange={(lane) => onGuestChange(c.name, { subLane: lane })} />
            ) : (
              <span>{laneLabel(c.subLane)}</span>
            )}
            <span
              className={`rounded border px-1.5 py-0.5 text-center text-[11.5px] font-bold ${
                seat?.side === "blue"
                  ? "border-accent/50 text-accent-soft"
                  : seat?.side === "red"
                    ? "border-danger/50 text-danger-soft"
                    : "border-ink/[.12] text-faint"
              }`}
            >
              {seat?.side === "blue" ? "블루" : seat?.side === "red" ? "레드" : "미배정"}
            </span>
            <div className="flex gap-1">
              {seat === null && !captainsReady && (
                <>
                  {draft.captains.blue === null && (
                    <button onClick={() => onSetCaptain("blue", c)} className="rounded border border-accent/50 px-1.5 py-0.5 text-[11.5px] font-bold text-accent-soft">
                      블루 팀장
                    </button>
                  )}
                  {draft.captains.red === null && (
                    <button onClick={() => onSetCaptain("red", c)} className="rounded border border-danger/50 px-1.5 py-0.5 text-[11.5px] font-bold text-danger-soft">
                      레드 팀장
                    </button>
                  )}
                </>
              )}
              {seat === null && turn !== null && (
                <button
                  onClick={() => onPick(c)}
                  className={`rounded px-2 py-0.5 text-[11.5px] font-bold text-white ${turn === "blue" ? "bg-accent" : "bg-danger"}`}
                >
                  뽑기
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

`apps/dashboard/components/draft/TurnBanner.tsx`:

```tsx
"use client";

import { DRAFT_PICK_COUNT, draftPickCount, isDraftComplete, type DraftSide, type DraftState } from "@lolpamin/core";
import type { Candidate } from "@/lib/draft/candidates";

const SIDE_LABEL: Record<DraftSide, string> = { blue: "블루", red: "레드" };

export function TurnBanner({
  draft,
  turn,
  byKey,
  onUndo,
  onReset,
}: {
  draft: DraftState;
  turn: DraftSide | null;
  byKey: Map<string, Candidate>;
  onUndo: () => void;
  onReset: () => void;
}) {
  let text: string;
  if (draft.captains.blue === null || draft.captains.red === null) {
    text = "후보 표에서 블루 팀장과 레드 팀장을 지정하세요.";
  } else if (isDraftComplete(draft)) {
    text = "드래프트 완료";
  } else if (turn !== null) {
    const captain = byKey.get(draft.captains[turn]!)?.name ?? "";
    text = `${SIDE_LABEL[turn]} 팀장 ${captain} 차례 · ${draftPickCount(draft) + 1}/${DRAFT_PICK_COUNT}픽`;
  } else {
    text = "";
  }

  const tone = turn === "blue" ? "border-accent/50 bg-accent/10" : turn === "red" ? "border-danger/50 bg-danger/10" : "border-ink/[.08] bg-surface";

  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${tone}`}>
      <span className="text-[15px] font-extrabold">{text}</span>
      <div className="flex gap-2">
        <button onClick={onUndo} className="rounded-md border border-ink/[.12] px-2.5 py-1 text-[12px] text-muted">
          되돌리기
        </button>
        <button onClick={onReset} className="rounded-md border border-ink/[.12] px-2.5 py-1 text-[12px] text-faint">
          초기화
        </button>
      </div>
    </div>
  );
}
```

`apps/dashboard/components/draft/EntryBoard.tsx`:

```tsx
"use client";

import { DRAFT_LANES, DRAFT_SIDES, isCaptain, laneLabel, type DraftSide, type DraftState, type SlotRef } from "@lolpamin/core";
import type { Candidate } from "@/lib/draft/candidates";
import { acceptDrag, readDragPayload, setDragPayload, type DragPayload } from "./dnd";

const HEAD: Record<DraftSide, { label: string; text: string; cell: string }> = {
  blue: { label: "BLUE", text: "text-accent-soft", cell: "bg-accent/10" },
  red: { label: "RED", text: "text-danger-soft", cell: "bg-danger/10" },
};

export function EntryBoard({
  draft,
  byKey,
  averages,
  onDrop,
}: {
  draft: DraftState;
  byKey: Map<string, Candidate>;
  averages: Record<DraftSide, number | null>;
  onDrop: (payload: DragPayload, to: SlotRef) => void;
}) {
  const count = (side: DraftSide) => DRAFT_LANES.filter((lane) => draft.slots[side][lane] !== null).length;

  return (
    <section className="grid grid-cols-[64px_1fr_1fr] gap-2">
      <div />
      {DRAFT_SIDES.map((side) => (
        <div key={side} className={`rounded-xl px-4 py-2.5 ${HEAD[side].cell}`}>
          <div className={`text-[13px] font-extrabold ${HEAD[side].text}`}>
            {HEAD[side].label} {count(side)}/5
          </div>
          <div className="text-[12px] text-muted">평균 MMR {averages[side] ?? "—"}</div>
        </div>
      ))}
      {DRAFT_LANES.map((lane) => (
        <div key={lane} className="contents">
          <div className="flex items-center justify-center rounded-lg bg-inset text-[13px] font-extrabold">{laneLabel(lane)}</div>
          {DRAFT_SIDES.map((side) => {
            const key = draft.slots[side][lane];
            const candidate = key === null ? undefined : byKey.get(key);
            return (
              <div
                key={side}
                onDragOver={acceptDrag}
                onDrop={(e) => {
                  e.preventDefault();
                  const payload = readDragPayload(e);
                  if (payload !== null) onDrop(payload, { side, lane });
                }}
                draggable={candidate !== undefined}
                onDragStart={(e) => setDragPayload(e, { kind: "slot", from: { side, lane } })}
                className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 ${HEAD[side].cell} ${
                  candidate ? "cursor-grab" : ""
                }`}
              >
                {candidate ? (
                  <>
                    <span className="text-[13.5px] font-bold">
                      {isCaptain(draft, candidate.key) && <span title="팀장">👑 </span>}
                      {candidate.name}
                    </span>
                    <span className="font-mono text-[12px] text-muted">{candidate.mmr}</span>
                  </>
                ) : (
                  <span className="text-[12px] text-ghost">비어 있음</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: DraftBoard와 페이지**

`apps/dashboard/components/draft/DraftBoard.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { currentTurn, draftReducer, emptyDraft, type DraftAction, type DraftSide, type DraftState, type MmrConfig, type SlotRef } from "@lolpamin/core";
import type { DraftPoolMember } from "@/lib/queries/draft-pool";
import { buildCandidates, GUEST_DEFAULT_MMR, guestKey, memberKey, teamAverage, type Candidate, type Guest } from "@/lib/draft/candidates";
import { loadDraft, saveDraft } from "@/lib/draft/storage";
import { MmrSimulator } from "@/components/MmrSimulator";
import { ParticipantPicker } from "./ParticipantPicker";
import { CandidateTable } from "./CandidateTable";
import { TurnBanner } from "./TurnBanner";
import { EntryBoard } from "./EntryBoard";
import type { DragPayload } from "./dnd";

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function DraftBoard({
  pool,
  config,
}: {
  pool: DraftPoolMember[];
  config: MmrConfig;
}) {
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  // 서버 렌더와 첫 클라이언트 렌더를 맞추려고 저장본은 마운트 뒤에 읽는다. 읽기 전에
  // 저장하면 빈 상태가 저장본을 덮으므로 읽은 뒤에만 쓴다.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadDraft(sessionStore(), new Set(pool.map((m) => m.id)));
    if (stored !== null) {
      setParticipantIds(stored.participantIds);
      setGuests(stored.guests);
      setDraft(stored.draft);
    }
    setHydrated(true);
    // 풀은 서버가 준 값이라 첫 마운트 기준으로 충분하다.
  }, []);

  useEffect(() => {
    if (hydrated) saveDraft(sessionStore(), { participantIds, guests, draft });
  }, [hydrated, participantIds, guests, draft]);

  const candidates = useMemo(() => buildCandidates(pool, participantIds, guests), [pool, participantIds, guests]);
  const byKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates]);
  const turn = currentTurn(draft);
  const averages: Record<DraftSide, number | null> = {
    blue: teamAverage(draft, "blue", byKey),
    red: teamAverage(draft, "red", byKey),
  };

  const apply = (action: DraftAction) => setDraft((state) => draftReducer(state, action));
  const prefsOf = (c: Candidate) => ({ mainLane: c.mainLane, subLane: c.subLane });

  function toggleParticipant(id: string) {
    if (participantIds.includes(id)) {
      setParticipantIds(participantIds.filter((x) => x !== id));
      apply({ type: "removeParticipant", key: memberKey(id) });
    } else {
      setParticipantIds([...participantIds, id]);
    }
  }

  function removeGuest(name: string) {
    setGuests(guests.filter((g) => g.name !== name));
    apply({ type: "removeParticipant", key: guestKey(name) });
  }

  function handleDrop(payload: DragPayload, to: SlotRef) {
    if (payload.kind === "bench") apply({ type: "dropFromBench", key: payload.key, to });
    else apply({ type: "move", from: payload.from, to });
  }

  return (
    <div className="flex flex-col gap-4">
      <ParticipantPicker
        pool={pool}
        selectedIds={participantIds}
        guests={guests}
        onToggle={toggleParticipant}
        onAddGuest={(name) => setGuests([...guests, { name, mmr: GUEST_DEFAULT_MMR, mainLane: null, subLane: null }])}
        onRemoveGuest={removeGuest}
      />
      <CandidateTable
        candidates={candidates}
        draft={draft}
        turn={turn}
        onSetCaptain={(side, c) => apply({ type: "setCaptain", side, key: c.key, prefs: prefsOf(c) })}
        onPick={(c) => apply({ type: "pick", key: c.key, prefs: prefsOf(c) })}
        onGuestChange={(name, patch) => setGuests(guests.map((g) => (g.name === name ? { ...g, ...patch } : g)))}
      />
      <TurnBanner
        draft={draft}
        turn={turn}
        byKey={byKey}
        onUndo={() => apply({ type: "undo" })}
        onReset={() => apply({ type: "reset" })}
      />
      <EntryBoard draft={draft} byKey={byKey} averages={averages} onDrop={handleDrop} />
      <MmrSimulator config={config} blueAverage={averages.blue} redAverage={averages.red} />
    </div>
  );
}
```

`apps/dashboard/app/matches/page.tsx` 전체 교체:

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DraftBoard } from "@/components/draft/DraftBoard";
import { getDraftPool } from "@/lib/queries/draft-pool";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getMmrConfig } from "@/lib/queries/mmr-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const currentAdmin = await getCurrentAdmin();
  if (!currentAdmin) {
    redirect("/login");
  }

  const [pool, mmrConfig] = await Promise.all([getDraftPool(prisma), getMmrConfig(prisma)]);

  return (
    <AppShell activeNav="matches" pageTitle="팀 드래프트" pageDesc="팀장이 스네이크 순서로 팀원을 뽑습니다" desktopOnly>
      <div className="px-7 pb-10 pt-6">
        <DraftBoard pool={pool} config={mmrConfig} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: 타입 검사·테스트·수동 점검**

```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: 에러 0. (`MatchBuilder`·`saveGameResultAction` 참조가 남아 있으면 여기서 드러난다 — 전부 지운다.)

```bash
npm test
```
Expected: 모든 워크스페이스 PASS.

`npm run dev --workspace=dashboard` 후 관리자로 `/matches`에서 확인:
1. 사이드바 "팀 드래프트", 참여자는 전부 해제로 시작.
2. 11명 체크 + 게스트 1명 추가(빈 이름·중복·회원 이름은 오류 문구). 후보 표가 MMR 내림차순, 게스트 MMR·라인 입력 가능.
3. [블루 팀장] → [레드 팀장] 지정 → 배너 "블루 팀장 ○○○ 차례 · 1/8픽".
4. [뽑기]로 B R R B B R R B 순서가 도는지, 행이 팀 색으로 칠해지는지, 주라인 칸에 앉는지.
5. 차례가 아닌 팀 칸으로 후보를 끌면 무시. 같은 팀 안에서 칸끼리 끌면 맞바꿈. 드래프트 중 팀 간 이동은 무시.
6. 뽑힌 사람의 체크를 풀면 칸이 비고 차례가 그 팀으로 돌아옴. 팀장 체크를 풀면 전체 초기화.
7. 완료 후 11번째 사람을 엔트리 칸에 끌면 교체, 팀 간 맞바꿈 가능.
8. 시뮬레이터 블루/레드 평균이 엔트리 변경마다 따라오고 손으로 고칠 수 있음.
9. 새로고침해도 상태 유지, 탭을 닫았다 열면 초기화.
10. 숙련도 행이 있는 회원은 초상화와 `xN`, 없는 회원·게스트는 `—`. 스킨 3종(clean/pink/dark)에서 색 확인.

- [ ] **Step 8: Commit**

```bash
git add -A apps/dashboard/components apps/dashboard/app/matches
git commit -m "feat(matches): replace result entry with captain snake draft"
```

---

### Task 10: 문서 갱신

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md 수정**

1. `## What this is`의 dashboard 설명에서 `match entry`를 `captain team draft`로 바꾼다.
2. `/match-history` 단락 바로 앞에 새 단락:

```markdown
`/matches` is the **team draft**, not result entry — results come in only through
`/replay-import`, so a game without a replay cannot be recorded. Two captains (agreed
by the players, set by an admin) pick the other eight in snake order `B R R B B R R B`,
blue first. The rules live in `packages/core/src/draft.ts`; the turn is derived from
per-team seat counts rather than the pick list, so unchecking a picked participant hands
the turn back, and cross-team moves are refused until the draft completes. Guests exist
only in the browser (name, hand-typed MMR and lanes) and count in the team averages.
Nothing is saved: state lives in `sessionStorage` (`lolpamin.draft.v1`).

Candidates show combined champion mastery: `ChampionMastery` caches Riot
Champion-Mastery-V4 per `RiotAccount` (cascade on delete), refreshed by
`refreshChampionMasteries` at most once per 24h (`SiteSetting.masteryRefreshedAt`, same
rules as the Riot ID refresh). It has no UI trigger yet — the button is planned for another
screen, not `/matches`. Points add up across a member's accounts and the highest level stands for the
champion (`topMasteries`). The API names champions by numeric key, mapped through
`ddragon-map.json`'s `championKeys`.
```

3. `saveGameResult`의 "디코 AND 카톡" 규칙을 설명하는 문장들은 그대로 둔다(리플레이 저장이 여전히 그 규칙을 거친다).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the /matches team draft and mastery cache"
```
