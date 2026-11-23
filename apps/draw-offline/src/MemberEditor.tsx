import { useRef, useState } from "react";
import { parseMemberNames } from "./members";

const FIELD =
  "rounded-lg border border-ink/[.09] bg-page px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent";

export function MemberEditor({
  names,
  onSave,
}: {
  names: string[];
  onSave: (names: string[]) => void;
}) {
  const [text, setText] = useState(names.join("\n"));
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = parseMemberNames(text);
  const dirty = parsed.join("\n") !== names.join("\n");

  function save() {
    onSave(parsed);
    setText(parsed.join("\n"));
    setNotice(`${parsed.length}명 저장했습니다.`);
  }

  function exportFile() {
    const blob = new Blob([names.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MARS-회원명단.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    const imported = parseMemberNames(await file.text());
    setText(imported.join("\n"));
    setNotice(`파일에서 ${imported.length}명을 읽었습니다. 저장을 눌러야 반영됩니다.`);
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-7 pb-10 pt-6">
      <div className="flex flex-col gap-3 rounded-xl border border-ink/[.07] bg-surface-2 p-4">
        <div className="text-[13.5px] text-muted">
          한 줄에 한 명씩 이름을 적고 저장하세요. 이 브라우저에만 저장됩니다. 다른 PC로 옮길 때는
          파일로 내보내서 불러오세요. (.txt 한 줄 한 명, 또는 이름 배열 .json)
        </div>
        <textarea
          className={`${FIELD} h-[420px] resize-y font-mono leading-6`}
          value={text}
          placeholder={"홍길동\n김철수\n이영희"}
          onChange={(e) => {
            setText(e.target.value);
            setNotice(null);
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-accent px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-40"
            disabled={!dirty}
            onClick={save}
          >
            저장 ({parsed.length}명)
          </button>
          <button type="button" className={`${FIELD} font-semibold`} onClick={() => setText(names.join("\n"))} disabled={!dirty}>
            되돌리기
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" className={`${FIELD} font-semibold`} onClick={() => fileRef.current?.click()}>
              파일 불러오기
            </button>
            <button type="button" className={`${FIELD} font-semibold`} onClick={exportFile} disabled={names.length === 0}>
              파일로 내보내기
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.json,text/plain,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {notice && <div className="text-[12.5px] text-accent-soft">{notice}</div>}
        {dirty && !notice && <div className="text-[12.5px] text-orange">저장하지 않은 변경이 있습니다.</div>}
      </div>
    </div>
  );
}
