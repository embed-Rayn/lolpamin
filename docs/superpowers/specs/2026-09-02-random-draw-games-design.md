
## 설계 변경 (2026-09-02, 구현 중)

07을 유도형 플린코에서 **실물리 구슬 레이스**로 바꿨다. 참고: [lazygyu/roulette](https://github.com/lazygyu/roulette).

- 물리엔진 **matter.js**를 의존성으로 추가한다(순수 JS, 약 90KB). "새 의존성 없음" 제약은 07에 한해 해제.
- 07은 **물리가 승자를 정한다**. 남은 후보 수만큼 구슬이 중력·핀·경사판·회전 막대를 지나 떨어지고, 골라인을 먼저 넘은 구슬이 당첨. 유도하지 않으므로 분포 균등 보장은 07에서 포기한다(출발 위치와 맵에 좌우됨). 06 공 뽑기는 기존대로 `crypto` 균등 추출 + 재생만 한다.
- 렌더러가 승자를 알게 되므로 `DrawAnimator`를 둘로 나눈다: `PlaybackAnimator.play(winner)`(06)와 `RaceAnimator.race(): Promise<DrawCandidate>`(07). 07은 레이스가 끝난 뒤 `drawById(state, id)`로 상태에 커밋한다.
- 코스 형상과 판정 규칙은 `apps/dashboard/lib/draw/marble-course.ts`에 두어 브라우저 없이 vitest로 수백 판을 돌린다. 시간 상한 25초, 상한에 걸리면 가장 앞선 구슬이 이긴다 — 구슬이 끼어도 버튼이 멈추지 않는다.
- [연출 스킵]은 프레임당 물리 스텝을 40배로 돌리는 빨리감기다.
- `lib/draw/plinko-path.ts`(유도형 경로 생성기)는 삭제했다.
