import { SPEED_TICKS, sliderToSpeed, speedToSlider } from "@/lib/draw/speed";

const BUTTON = "rounded-lg px-4 py-2.5 text-[14px] font-bold transition-colors disabled:opacity-35";

// 슬라이더는 0~1 위치를 다루고 배속 변환은 speed.ts가 한다. step을 잘게 두면 로그스케일
// 위에서 배율이 촘촘하게 움직인다.
const SLIDER_STEP = 0.001;

function formatSpeed(speed: number): string {
  if (speed >= 1) return `${Number(speed.toFixed(2))}x`;
  // 1x 아래는 배수보다 분수가 읽기 쉽다 — 1/8x가 0.13x보다 눈에 들어온다.
  return `1/${Number((1 / speed).toFixed(1))}x`;
}

export interface DrawControlsProps {
  canDraw: boolean;
  canUndo: boolean;
  canReset: boolean;
  isAnimating: boolean;
  onDraw: () => void;
  onUndo: () => void;
  onReset: () => void;
  onSkip: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
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
  speed,
  onSpeedChange,
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

      {/* 연출 도중에도 움직인다 — 느리게 깔다가 마지막에 올리는 식으로 쓴다. */}
      <label className="ml-2 flex items-center gap-2 text-[12.5px] text-[#8A94A6]">
        <span className="whitespace-nowrap">속도</span>
        <input
          type="range"
          min={0}
          max={1}
          step={SLIDER_STEP}
          list="draw-speed-ticks"
          value={speedToSlider(speed)}
          onChange={(e) => onSpeedChange(sliderToSpeed(Number(e.target.value)))}
          className="h-1 w-32 cursor-pointer accent-[#4472C4]"
          aria-label="연출 속도"
        />
        <datalist id="draw-speed-ticks">
          {SPEED_TICKS.map((tick) => (
            <option key={tick} value={speedToSlider(tick)} label={formatSpeed(tick)} />
          ))}
        </datalist>
        <span className="w-11 whitespace-nowrap text-right font-mono text-[#C7D0DF]">
          {formatSpeed(speed)}
        </span>
      </label>
    </div>
  );
}
