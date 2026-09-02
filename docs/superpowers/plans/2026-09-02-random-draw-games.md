# 랜덤 뽑기 그래픽 게임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계정이 연결된 회원(또는 숫자 범위)을 비복원으로 한 명씩 뽑는 그래픽 추첨 페이지 두 개(06 공 뽑기, 07 핀볼)를 대시보드에 추가한다.

**Architecture:** 비복원 추출 규칙은 `packages/core`의 순수 상태머신 한 벌로 두고, 게임별로 다른 것은 캔버스 렌더러 파일뿐이다. 당첨자는 버튼을 누른 순간 `crypto` 기반 균등 추출로 확정되고, 캔버스는 확정된 결과를 재생만 한다. 상태는 브라우저 메모리에만 있고 DB를 건드리지 않는다.

**Tech Stack:** Next.js 14 App Router, React 18 클라이언트 컴포넌트, Canvas 2D + `requestAnimationFrame`, Tailwind, vitest. 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-02-random-draw-games-design.md`

> **구현 중 변경 2 (2026-09-02):** Task 6의 로또 드럼(`BallLotteryCanvas`)은 **대포 뽑기**(`components/draw/CannonCanvas.tsx`)로 교체됐다. 경로 `/draw/cannon`, 라벨 「대포 뽑기」, `variant="cannon"`. 당첨자 확정 방식은 그대로다.
>
> **구현 중 변경 (2026-09-02):** Task 3·7의 유도형 플린코는 **matter.js 실물리 구슬 레이스**로 대체됐다(스펙의 「설계 변경」절 참고). `lib/draw/plinko-path.ts`는 삭제됐고, 코스는 `lib/draw/marble-course.ts` + `components/draw/MarbleRaceCanvas.tsx`에 있다. 07에서는 물리가 승자를 정하고 `drawById()`로 상태에 커밋한다.

## Global Constraints

- 새 npm 의존성을 추가하지 않는다. 물리엔진·애니메이션 라이브러리 금지.
- UI 문구·메뉴 라벨은 한국어, 코드·식별자·주석·커밋 메시지는 영어 (리포 규칙).
- 도메인 로직은 `packages/core`에 순수 함수 + 단위테스트로 둔다. 이번 기능은 DB 쓰기가 없다.
- AppShell을 렌더링하는 모든 페이지는 `export const dynamic = "force-dynamic"`를 선언한다.
- 새 대시보드 테스트는 전부 순수 함수 대상이라 DB를 건드리지 않는다. 따라서 `DATABASE_URL_TEST` 가드를 넣지 않는다 (가드는 DB를 만지는 테스트 파일 규칙이다). 새 테스트 파일에서 `prisma`를 import 하지 말 것.
- 추첨 결과를 DB에 저장하지 않는다. Prisma 스키마를 수정하지 않는다.
- 워크스페이스 패키지는 소스 그대로 소비된다. `packages/core`에 파일을 추가하면 `packages/core/src/index.ts`에 re-export 해야 대시보드에서 import 된다.
- 테스트 실행: `npm test --workspace=@lolpamin/core`, `npm test --workspace=dashboard`. 단일 파일은 해당 워크스페이스 디렉터리에서 `npx vitest run <file>`.

---

## File Structure

**생성:**

| 파일 | 책임 |
|---|---|
| `packages/core/src/draw.ts` | 비복원 추출 상태머신 (순수) |
| `packages/core/src/draw.test.ts` | 위 단위테스트 |
| `apps/dashboard/lib/draw/random.ts` | `crypto` 기반 균등 인덱스 추출 |
| `apps/dashboard/lib/draw/random.test.ts` | 범위·예외 테스트 |
| `apps/dashboard/lib/draw/candidates.ts` | 회원/숫자/수동입력 → `DrawCandidate` 변환·검증 |
| `apps/dashboard/lib/draw/candidates.test.ts` | 위 단위테스트 |
| `apps/dashboard/lib/draw/plinko-path.ts` | 목표 슬롯에 도달하는 좌/우 시퀀스 생성 |
| `apps/dashboard/lib/draw/plinko-path.test.ts` | 위 단위테스트 |
| `apps/dashboard/lib/draw/bgm.ts` | 디렉터리 파일명 목록 → 트랙 목록 |
| `apps/dashboard/lib/draw/bgm.test.ts` | 위 단위테스트 |
| `apps/dashboard/app/api/bgm/route.ts` | `public/bgm` 목록 API |
| `apps/dashboard/app/draw/ball/page.tsx` | 06 페이지 (서버) |
| `apps/dashboard/app/draw/plinko/page.tsx` | 07 페이지 (서버) |
| `apps/dashboard/components/draw/animator.ts` | `DrawAnimator` 인터페이스 |
| `apps/dashboard/components/draw/DrawScreen.tsx` | 오케스트레이터 (클라이언트) |
| `apps/dashboard/components/draw/CandidateSetup.tsx` | 후보 구성 UI |
| `apps/dashboard/components/draw/DrawControls.tsx` | 뽑기·되돌리기·리셋·스킵 |
| `apps/dashboard/components/draw/ResultList.tsx` | 뽑힌 순서 목록 |
| `apps/dashboard/components/draw/PickSpotlight.tsx` | 캔버스 없이 동작하는 텍스트 폴백 |
| `apps/dashboard/components/draw/BallLotteryCanvas.tsx` | 06 연출 |
| `apps/dashboard/components/draw/PlinkoCanvas.tsx` | 07 연출 |
| `apps/dashboard/components/draw/BgmPlayer.tsx` | BGM 재생 UI |
| `apps/dashboard/public/bgm/*.mp3` | 루트 `BGM/`에서 이동 |

**수정:**

- `packages/core/src/index.ts` — `export * from "./draw";`
- `apps/dashboard/components/AppShell.tsx` — activeNav 유니온에 두 키 추가, navItems에 06·07 추가, 조건부 `admins` 항목의 아이콘을 `06` → `08`로 변경

---

### Task 1: 비복원 추출 상태머신 (core)

**Files:**
- Create: `packages/core/src/draw.ts`
- Test: `packages/core/src/draw.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `DrawCandidate { id: string; label: string }`, `DrawState { candidates: DrawCandidate[]; drawnIds: string[] }`, `createDrawState(candidates: DrawCandidate[]): DrawState`, `remainingCandidates(state: DrawState): DrawCandidate[]`, `drawnCandidates(state: DrawState): DrawCandidate[]`, `drawNext(state: DrawState, nextIndex: (n: number) => number): { state: DrawState; picked: DrawCandidate } | null`, `undoDraw(state: DrawState): DrawState`, `resetDraw(state: DrawState): DrawState`

- [ ] **Step 1: Write the failing test**

`packages/core/src/draw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createDrawState,
  drawNext,
  drawnCandidates,
  remainingCandidates,
  resetDraw,
  undoDraw,
  type DrawCandidate,
} from "./draw";

const people: DrawCandidate[] = [
  { id: "a", label: "박병준" },
  { id: "b", label: "김철수" },
  { id: "c", label: "이영희" },
];

const alwaysFirst = () => 0;
const alwaysLast = (n: number) => n - 1;

describe("createDrawState", () => {
  it("starts with every candidate remaining and nothing drawn", () => {
    const state = createDrawState(people);
    expect(remainingCandidates(state)).toEqual(people);
    expect(drawnCandidates(state)).toEqual([]);
  });
});

describe("drawNext", () => {
  it("never draws the same candidate twice", () => {
    let state = createDrawState(people);
    const picked: string[] = [];
    for (let i = 0; i < people.length; i++) {
      const result = drawNext(state, alwaysFirst)!;
      state = result.state;
      picked.push(result.picked.id);
    }
    expect(new Set(picked).size).toBe(people.length);
  });

  it("removes the picked candidate from the remaining pool", () => {
    const { state, picked } = drawNext(createDrawState(people), alwaysFirst)!;
    expect(picked.id).toBe("a");
    expect(remainingCandidates(state).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("records draw order", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysLast)!.state;
    state = drawNext(state, alwaysLast)!.state;
    expect(drawnCandidates(state).map((c) => c.id)).toEqual(["c", "b"]);
  });

  it("passes the remaining count to nextIndex", () => {
    const seen: number[] = [];
    const spy = (n: number) => {
      seen.push(n);
      return 0;
    };
    let state = createDrawState(people);
    state = drawNext(state, spy)!.state;
    state = drawNext(state, spy)!.state;
    expect(seen).toEqual([3, 2]);
  });

  it("returns null when the pool is empty", () => {
    let state = createDrawState(people);
    for (let i = 0; i < people.length; i++) state = drawNext(state, alwaysFirst)!.state;
    expect(drawNext(state, alwaysFirst)).toBeNull();
  });

  it("returns null for a state built from no candidates", () => {
    expect(drawNext(createDrawState([]), alwaysFirst)).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = createDrawState(people);
    drawNext(state, alwaysFirst);
    expect(state.drawnIds).toEqual([]);
  });
});

describe("undoDraw", () => {
  it("restores only the most recent pick", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = drawNext(state, alwaysFirst)!.state;
    const undone = undoDraw(state);
    expect(drawnCandidates(undone).map((c) => c.id)).toEqual(["a"]);
    expect(remainingCandidates(undone).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("restores the candidate to its original position, not the end", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    expect(remainingCandidates(undoDraw(state)).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when nothing has been drawn", () => {
    const state = createDrawState(people);
    expect(undoDraw(state)).toEqual(state);
  });

  it("makes an undone candidate drawable again", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = undoDraw(state);
    expect(drawNext(state, alwaysFirst)!.picked.id).toBe("a");
  });
});

describe("resetDraw", () => {
  it("restores every candidate", () => {
    let state = createDrawState(people);
    state = drawNext(state, alwaysFirst)!.state;
    state = drawNext(state, alwaysFirst)!.state;
    const reset = resetDraw(state);
    expect(remainingCandidates(reset)).toEqual(people);
    expect(drawnCandidates(reset)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/draw.test.ts`
Expected: FAIL — `Failed to resolve import "./draw"`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/draw.ts`:

```ts
export interface DrawCandidate {
  id: string;
  label: string;
}

// The pool is stored as a fixed candidate list plus a stack of drawn ids rather
// than as two mutable arrays. Undo is then a pop, an undone candidate returns to
// its original position instead of the end of the list, and the undo depth is
// naturally unlimited.
export interface DrawState {
  candidates: DrawCandidate[];
  drawnIds: string[];
}

export function createDrawState(candidates: DrawCandidate[]): DrawState {
  return { candidates: [...candidates], drawnIds: [] };
}

export function remainingCandidates(state: DrawState): DrawCandidate[] {
  const drawn = new Set(state.drawnIds);
  return state.candidates.filter((c) => !drawn.has(c.id));
}

export function drawnCandidates(state: DrawState): DrawCandidate[] {
  const byId = new Map(state.candidates.map((c) => [c.id, c]));
  return state.drawnIds.map((id) => byId.get(id)!);
}

// nextIndex is injected so tests stay deterministic and core keeps no dependency
// on Web Crypto. It must return an integer in [0, n).
export function drawNext(
  state: DrawState,
  nextIndex: (n: number) => number
): { state: DrawState; picked: DrawCandidate } | null {
  const remaining = remainingCandidates(state);
  if (remaining.length === 0) return null;

  const picked = remaining[nextIndex(remaining.length)];
  return {
    state: { candidates: state.candidates, drawnIds: [...state.drawnIds, picked.id] },
    picked,
  };
}

export function undoDraw(state: DrawState): DrawState {
  if (state.drawnIds.length === 0) return state;
  return { candidates: state.candidates, drawnIds: state.drawnIds.slice(0, -1) };
}

export function resetDraw(state: DrawState): DrawState {
  return { candidates: state.candidates, drawnIds: [] };
}
```

- [ ] **Step 4: Export from the package index**

`packages/core/src/index.ts` — 마지막 줄에 추가:

```ts
export * from "./draw";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=@lolpamin/core`
Expected: PASS, 기존 테스트 포함 전부 통과

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/draw.ts packages/core/src/draw.test.ts packages/core/src/index.ts
git commit -m "feat(core): add draw-without-replacement state machine"
```

---

### Task 2: 무작위 추출 + 후보 변환 (dashboard lib)

**Files:**
- Create: `apps/dashboard/lib/draw/random.ts`, `apps/dashboard/lib/draw/random.test.ts`
- Create: `apps/dashboard/lib/draw/candidates.ts`, `apps/dashboard/lib/draw/candidates.test.ts`

**Interfaces:**
- Consumes: `DrawCandidate` (Task 1), `LinkedMemberOption { id: string; name: string; elo: number }` from `@/lib/queries/linked-members` (이 브랜치는 MMR 리네임 이전이라 필드명이 `elo`다)
- Produces: `secureNextIndex(upperExclusive: number): number`, `MAX_NUMBER_CANDIDATES = 1000`, `toMemberCandidates(members: LinkedMemberOption[], selectedIds: ReadonlySet<string>): DrawCandidate[]`, `toNumberCandidates(min: number, max: number): DrawCandidate[]`, `validateNumberRange(min: number, max: number): string | null`, `normalizeManualName(raw: string): string`, `nextManualId(existing: DrawCandidate[]): string`

- [ ] **Step 1: Write the failing tests**

`apps/dashboard/lib/draw/random.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { secureNextIndex } from "./random";

describe("secureNextIndex", () => {
  it("always returns 0 for a pool of one", () => {
    for (let i = 0; i < 20; i++) expect(secureNextIndex(1)).toBe(0);
  });

  it("stays inside [0, n)", () => {
    for (let i = 0; i < 500; i++) {
      const value = secureNextIndex(7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it("eventually hits every index", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(secureNextIndex(4));
    expect(seen.size).toBe(4);
  });

  it("rejects a non-positive or non-integer pool size", () => {
    expect(() => secureNextIndex(0)).toThrow(RangeError);
    expect(() => secureNextIndex(-1)).toThrow(RangeError);
    expect(() => secureNextIndex(2.5)).toThrow(RangeError);
  });
});
```

`apps/dashboard/lib/draw/candidates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_NUMBER_CANDIDATES,
  nextManualId,
  normalizeManualName,
  toMemberCandidates,
  toNumberCandidates,
  validateNumberRange,
} from "./candidates";

const members = [
  { id: "m1", name: "박병준", elo: 1100 },
  { id: "m2", name: "김철수", elo: 1000 },
  { id: "m3", name: "이영희", elo: 980 },
];

describe("toMemberCandidates", () => {
  it("keeps only selected members, in list order", () => {
    const result = toMemberCandidates(members, new Set(["m3", "m1"]));
    expect(result).toEqual([
      { id: "m1", label: "박병준" },
      { id: "m3", label: "이영희" },
    ]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(toMemberCandidates(members, new Set())).toEqual([]);
  });
});

describe("toNumberCandidates", () => {
  it("builds one candidate per number in the inclusive range", () => {
    expect(toNumberCandidates(3, 5)).toEqual([
      { id: "n-3", label: "3" },
      { id: "n-4", label: "4" },
      { id: "n-5", label: "5" },
    ]);
  });

  it("handles a single-number range", () => {
    expect(toNumberCandidates(7, 7)).toEqual([{ id: "n-7", label: "7" }]);
  });

  it("returns an empty list for an invalid range instead of throwing", () => {
    expect(toNumberCandidates(9, 2)).toEqual([]);
  });
});

describe("validateNumberRange", () => {
  it("accepts a normal range", () => {
    expect(validateNumberRange(1, 45)).toBeNull();
  });

  it("rejects a reversed range", () => {
    expect(validateNumberRange(10, 3)).toBe("시작 숫자가 끝 숫자보다 큽니다.");
  });

  it("rejects non-integers", () => {
    expect(validateNumberRange(1.5, 10)).toBe("정수만 입력할 수 있습니다.");
  });

  it("rejects a range wider than the cap", () => {
    expect(validateNumberRange(1, MAX_NUMBER_CANDIDATES + 1)).toBe(
      `숫자는 최대 ${MAX_NUMBER_CANDIDATES}개까지 뽑을 수 있습니다.`
    );
  });

  it("accepts a range exactly at the cap", () => {
    expect(validateNumberRange(1, MAX_NUMBER_CANDIDATES)).toBeNull();
  });
});

describe("normalizeManualName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeManualName("  박  병준 ")).toBe("박 병준");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeManualName("   ")).toBe("");
  });
});

describe("nextManualId", () => {
  it("starts at 1 when there is no manual candidate yet", () => {
    expect(nextManualId([{ id: "m1", label: "박병준" }])).toBe("manual-1");
  });

  it("does not collide with existing manual ids", () => {
    expect(nextManualId([{ id: "manual-1", label: "손님" }, { id: "manual-4", label: "손님2" }])).toBe(
      "manual-5"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/draw`
Expected: FAIL — `Failed to resolve import "./random"` / `"./candidates"`

- [ ] **Step 3: Write the implementations**

`apps/dashboard/lib/draw/random.ts`:

```ts
// Uniform index in [0, upperExclusive). A plain `% n` on a 32-bit value biases
// the low indices, so values in the ragged top partition are rejected and redrawn.
export function secureNextIndex(upperExclusive: number): number {
  if (!Number.isInteger(upperExclusive) || upperExclusive <= 0) {
    throw new RangeError(`upperExclusive must be a positive integer, got ${upperExclusive}`);
  }

  const limit = Math.floor(0x1_0000_0000 / upperExclusive) * upperExclusive;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % upperExclusive;
}
```

`apps/dashboard/lib/draw/candidates.ts`:

```ts
import type { DrawCandidate } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";

export const MAX_NUMBER_CANDIDATES = 1000;

export function toMemberCandidates(
  members: LinkedMemberOption[],
  selectedIds: ReadonlySet<string>
): DrawCandidate[] {
  return members.filter((m) => selectedIds.has(m.id)).map((m) => ({ id: m.id, label: m.name }));
}

export function toNumberCandidates(min: number, max: number): DrawCandidate[] {
  if (validateNumberRange(min, max) !== null) return [];
  return Array.from({ length: max - min + 1 }, (_, i) => ({
    id: `n-${min + i}`,
    label: String(min + i),
  }));
}

export function validateNumberRange(min: number, max: number): string | null {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return "정수만 입력할 수 있습니다.";
  if (min > max) return "시작 숫자가 끝 숫자보다 큽니다.";
  if (max - min + 1 > MAX_NUMBER_CANDIDATES) {
    return `숫자는 최대 ${MAX_NUMBER_CANDIDATES}개까지 뽑을 수 있습니다.`;
  }
  return null;
}

export function normalizeManualName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function nextManualId(existing: DrawCandidate[]): string {
  const used = existing
    .map((c) => /^manual-(\d+)$/.exec(c.id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  return `manual-${used.length === 0 ? 1 : Math.max(...used) + 1}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/draw`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/draw
git commit -m "feat(dashboard): add uniform index draw and candidate builders"
```

---

### Task 3: 플린코 경로 생성기

경로는 결과를 정하지 않는다. 목적지 `dx`(출발 x에서 목표 슬롯 중심까지의 픽셀 거리)가 이미 정해져 있고, 이 함수는 **거기에 도달하는 좌/우 시퀀스**를 만든다. 우회전 수는 `dx`로 고정되고 순서만 셔플되므로 매번 경로가 달라 보인다. 정수 스텝으로 딱 떨어지지 않는 나머지는 `drift`로 돌려주고 렌더러가 마지막 줄에서 흡수한다.

**Files:**
- Create: `apps/dashboard/lib/draw/plinko-path.ts`, `apps/dashboard/lib/draw/plinko-path.test.ts`

**Interfaces:**
- Consumes: `nextIndex: (n: number) => number` 형태의 난수원 (Task 2의 `secureNextIndex`)
- Produces: `PlinkoPlan { steps: (-1 | 1)[]; drift: number }`, `buildPlinkoPlan(rows: number, spacing: number, dx: number, nextIndex: (n: number) => number): PlinkoPlan`

- [ ] **Step 1: Write the failing test**

`apps/dashboard/lib/draw/plinko-path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlinkoPlan, type PlinkoPlan } from "./plinko-path";

const alwaysFirst = () => 0;

function landing(plan: PlinkoPlan, spacing: number): number {
  return plan.steps.reduce((sum, s) => sum + s * spacing, 0) + plan.drift;
}

describe("buildPlinkoPlan", () => {
  it("produces one step per row", () => {
    expect(buildPlinkoPlan(8, 40, 120, alwaysFirst).steps).toHaveLength(8);
  });

  it("only ever steps left or right", () => {
    const { steps } = buildPlinkoPlan(8, 40, 120, alwaysFirst);
    for (const step of steps) expect([-1, 1]).toContain(step);
  });

  it("lands exactly on the target", () => {
    const spacing = 40;
    for (const dx of [0, 40, -40, 137, -213]) {
      const plan = buildPlinkoPlan(8, spacing, dx, alwaysFirst);
      expect(landing(plan, spacing)).toBeCloseTo(dx, 6);
    }
  });

  it("keeps the drift below one pin spacing when the target is reachable", () => {
    const plan = buildPlinkoPlan(8, 40, 137, alwaysFirst);
    expect(Math.abs(plan.drift)).toBeLessThanOrEqual(40);
  });

  it("still lands on target when the row count cannot reach it", () => {
    const spacing = 40;
    const plan = buildPlinkoPlan(2, spacing, 500, alwaysFirst);
    expect(plan.steps).toEqual([1, 1]);
    expect(landing(plan, spacing)).toBeCloseTo(500, 6);
  });

  it("shuffles the step order between runs", () => {
    const random = (n: number) => Math.floor(Math.random() * n);
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) orders.add(buildPlinkoPlan(8, 40, 80, random).steps.join(""));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("keeps the right-step count fixed no matter the shuffle", () => {
    const random = (n: number) => Math.floor(Math.random() * n);
    const counts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      counts.add(buildPlinkoPlan(8, 40, 80, random).steps.filter((s) => s === 1).length);
    }
    expect(counts.size).toBe(1);
  });

  it("rejects a non-positive row count", () => {
    expect(() => buildPlinkoPlan(0, 40, 0, alwaysFirst)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/draw/plinko-path.test.ts`
Expected: FAIL — `Failed to resolve import "./plinko-path"`

- [ ] **Step 3: Write the implementation**

`apps/dashboard/lib/draw/plinko-path.ts`:

```ts
export interface PlinkoPlan {
  // One ±1 per pin row. Multiplied by the pin spacing they are the ball's
  // horizontal hops.
  steps: (-1 | 1)[];
  // Leftover pixels the steps cannot express (the target rarely sits on an exact
  // multiple of the spacing). The renderer folds this into the last row so the
  // ball still lands dead centre in the slot.
  drift: number;
}

export function buildPlinkoPlan(
  rows: number,
  spacing: number,
  dx: number,
  nextIndex: (n: number) => number
): PlinkoPlan {
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new RangeError(`rows must be a positive integer, got ${rows}`);
  }

  // dx = (right - left) * spacing, with right + left = rows.
  const rightCount = clamp(Math.round((dx / spacing + rows) / 2), 0, rows);
  const steps: (-1 | 1)[] = [
    ...Array<1>(rightCount).fill(1),
    ...Array<-1>(rows - rightCount).fill(-1),
  ];
  shuffle(steps, nextIndex);

  const reached = steps.reduce((sum, s) => sum + s * spacing, 0);
  return { steps, drift: dx - reached };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[], nextIndex: (n: number) => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextIndex(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/draw`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/draw/plinko-path.ts apps/dashboard/lib/draw/plinko-path.test.ts
git commit -m "feat(dashboard): add plinko path planner that always reaches the target slot"
```

---

### Task 4: BGM 파일 이동 + 목록 API

**Files:**
- Move: `BGM/*.mp3` → `apps/dashboard/public/bgm/`
- Create: `apps/dashboard/lib/draw/bgm.ts`, `apps/dashboard/lib/draw/bgm.test.ts`
- Create: `apps/dashboard/app/api/bgm/route.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `BgmTrack { name: string; url: string }`, `listBgmTracks(fileNames: string[]): BgmTrack[]`, `GET /api/bgm` → `{ tracks: BgmTrack[] }`

- [ ] **Step 1: Move the audio files**

```bash
mkdir -p apps/dashboard/public/bgm
mv BGM/*.mp3 apps/dashboard/public/bgm/
rmdir BGM
ls apps/dashboard/public/bgm
```

Expected: `A strange tail.mp3`, `Counter Shot.mp3`, `Hidden Card.mp3` (약 7MB). 파일들은 git에 추적된 적이 없으므로 `git mv`가 아니라 그냥 이동한다.

- [ ] **Step 2: Write the failing test**

`apps/dashboard/lib/draw/bgm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listBgmTracks } from "./bgm";

describe("listBgmTracks", () => {
  it("keeps only mp3 files", () => {
    const tracks = listBgmTracks(["a.mp3", "notes.txt", ".DS_Store", "b.MP3"]);
    expect(tracks.map((t) => t.name)).toEqual(["a.mp3", "b.MP3"]);
  });

  it("sorts by name", () => {
    const tracks = listBgmTracks(["Hidden Card.mp3", "A strange tail.mp3", "Counter Shot.mp3"]);
    expect(tracks.map((t) => t.name)).toEqual([
      "A strange tail.mp3",
      "Counter Shot.mp3",
      "Hidden Card.mp3",
    ]);
  });

  it("percent-encodes spaces so the static URL resolves", () => {
    expect(listBgmTracks(["Counter Shot.mp3"])[0].url).toBe("/bgm/Counter%20Shot.mp3");
  });

  it("returns an empty list for an empty directory", () => {
    expect(listBgmTracks([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/draw/bgm.test.ts`
Expected: FAIL — `Failed to resolve import "./bgm"`

- [ ] **Step 4: Write the implementation**

`apps/dashboard/lib/draw/bgm.ts`:

```ts
export interface BgmTrack {
  name: string;
  url: string;
}

// The listing is derived from the directory at request time rather than from a
// hard-coded array, so dropping another mp3 into public/bgm is all it takes to
// add a track.
export function listBgmTracks(fileNames: string[]): BgmTrack[] {
  return fileNames
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((name) => ({ name, url: `/bgm/${encodeURIComponent(name)}` }));
}
```

`apps/dashboard/app/api/bgm/route.ts`:

```ts
import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { listBgmTracks } from "@/lib/draw/bgm";

// Reads the directory on every request; a track dropped into public/bgm shows up
// without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "bgm");
    const entries = await readdir(dir);
    return NextResponse.json({ tracks: listBgmTracks(entries) });
  } catch {
    // No bgm directory at all — the player renders its empty state.
    return NextResponse.json({ tracks: [] });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/draw`
Expected: PASS

- [ ] **Step 6: Verify the route**

Run: `npm run dev --workspace=dashboard`, 그리고 `curl http://localhost:3000/api/bgm`
Expected: 트랙 3개가 들어간 JSON. 이름에 공백이 있는 파일의 `url`은 `%20`으로 인코딩되어 있다.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/public/bgm apps/dashboard/lib/draw/bgm.ts apps/dashboard/lib/draw/bgm.test.ts apps/dashboard/app/api/bgm/route.ts
git commit -m "feat(dashboard): serve bgm tracks from public/bgm with a listing route"
```

---

### Task 5: 사이드바 06/07 + 두 페이지 + 추첨 화면 배선

애니메이션 없이 추첨이 끝까지 동작하는 상태를 먼저 만든다. 이 단계의 연출은 `PickSpotlight`(당첨자 이름을 크게 띄우는 텍스트 폴백)이며, Task 6·7에서 캔버스가 그 자리를 대신한다. `PickSpotlight`는 캔버스를 못 쓰는 환경의 폴백으로 계속 남는다.

**Files:**
- Modify: `apps/dashboard/components/AppShell.tsx`
- Create: `apps/dashboard/app/draw/ball/page.tsx`, `apps/dashboard/app/draw/plinko/page.tsx`
- Create: `apps/dashboard/components/draw/animator.ts`, `DrawScreen.tsx`, `CandidateSetup.tsx`, `DrawControls.tsx`, `ResultList.tsx`, `PickSpotlight.tsx`

**Interfaces:**
- Consumes: Task 1의 core 함수 전부, Task 2의 `secureNextIndex`·`toMemberCandidates`·`toNumberCandidates`·`validateNumberRange`·`normalizeManualName`·`nextManualId`, `getLinkedMembers()`
- Produces: `DrawAnimator { play(winner: DrawCandidate): Promise<void>; skip(): void; sync(remaining: DrawCandidate[]): void }`, `DrawScreen({ pool, variant }: { pool: LinkedMemberOption[]; variant: "ball" | "plinko" })`

- [ ] **Step 1: Add the two nav entries**

`apps/dashboard/components/AppShell.tsx` — `AppShellProps.activeNav` 유니온에 두 키를 추가한다 (기존 `admins` 키는 그대로 둔다):

```tsx
  activeNav:
    | "members"
    | "matches"
    | "inactive"
    | "kakao-import"
    | "link-accounts"
    | "draw-ball"
    | "draw-plinko"
    | "admins";
```

`navItems`의 `link-accounts` 줄 뒤에 두 줄을 추가:

```tsx
    { key: "draw-ball" as const, href: "/draw/ball", label: "공 뽑기", icon: "06" },
    { key: "draw-plinko" as const, href: "/draw/plinko", label: "핀볼 뽑기", icon: "07" },
```

그리고 로그인 시에만 붙는 관리자 항목의 아이콘을 `06`에서 `08`로 민다 (06·07은 뽑기가 쓴다):

```tsx
  if (currentAdmin) {
    navItems.push({ key: "admins" as const, href: "/admins", label: "관리자", icon: "08" });
  }
```

- [ ] **Step 2: Add the animator contract**

`apps/dashboard/components/draw/animator.ts`:

```ts
import type { DrawCandidate } from "@lolpamin/core";

// The winner is already decided when play() is called; an animator only plays it
// back. sync() redraws from the current pool after undo/reset — nothing is ever
// played in reverse, so the picture cannot drift from the state.
export interface DrawAnimator {
  play(winner: DrawCandidate): Promise<void>;
  skip(): void;
  sync(remaining: DrawCandidate[]): void;
}
```

- [ ] **Step 3: Add the spotlight fallback**

`apps/dashboard/components/draw/PickSpotlight.tsx`:

```tsx
"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { DrawAnimator } from "./animator";

// Text-only animator. Used while a canvas renderer is unavailable and as the
// fallback when a browser cannot give us a 2D context.
export const PickSpotlight = forwardRef<DrawAnimator, { remaining: DrawCandidate[] }>(
  function PickSpotlight({ remaining }, ref) {
    const [shown, setShown] = useState<DrawCandidate | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resolveRef = useRef<(() => void) | null>(null);

    function finish() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      resolveRef.current?.();
      resolveRef.current = null;
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        setShown(winner);
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          timerRef.current = setTimeout(finish, 900);
        });
      },
      skip: finish,
      sync: () => setShown(null),
    }));

    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-white/[.07] bg-[#12161F]">
        <div className="text-[11.5px] text-[#6E7889]">남은 인원 {remaining.length}명</div>
        <div className="text-[40px] font-extrabold text-white">{shown ? shown.label : "—"}</div>
      </div>
    );
  }
);
```

- [ ] **Step 4: Add the result list**

`apps/dashboard/components/draw/ResultList.tsx`:

```tsx
import type { DrawCandidate } from "@lolpamin/core";

export function ResultList({ drawn }: { drawn: DrawCandidate[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[.07] bg-[#12161F] p-4">
      <div className="text-[11px] font-bold tracking-wider text-[#5C6577]">뽑힌 순서</div>
      {drawn.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#6E7889]">아직 뽑지 않았습니다.</div>
      ) : (
        <ol className="flex flex-col gap-1">
          {drawn.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-lg bg-[#161B26] px-2.5 py-2">
              <span className="w-6 text-center font-mono text-[11px] text-[#8FB4F5]">{i + 1}</span>
              <span className="text-[13px] font-semibold text-[#E6EAF2]">{c.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the controls**

`apps/dashboard/components/draw/DrawControls.tsx`:

```tsx
const BUTTON = "rounded-lg px-4 py-2.5 text-[13px] font-bold transition-colors disabled:opacity-35";

export interface DrawControlsProps {
  canDraw: boolean;
  canUndo: boolean;
  canReset: boolean;
  isAnimating: boolean;
  onDraw: () => void;
  onUndo: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function DrawControls({
  canDraw,
  canUndo,
  canReset,
  isAnimating,
  onDraw,
  onUndo,
  onReset,
  onSkip,
}: DrawControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`${BUTTON} bg-[#4472C4] text-white hover:bg-[#3862B4]`}
        disabled={!canDraw || isAnimating}
        onClick={onDraw}
      >
        뽑기
      </button>
      <button
        type="button"
        className={`${BUTTON} bg-[#20293A] text-[#C7D0DF] hover:bg-[#27324A]`}
        disabled={!canUndo || isAnimating}
        onClick={onUndo}
      >
        되돌리기
      </button>
      <button
        type="button"
        className={`${BUTTON} bg-[#20293A] text-[#C7D0DF] hover:bg-[#27324A]`}
        disabled={!canReset || isAnimating}
        onClick={onReset}
      >
        리셋
      </button>
      {isAnimating && (
        <button
          type="button"
          className={`${BUTTON} bg-[#2A2033] text-[#D8B4F5] hover:bg-[#332640]`}
          onClick={onSkip}
        >
          연출 스킵
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the candidate setup panel**

`apps/dashboard/components/draw/CandidateSetup.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { nextManualId, normalizeManualName, validateNumberRange } from "@/lib/draw/candidates";

export type CandidateSource = "members" | "numbers";

export interface CandidateSetupProps {
  pool: LinkedMemberOption[];
  source: CandidateSource;
  onSourceChange: (source: CandidateSource) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  manual: DrawCandidate[];
  onManualChange: (manual: DrawCandidate[]) => void;
  range: { min: number; max: number };
  onRangeChange: (range: { min: number; max: number }) => void;
  locked: boolean;
}

const FIELD =
  "rounded-lg border border-white/[.09] bg-[#0E1117] px-2.5 py-1.5 text-[12.5px] text-[#E6EAF2] outline-none focus:border-[#4472C4] disabled:opacity-40";

export function CandidateSetup({
  pool,
  source,
  onSourceChange,
  selectedIds,
  onSelectedIdsChange,
  manual,
  onManualChange,
  range,
  onRangeChange,
  locked,
}: CandidateSetupProps) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const visible = pool.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
  const rangeError = validateNumberRange(range.min, range.max);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function addManual() {
    const label = normalizeManualName(manualName);
    if (label === "") {
      setManualError("이름을 입력하세요.");
      return;
    }
    const taken =
      manual.some((c) => c.label === label) ||
      pool.some((m) => selectedIds.has(m.id) && m.name === label);
    if (taken) {
      setManualError("이미 있는 이름입니다.");
      return;
    }
    setManualError(null);
    setManualName("");
    onManualChange([...manual, { id: nextManualId(manual), label }]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[.07] bg-[#12161F] p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-[#0E1117] p-1">
          {(["members", "numbers"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onSourceChange(s)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-bold disabled:opacity-40 ${
                source === s ? "bg-[#20293A] text-white" : "text-[#8A94A6]"
              }`}
            >
              {s === "members" ? "회원" : "숫자"}
            </button>
          ))}
        </div>
        {locked && (
          <div className="text-[11px] text-[#F2985C]">진행 중 — 후보를 바꾸려면 리셋하세요</div>
        )}
      </div>

      {source === "members" ? (
        <>
          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} flex-1`}
              placeholder="이름 검색"
              value={query}
              disabled={locked}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={() => onSelectedIdsChange(new Set(pool.map((m) => m.id)))}
            >
              전체 선택
            </button>
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={() => onSelectedIdsChange(new Set())}
            >
              전체 해제
            </button>
          </div>

          {pool.length === 0 ? (
            <div className="rounded-lg bg-[#161B26] px-3 py-6 text-center text-[12px] text-[#8A94A6]">
              계정이 연결된 회원이 없습니다. 05 계정 연결에서 먼저 연결하거나, 위 탭에서 숫자 뽑기를
              쓰세요.
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto">
              {visible.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] ${
                    selectedIds.has(m.id) ? "bg-[#20293A] text-white" : "bg-[#161B26] text-[#95A0B2]"
                  } ${locked ? "opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    className="accent-[#4472C4]"
                    checked={selectedIds.has(m.id)}
                    disabled={locked}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="truncate">{m.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              className={`${FIELD} flex-1`}
              placeholder="명단에 없는 사람 이름 추가"
              value={manualName}
              disabled={locked}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManual();
                }
              }}
            />
            <button
              type="button"
              className={`${FIELD} font-semibold`}
              disabled={locked}
              onClick={addManual}
            >
              추가
            </button>
          </div>
          {manualError && <div className="text-[11.5px] text-[#E06C75]">{manualError}</div>}
          {manual.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manual.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1.5 rounded-full bg-[#2A2033] px-2.5 py-1 text-[11.5px] text-[#D8B4F5]"
                >
                  {c.label}
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onManualChange(manual.filter((x) => x.id !== c.id))}
                    className="text-[#8A94A6] hover:text-white disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[12.5px] text-[#95A0B2]">
            <input
              type="number"
              className={`${FIELD} w-24`}
              value={range.min}
              disabled={locked}
              onChange={(e) => onRangeChange({ ...range, min: Number(e.target.value) })}
            />
            <span>부터</span>
            <input
              type="number"
              className={`${FIELD} w-24`}
              value={range.max}
              disabled={locked}
              onChange={(e) => onRangeChange({ ...range, max: Number(e.target.value) })}
            />
            <span>까지</span>
          </div>
          {rangeError && <div className="text-[11.5px] text-[#E06C75]">{rangeError}</div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the orchestrator**

`apps/dashboard/components/draw/DrawScreen.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDrawState,
  drawNext,
  drawnCandidates,
  remainingCandidates,
  undoDraw,
  type DrawCandidate,
  type DrawState,
} from "@lolpamin/core";
import type { LinkedMemberOption } from "@/lib/queries/linked-members";
import { toMemberCandidates, toNumberCandidates } from "@/lib/draw/candidates";
import { secureNextIndex } from "@/lib/draw/random";
import type { DrawAnimator } from "./animator";
import { CandidateSetup, type CandidateSource } from "./CandidateSetup";
import { DrawControls } from "./DrawControls";
import { PickSpotlight } from "./PickSpotlight";
import { ResultList } from "./ResultList";

export function DrawScreen({
  pool,
  variant,
}: {
  pool: LinkedMemberOption[];
  variant: "ball" | "plinko";
}) {
  const [source, setSource] = useState<CandidateSource>("members");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(pool.map((m) => m.id)));
  const [manual, setManual] = useState<DrawCandidate[]>([]);
  const [range, setRange] = useState({ min: 1, max: 10 });
  // null means "not started yet" — the pool is still derived live from the setup
  // panel. The first draw freezes it into a DrawState.
  const [state, setState] = useState<DrawState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animatorRef = useRef<DrawAnimator>(null);

  const setupCandidates = useMemo(
    () =>
      source === "members"
        ? [...toMemberCandidates(pool, selectedIds), ...manual]
        : toNumberCandidates(range.min, range.max),
    [source, pool, selectedIds, manual, range]
  );

  const active = state ?? createDrawState(setupCandidates);
  const remaining = remainingCandidates(active);
  const drawn = drawnCandidates(active);
  const locked = drawn.length > 0;
  const remainingKey = remaining.map((c) => c.id).join(",");

  useEffect(() => {
    animatorRef.current?.sync(remaining);
    // Redraw whenever the pool identity changes — after a draw, an undo, a reset
    // or a setup edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingKey]);

  async function handleDraw() {
    const result = drawNext(active, secureNextIndex);
    if (!result) return;
    setState(result.state);
    setIsAnimating(true);
    try {
      await animatorRef.current?.play(result.picked);
    } finally {
      setIsAnimating(false);
    }
  }

  function handleUndo() {
    const next = undoDraw(active);
    setState(next.drawnIds.length === 0 ? null : next);
  }

  function handleReset() {
    setState(null);
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 px-7 pb-10 pt-6">
      <div className="flex min-w-0 flex-col gap-4">
        <CandidateSetup
          pool={pool}
          source={source}
          onSourceChange={setSource}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          manual={manual}
          onManualChange={setManual}
          range={range}
          onRangeChange={setRange}
          locked={locked}
        />

        <PickSpotlight ref={animatorRef} remaining={remaining} />

        <div className="flex items-center justify-between">
          <DrawControls
            canDraw={remaining.length > 0}
            canUndo={drawn.length > 0}
            canReset={drawn.length > 0}
            isAnimating={isAnimating}
            onDraw={handleDraw}
            onUndo={handleUndo}
            onReset={handleReset}
            onSkip={() => animatorRef.current?.skip()}
          />
          <div className="font-mono text-[12px] text-[#8A94A6]">
            남은 {remaining.length} / 전체 {active.candidates.length}
          </div>
        </div>
      </div>

      <ResultList drawn={drawn} />
    </div>
  );
}
```

`variant`는 Task 6·7에서 어떤 캔버스를 띄울지 고르는 데 쓴다. 이 단계에서는 두 페이지가 같은 `PickSpotlight`를 쓰므로 아직 참조되지 않는다 (`variant`가 안 쓰인다는 타입 에러는 나지 않는다).

- [ ] **Step 8: Add the two pages**

`apps/dashboard/app/draw/ball/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { getLinkedMembers } from "@/lib/queries/linked-members";

// AppShell reads live DB rows for the sidebar badge; without this Next would
// bake a snapshot at build time.
export const dynamic = "force-dynamic";

export default async function BallDrawPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell activeNav="draw-ball" pageTitle="공 뽑기" pageDesc="추첨기에서 공을 뽑아 순서를 정합니다">
      <DrawScreen pool={pool} variant="ball" />
    </AppShell>
  );
}
```

`apps/dashboard/app/draw/plinko/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { getLinkedMembers } from "@/lib/queries/linked-members";

export const dynamic = "force-dynamic";

export default async function PlinkoDrawPage() {
  const pool = await getLinkedMembers();

  return (
    <AppShell
      activeNav="draw-plinko"
      pageTitle="핀볼 뽑기"
      pageDesc="핀 사이로 공을 떨어뜨려 순서를 정합니다"
    >
      <DrawScreen pool={pool} variant="plinko" />
    </AppShell>
  );
}
```

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev --workspace=dashboard`, `http://localhost:3000/draw/ball` 접속
확인할 것:
1. 사이드바에 06 공 뽑기 / 07 핀볼 뽑기가 보이고 현재 항목이 강조된다. 로그인한 상태라면 관리자 항목이 08로 표시된다.
2. 회원 탭에 연결 회원이 전부 체크된 채로 보인다. 검색·전체 선택/해제가 동작한다.
3. 수동 이름 추가 후 칩이 생기고, 같은 이름을 또 넣으면 "이미 있는 이름입니다."가 뜬다.
4. 숫자 탭에서 1~10이 후보가 되고, 10부터 3까지로 뒤집으면 검증 메시지가 뜬다.
5. 뽑기를 누르면 이름이 크게 뜨고 남은 인원이 하나 줄며 오른쪽 목록에 1번으로 쌓인다.
6. 같은 사람이 두 번 나오지 않는다. 다 뽑으면 뽑기 버튼이 비활성된다.
7. 되돌리기를 누르면 마지막 한 명이 목록에서 빠지고 남은 인원이 늘어난다. 전부 되돌리면 셋업 패널이 다시 편집 가능해진다.
8. 리셋을 누르면 전원 복귀.
9. 첫 뽑기 후 셋업 패널이 잠기고 "진행 중 — 후보를 바꾸려면 리셋하세요"가 보인다.

- [ ] **Step 10: Run the whole suite and typecheck**

Run: 레포 루트에서 `npm test`, 그리고 `cd apps/dashboard && npx tsc --noEmit`
Expected: 테스트 전부 통과, 타입 에러 없음

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/components/AppShell.tsx apps/dashboard/components/draw apps/dashboard/app/draw
git commit -m "feat(dashboard): add draw pages 06/07 with candidate setup and undo/reset"
```

---

### Task 6: 공 뽑기 캔버스 (06)

**Files:**
- Create: `apps/dashboard/components/draw/BallLotteryCanvas.tsx`
- Modify: `apps/dashboard/components/draw/DrawScreen.tsx`

**Interfaces:**
- Consumes: `DrawAnimator` (Task 5), `DrawCandidate` (Task 1)
- Produces: `BallLotteryCanvas` — `forwardRef<DrawAnimator, { remaining: DrawCandidate[] }>`

- [ ] **Step 1: Write the canvas renderer**

`apps/dashboard/components/draw/BallLotteryCanvas.tsx`:

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import type { DrawAnimator } from "./animator";

interface Ball {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "stir"; until: number; winnerId: string }
  | { kind: "eject"; start: number; end: number; from: { x: number; y: number }; winnerId: string }
  | { kind: "show"; until: number; label: string };

const RADIUS = 24;
const SPEED = 2.4;
const HEIGHT = 420;
const STIR_MS = 600;
const EJECT_MS = 1000;
const SHOW_MS = 800;

export const BallLotteryCanvas = forwardRef<DrawAnimator, { remaining: DrawCandidate[] }>(
  function BallLotteryCanvas({ remaining }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ballsRef = useRef<Ball[]>([]);
    const phaseRef = useRef<Phase>({ kind: "idle" });
    const resolveRef = useRef<(() => void) | null>(null);
    const sizeRef = useRef({ width: 0, height: HEIGHT });

    function scale(ms: number): number {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return reduced ? ms * 0.12 : ms;
    }

    function settle() {
      phaseRef.current = { kind: "idle" };
      resolveRef.current?.();
      resolveRef.current = null;
    }

    function syncBalls(candidates: DrawCandidate[]) {
      const { width, height } = sizeRef.current;
      const previous = new Map(ballsRef.current.map((b) => [b.id, b]));
      ballsRef.current = candidates.map((c) => {
        const existing = previous.get(c.id);
        if (existing) return { ...existing, label: c.label };
        const angle = Math.random() * Math.PI * 2;
        return {
          id: c.id,
          label: c.label,
          x: RADIUS + Math.random() * Math.max(1, width - RADIUS * 2),
          y: RADIUS + Math.random() * Math.max(1, height - RADIUS * 2),
          vx: Math.cos(angle) * SPEED,
          vy: Math.sin(angle) * SPEED,
          hue: hueOf(c.id),
        };
      });
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        phaseRef.current = {
          kind: "stir",
          until: performance.now() + scale(STIR_MS),
          winnerId: winner.id,
        };
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
        });
      },
      skip: settle,
      sync: syncBalls,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // A browser with no 2D context still draws nothing but keeps play()
      // resolving, so the draw itself never stalls.
      if (!ctx) return;

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;

      function resize() {
        const width = canvas!.clientWidth;
        canvas!.width = width * dpr;
        canvas!.height = HEIGHT * dpr;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { width, height: HEIGHT };
      }
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      syncBalls(remaining);

      function step(now: number) {
        const { width, height } = sizeRef.current;
        const phase = phaseRef.current;
        const boost = phase.kind === "stir" ? 2.2 : 1;

        for (const ball of ballsRef.current) {
          if (phase.kind === "eject" && ball.id === phase.winnerId) continue;
          ball.x += ball.vx * boost;
          ball.y += ball.vy * boost;
          if (ball.x < RADIUS || ball.x > width - RADIUS) {
            ball.vx *= -1;
            ball.x = Math.min(width - RADIUS, Math.max(RADIUS, ball.x));
          }
          if (ball.y < RADIUS || ball.y > height - RADIUS) {
            ball.vy *= -1;
            ball.y = Math.min(height - RADIUS, Math.max(RADIUS, ball.y));
          }
        }
        separate(ballsRef.current);

        if (phase.kind === "stir" && now >= phase.until) {
          const winner = ballsRef.current.find((b) => b.id === phase.winnerId);
          phaseRef.current = {
            kind: "eject",
            start: now,
            end: now + scale(EJECT_MS),
            from: winner ? { x: winner.x, y: winner.y } : { x: width / 2, y: height / 2 },
            winnerId: phase.winnerId,
          };
        } else if (phase.kind === "eject") {
          const winner = ballsRef.current.find((b) => b.id === phase.winnerId);
          const t = clamp01((now - phase.start) / (phase.end - phase.start));
          if (winner) {
            winner.x = lerp(phase.from.x, width / 2, t);
            winner.y = lerp(phase.from.y, height + RADIUS * 2, t);
          }
          if (t >= 1) {
            phaseRef.current = { kind: "show", until: now + scale(SHOW_MS), label: winner?.label ?? "" };
          }
        } else if (phase.kind === "show" && now >= phase.until) {
          settle();
        }

        draw(ctx!, ballsRef.current, sizeRef.current, phaseRef.current);
        frame = requestAnimationFrame(step);
      }

      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT }}
        className="w-full rounded-xl border border-white/[.07] bg-[#12161F]"
      />
    );
  }
);

function draw(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  size: { width: number; height: number },
  phase: Phase
): void {
  ctx.clearRect(0, 0, size.width, size.height);

  // Drum wall and the exit chute at the bottom centre.
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
  ctx.fillStyle = "rgba(68,114,196,.14)";
  ctx.fillRect(size.width / 2 - RADIUS - 6, size.height - 10, (RADIUS + 6) * 2, 10);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${ball.hue} 62% 58%)`;
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(fit(ctx, ball.label, RADIUS * 1.7), ball.x, ball.y);
  }

  if (phase.kind === "show") {
    ctx.fillStyle = "rgba(14,17,23,.78)";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(phase.label, size.width / 2, size.height / 2);
  }
}

// Cheap positional separation. The winner is already decided, so balls only need
// to look like they are jostling — accurate collision response buys nothing.
function separate(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const overlap = RADIUS * 2 - distance;
      if (overlap <= 0) continue;
      const nx = (dx / distance) * (overlap / 2);
      const ny = (dy / distance) * (overlap / 2);
      a.x -= nx;
      a.y -= ny;
      b.x += nx;
      b.y += ny;
    }
  }
}

function fit(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let cut = label;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function hueOf(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
```

- [ ] **Step 2: Wire it into DrawScreen behind the variant**

`apps/dashboard/components/draw/DrawScreen.tsx` — import 추가:

```tsx
import { BallLotteryCanvas } from "./BallLotteryCanvas";
```

그리고 `<PickSpotlight ref={animatorRef} remaining={remaining} />` 한 줄을 교체:

```tsx
        {variant === "ball" ? (
          <BallLotteryCanvas ref={animatorRef} remaining={remaining} />
        ) : (
          <PickSpotlight ref={animatorRef} remaining={remaining} />
        )}
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev --workspace=dashboard`, `http://localhost:3000/draw/ball`
확인할 것:
1. 남은 인원 수만큼 공이 통 안에서 튄다. 공에 이름이 보이고 긴 이름은 말줄임된다.
2. 뽑기 → 잠깐 빨라졌다가 한 공이 아래 배출구로 빠지고 이름이 크게 뜬다.
3. 연출이 끝나면 그 공이 사라지고 남은 인원이 하나 준다. 크게 뜬 이름과 결과 목록 맨 아래 이름이 같다.
4. 연출 중에는 버튼이 비활성이고 [연출 스킵]이 보인다. 스킵하면 즉시 끝난다.
5. 되돌리기 → 사라졌던 공이 다시 통 안에 나타난다. 리셋 → 전원 복귀.
6. 브라우저 창 폭을 바꿔도 공이 통 밖으로 새지 않는다.
7. OS 설정에서 "동작 줄이기"를 켜면 연출이 눈에 띄게 짧아진다.

- [ ] **Step 4: Typecheck and commit**

```bash
cd apps/dashboard && npx tsc --noEmit && cd ../..
git add apps/dashboard/components/draw
git commit -m "feat(dashboard): add ball lottery canvas for the 06 draw page"
```

---

### Task 7: 핀볼 캔버스 (07)

**Files:**
- Create: `apps/dashboard/components/draw/PlinkoCanvas.tsx`
- Modify: `apps/dashboard/components/draw/DrawScreen.tsx`

**Interfaces:**
- Consumes: `DrawAnimator` (Task 5), `buildPlinkoPlan` (Task 3), `secureNextIndex` (Task 2)
- Produces: `PlinkoCanvas` — `forwardRef<DrawAnimator, { remaining: DrawCandidate[] }>`

- [ ] **Step 1: Write the canvas renderer**

`apps/dashboard/components/draw/PlinkoCanvas.tsx`:

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { DrawCandidate } from "@lolpamin/core";
import { buildPlinkoPlan } from "@/lib/draw/plinko-path";
import { secureNextIndex } from "@/lib/draw/random";
import type { DrawAnimator } from "./animator";

interface Drop {
  steps: (-1 | 1)[];
  drift: number;
  startX: number;
  targetSlot: number;
  start: number;
  duration: number;
}

const HEIGHT = 420;
const ROWS = 8;
const TOP = 40;
const SLOT_HEIGHT = 56;
const DROP_MS = 2000;
const FLASH_MS = 700;
// Past this many slots the labels stop fitting; only the index is drawn and the
// winner's name is shown on the flash overlay instead.
const LABELLED_SLOT_LIMIT = 20;

export const PlinkoCanvas = forwardRef<DrawAnimator, { remaining: DrawCandidate[] }>(
  function PlinkoCanvas({ remaining }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const slotsRef = useRef<DrawCandidate[]>(remaining);
    const dropRef = useRef<Drop | null>(null);
    const flashRef = useRef<{ until: number; label: string } | null>(null);
    const resolveRef = useRef<(() => void) | null>(null);
    const sizeRef = useRef({ width: 0, height: HEIGHT });

    function scale(ms: number): number {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return reduced ? ms * 0.12 : ms;
    }

    function settle() {
      dropRef.current = null;
      flashRef.current = null;
      resolveRef.current?.();
      resolveRef.current = null;
    }

    useImperativeHandle(ref, () => ({
      play(winner) {
        const slots = slotsRef.current;
        const found = slots.findIndex((c) => c.id === winner.id);
        const targetSlot = found === -1 ? 0 : found;
        const { width } = sizeRef.current;
        const spacing = pinSpacing(width);
        const startX = width / 2;
        const plan = buildPlinkoPlan(
          ROWS,
          spacing,
          slotCenter(width, slots.length, targetSlot) - startX,
          secureNextIndex
        );

        dropRef.current = {
          ...plan,
          startX,
          targetSlot,
          start: performance.now(),
          duration: scale(DROP_MS),
        };
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
        });
      },
      skip: settle,
      sync(candidates) {
        slotsRef.current = candidates;
      },
    }));

    useEffect(() => {
      slotsRef.current = remaining;
    }, [remaining]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let frame = 0;
      const dpr = window.devicePixelRatio || 1;

      function resize() {
        const width = canvas!.clientWidth;
        canvas!.width = width * dpr;
        canvas!.height = HEIGHT * dpr;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizeRef.current = { width, height: HEIGHT };
      }
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      function step(now: number) {
        const size = sizeRef.current;
        const drop = dropRef.current;

        if (drop && now - drop.start >= drop.duration) {
          const winner = slotsRef.current[drop.targetSlot];
          flashRef.current = { until: now + scale(FLASH_MS), label: winner?.label ?? "" };
          dropRef.current = null;
        }
        if (flashRef.current && now >= flashRef.current.until) settle();

        draw(ctx!, size, slotsRef.current, dropRef.current, flashRef.current, now);
        frame = requestAnimationFrame(step);
      }

      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT }}
        className="w-full rounded-xl border border-white/[.07] bg-[#12161F]"
      />
    );
  }
);

function pinSpacing(width: number): number {
  return width / (ROWS + 3);
}

function slotCenter(width: number, slotCount: number, index: number): number {
  const slotWidth = width / Math.max(1, slotCount);
  return slotWidth * (index + 0.5);
}

function rowY(index: number): number {
  const usable = HEIGHT - SLOT_HEIGHT - TOP;
  return TOP + (usable / ROWS) * index;
}

// The ball's x at the end of row i is the sum of the first i hops; the leftover
// drift is folded into the last row so it lands dead centre in the slot.
function ballPosition(drop: Drop, spacing: number, t: number): { x: number; y: number } {
  const progress = t * ROWS;
  const row = Math.min(ROWS - 1, Math.floor(progress));
  const local = progress - row;

  let x = drop.startX;
  for (let i = 0; i < row; i++) x += drop.steps[i] * spacing;
  const hop = drop.steps[row] * spacing + (row === ROWS - 1 ? drop.drift : 0);

  return {
    x: x + hop * local,
    // A shallow arc between pins reads as a bounce without any collision maths.
    y: rowY(row) + (rowY(row + 1) - rowY(row)) * local - Math.sin(local * Math.PI) * 10,
  };
}

function draw(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  slots: DrawCandidate[],
  drop: Drop | null,
  flash: { until: number; label: string } | null,
  now: number
): void {
  const { width } = size;
  ctx.clearRect(0, 0, width, HEIGHT);

  const spacing = pinSpacing(width);

  ctx.fillStyle = "rgba(255,255,255,.22)";
  for (let row = 0; row < ROWS; row++) {
    const count = row + 2;
    for (let i = 0; i < count; i++) {
      const x = width / 2 + (i - (count - 1) / 2) * spacing;
      ctx.beginPath();
      ctx.arc(x, rowY(row + 1), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const slotWidth = width / Math.max(1, slots.length);
  const labelled = slots.length <= LABELLED_SLOT_LIMIT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  slots.forEach((candidate, i) => {
    const x = slotWidth * i;
    const isTarget = drop?.targetSlot === i;
    ctx.fillStyle = isTarget ? "rgba(68,114,196,.24)" : "rgba(255,255,255,.05)";
    ctx.fillRect(x + 1, HEIGHT - SLOT_HEIGHT, slotWidth - 2, SLOT_HEIGHT - 1);
    ctx.fillStyle = "#B7C0D0";
    ctx.font = "600 11px system-ui, sans-serif";
    const label = labelled ? candidate.label : String(i + 1);
    ctx.fillText(fit(ctx, label, slotWidth - 8), x + slotWidth / 2, HEIGHT - SLOT_HEIGHT / 2);
  });

  if (drop) {
    const t = Math.min(1, (now - drop.start) / drop.duration);
    const { x, y } = ballPosition(drop, spacing, t);
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#F2985C";
    ctx.fill();
  }

  if (flash) {
    ctx.fillStyle = "rgba(14,17,23,.78)";
    ctx.fillRect(0, 0, width, HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(flash.label, width / 2, HEIGHT / 2);
  }
}

function fit(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let cut = label;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}
```

- [ ] **Step 2: Wire it into DrawScreen**

`apps/dashboard/components/draw/DrawScreen.tsx` — import 추가:

```tsx
import { PlinkoCanvas } from "./PlinkoCanvas";
```

그리고 Task 6에서 만든 분기의 `else` 쪽을 교체:

```tsx
        {variant === "ball" ? (
          <BallLotteryCanvas ref={animatorRef} remaining={remaining} />
        ) : (
          <PlinkoCanvas ref={animatorRef} remaining={remaining} />
        )}
```

`PickSpotlight` import는 이 시점에 `DrawScreen`에서 제거한다. 컴포넌트 파일 자체는 캔버스를 못 쓰는 환경을 위한 폴백으로 남긴다.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev --workspace=dashboard`, `http://localhost:3000/draw/plinko`
확인할 것:
1. 핀 격자와 하단 슬롯이 보이고, 슬롯에 남은 후보 이름이 하나씩 들어있다.
2. 뽑기 → 공이 위에서 떨어져 핀 사이를 지그재그로 내려오고 **결과 목록에 오른 그 사람의 슬롯**에 정확히 도착한다. 10번 반복해도 어긋나지 않는다.
3. 매번 경로가 다르다.
4. 뽑을 때마다 슬롯 수가 줄고 남은 슬롯이 넓게 재배치된다.
5. 연출 중 버튼 비활성 + [연출 스킵] 동작.
6. 되돌리기/리셋 후 슬롯이 즉시 복구된다.
7. 숫자 탭에서 1~25로 두면 슬롯 라벨이 번호로 바뀌고 당첨 이름은 가운데 오버레이로 뜬다.

- [ ] **Step 4: Typecheck and commit**

```bash
cd apps/dashboard && npx tsc --noEmit && cd ../..
git add apps/dashboard/components/draw
git commit -m "feat(dashboard): add plinko canvas for the 07 draw page"
```

---

### Task 8: BGM 플레이어

**Files:**
- Create: `apps/dashboard/components/draw/BgmPlayer.tsx`
- Modify: `apps/dashboard/components/draw/DrawScreen.tsx`

**Interfaces:**
- Consumes: `GET /api/bgm` → `{ tracks: BgmTrack[] }`, `BgmTrack { name: string; url: string }` (Task 4)
- Produces: `BgmPlayer()` — 인자 없음

- [ ] **Step 1: Write the player**

`apps/dashboard/components/draw/BgmPlayer.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { BgmTrack } from "@/lib/draw/bgm";

const FIELD =
  "rounded-lg border border-white/[.09] bg-[#0E1117] px-2.5 py-1.5 text-[12px] text-[#E6EAF2] outline-none disabled:opacity-40";

export function BgmPlayer() {
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [selected, setSelected] = useState("");
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bgm")
      .then((res) => res.json())
      .then((data: { tracks: BgmTrack[] }) => {
        if (cancelled) return;
        setTracks(data.tracks);
        setSelected(data.tracks[0]?.url ?? "");
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, selected]);

  // Browsers refuse audio that no user gesture asked for, so playback only ever
  // starts from this button.
  function toggle() {
    const audio = audioRef.current;
    if (!audio || selected === "") return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[.07] bg-[#12161F] px-3 py-2.5">
      <span className="text-[11px] font-bold tracking-wider text-[#5C6577]">BGM</span>
      {tracks.length === 0 ? (
        <span className="text-[12px] text-[#6E7889]">BGM 없음</span>
      ) : (
        <>
          <select
            className={`${FIELD} min-w-0 flex-1`}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPlaying(false);
            }}
          >
            {tracks.map((t) => (
              <option key={t.url} value={t.url}>
                {t.name.replace(/\.mp3$/i, "")}
              </option>
            ))}
          </select>
          <button type="button" className={`${FIELD} font-semibold`} onClick={toggle}>
            {playing ? "정지" : "재생"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20 accent-[#4472C4]"
            aria-label="볼륨"
          />
          <audio ref={audioRef} src={selected} loop onEnded={() => setPlaying(false)} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Put it on both draw pages**

`apps/dashboard/components/draw/DrawScreen.tsx` — import 추가:

```tsx
import { BgmPlayer } from "./BgmPlayer";
```

그리고 오른쪽 열의 `<ResultList drawn={drawn} />` 한 줄을 다음 블록으로 교체:

```tsx
      <div className="flex flex-col gap-4">
        <BgmPlayer />
        <ResultList drawn={drawn} />
      </div>
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev --workspace=dashboard`, `/draw/ball` 과 `/draw/plinko` 둘 다 확인
확인할 것:
1. 곡 3개가 select에 뜨고 확장자는 표시되지 않는다.
2. [재생]을 누르면 소리가 나고 버튼이 [정지]로 바뀐다. 다시 누르면 멈춘다.
3. 볼륨 슬라이더가 즉시 반영된다.
4. 곡을 바꾸면 재생이 멈추고, 다시 [재생]을 눌러야 새 곡이 나온다.
5. 곡이 끝나면 반복 재생된다.
6. 뽑기 연출 중에도 재생이 끊기지 않는다.

- [ ] **Step 4: Full verification**

Run:
```bash
npm test
cd apps/dashboard && npx tsc --noEmit && npm run build
```
Expected: 테스트 전부 통과, 타입 에러 없음, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/draw
git commit -m "feat(dashboard): add bgm player to the draw pages"
```

---

## Self-Review 결과

- **스펙 커버리지**: 사이드바 06/07 → T5. 코어 상태머신 → T1. 후보 3종(회원·수동·숫자) → T2·T5. 뽑는 순간 확정 → T5 `handleDraw`. 연출 중 잠금·후보 편집 잠금·역재생 없음 → T5. 공 뽑기 → T6. 플린코(경로 생성기 분리, 슬롯 재배치, 20개 초과 번호 라벨) → T3·T7. BGM(이동·커밋, `/api/bgm` 런타임 목록, 클릭 재생) → T4·T8. 엣지(회원 0명, 후보 0/1명, 숫자 범위 검증, 수동 이름 중복·공백, BGM 없음, 캔버스 컨텍스트 없음) → T2·T5·T6·T8. 테스트 4개 파일 → T1~T4.
- **플레이스홀더 없음**: 모든 스텝에 실제 코드가 들어 있다.
- **타입 일관성**: `DrawCandidate`/`DrawState`는 T1 정의를 T2·T5~T8이 그대로 쓴다. `DrawAnimator`의 `play`/`skip`/`sync`는 T5 정의를 T6·T7이 같은 시그니처로 구현한다. `buildPlinkoPlan(rows, spacing, dx, nextIndex)`는 T3 정의를 T7이 같은 인자 순서로 호출한다. `nextManualId`는 T2에서 정의하고 T5의 `CandidateSetup`이 import 한다. `LinkedMemberOption`은 이 브랜치 기준 `{ id, name, elo }` (뽑기 코드는 등급 필드를 쓰지 않으므로 이름만 맞추면 된다).
