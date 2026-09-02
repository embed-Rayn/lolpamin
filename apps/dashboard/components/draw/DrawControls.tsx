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
