// 카카오톡 쪽 메뉴 이름은 그 앱에 뜨는 문구 그대로 적는다 — 화면을 보면서 따라가는
// 안내라, 여기서 말을 바꾸면 찾을 수 없는 메뉴가 된다.
const STEPS = [
  { body: "오픈 카톡방 ", room: "게임구인방", tail: " 들어가기" },
  { body: "햄버거 버튼(≡) 클릭" },
  { body: "대화 내용" },
  { body: "대화 내보내기" },
  { body: "txt 파일로 저장한 뒤 아래에 업로드" },
];

export function KakaoImportGuide() {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-bold">불러오는 방법</span>
        <span className="text-[12px] text-[#6E7889]">
          카카오톡에서 대화 내용을 txt로 저장한 다음, 그 파일을 여기에 올립니다.
        </span>
      </div>

      <ol className="flex flex-col gap-2">
        {STEPS.map((step, index) => (
          <li key={step.body} className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#1E2534] font-mono text-[11.5px] font-bold text-[#8FB4F5]">
              {index + 1}
            </span>
            <span className="text-[13px] text-[#B7C0D0]">
              {step.body}
              {step.room && <span className="font-extrabold text-[#EE8B8B]">{step.room}</span>}
              {step.tail}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-1 rounded-lg border border-[#F2C75C]/25 bg-[#F2C75C]/[.08] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#E3C77A]">
        <span className="font-bold">업로드 후 운영진은 「대화 내용 모두 삭제」를 권합니다.</span>
        <span className="text-[#C9B074]">
          이미 반영한 시점보다 오래된 멘션은 다시 올려도 건너뛰므로, 지워도 기록은 그대로 남습니다. 다음 내보내기 파일이
          작아지고, 회원들의 실명이 담긴 대화가 기기에 쌓이지 않습니다.
        </span>
      </div>
    </div>
  );
}
