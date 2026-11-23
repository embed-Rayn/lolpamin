import { useEffect, useMemo, useState } from "react";
import tracks from "virtual:bgm-tracks";
import { DrawScreen } from "@/components/draw/DrawScreen";
import { loadMemberNames, saveMemberNames, toMembers } from "./members";
import { MemberEditor } from "./MemberEditor";

type Tab = "plinko" | "cannon" | "members";
type Skin = "clean" | "pink" | "dark";

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: "plinko", label: "핀볼 뽑기", desc: "핀 사이로 공을 떨어뜨려 순서를 정합니다" },
  { key: "cannon", label: "대포 뽑기", desc: "대포로 공을 쏘아 순서를 정합니다" },
  { key: "members", label: "회원 명단", desc: "뽑기에 쓸 회원 이름을 입력합니다" },
];
const SKINS: { key: Skin; label: string }[] = [
  { key: "clean", label: "기본" },
  { key: "pink", label: "핑크" },
  { key: "dark", label: "다크" },
];
const SKIN_KEY = "lolpamin.offline.skin";

function readTab(): Tab {
  const hash = window.location.hash.replace("#", "");
  return TABS.some((t) => t.key === hash) ? (hash as Tab) : "plinko";
}

function readSkin(): Skin {
  try {
    const v = window.localStorage.getItem(SKIN_KEY);
    return SKINS.some((s) => s.key === v) ? (v as Skin) : "clean";
  } catch {
    return "clean";
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  const [skin, setSkin] = useState<Skin>(readSkin);
  const [names, setNames] = useState<string[]>(loadMemberNames);
  const pool = useMemo(() => toMembers(names), [names]);
  const current = TABS.find((t) => t.key === tab)!;

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = skin;
    try {
      window.localStorage.setItem(SKIN_KEY, skin);
    } catch {
      // ignore
    }
  }, [skin]);

  return (
    <div className="min-h-screen min-w-[1100px] bg-page text-fg">
      <header className="flex items-center gap-6 border-b border-ink/[.06] bg-surface px-7 py-4">
        <div>
          <div className="text-[18px] font-extrabold">MARS 뽑기</div>
          <div className="text-[12px] text-muted">오프라인 · {current.desc}</div>
        </div>
        <nav className="flex gap-1 rounded-lg bg-page p-1">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`#${t.key}`}
              className={`rounded-md px-4 py-2 text-[13.5px] font-bold ${
                tab === t.key ? "bg-raised text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {t.label}
              {t.key === "members" && <span className="ml-1.5 font-mono text-[12px] text-faint">{names.length}</span>}
            </a>
          ))}
        </nav>
        <select
          className="ml-auto rounded-lg border border-ink/[.09] bg-page px-2.5 py-1.5 text-[13px] text-fg outline-none"
          value={skin}
          onChange={(e) => setSkin(e.target.value as Skin)}
          aria-label="스킨"
        >
          {SKINS.map((s) => (
            <option key={s.key} value={s.key}>
              스킨: {s.label}
            </option>
          ))}
        </select>
      </header>

      {tab === "members" ? (
        <MemberEditor
          names={names}
          onSave={(next) => {
            saveMemberNames(next);
            setNames(next);
          }}
        />
      ) : (
        <DrawScreen
          key={tab}
          pool={pool}
          variant={tab}
          bgmTracks={tracks}
          emptyPoolHint="입력된 회원이 없습니다. 위 「회원 명단」 탭에서 이름을 입력하거나, 아래 칸에서 바로 추가하거나, 숫자 뽑기를 쓰세요."
        />
      )}
    </div>
  );
}
