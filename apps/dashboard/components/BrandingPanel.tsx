"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBrandingAction } from "@/app/admins/actions";
import { BrandLogo } from "./BrandLogo";
import type { Branding } from "@/lib/queries/branding";

const GUIDE_URL = "https://icon-icons.com/ko/ui-icons";

export function BrandingPanel({ current, updatedLabel }: { current: Branding; updatedLabel: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    // 어느 버튼을 눌렀는지 폼 하나로는 자동으로 안 실린다 — 누른 버튼의 name/value를
    // 직접 얹는다. 엔터로 제출하면(submitter 없음) 주 저장 버튼을 누른 것과 같다.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);

    setError(null);
    startTransition(async () => {
      const result = await setBrandingAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-ink/[.06] bg-surface">
      <div className="flex items-center justify-between border-b border-ink/[.06] px-5 py-3.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-bold">브랜딩</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-faint">좌상단 로고와 홈 화면 배너를 바꿉니다.</p>
        </div>
        <div className="text-[12px] text-faint">{updatedLabel ? `마지막 변경 ${updatedLabel}` : "기본값"}</div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="logoSvg" className="text-[13px] font-bold text-fg-2">
              로고 SVG
            </label>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-label="로고 SVG 구하는 방법"
              aria-expanded={showGuide}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-tint text-[11px] font-bold text-accent"
            >
              i
            </button>
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent-tint text-accent">
              <BrandLogo logoSvg={current.logoSvg} size={20} />
            </div>
          </div>
          {showGuide && (
            <div className="rounded-lg border border-ink/[.08] bg-inset p-3 text-[12.5px] leading-relaxed text-fg-2">
              <ol className="m-0 list-decimal pl-4">
                <li>
                  <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-accent-soft underline">
                    icon-icons.com
                  </a>
                  에서 원하는 아이콘을 찾는다.
                </li>
                <li>아이콘 페이지에서 &quot;SVG 복사하기&quot;를 누른다(또는 다운로드해서 파일을 텍스트로 연다).</li>
                <li>복사한 코드를 아래 칸에 그대로 붙여넣고 저장한다.</li>
              </ol>
            </div>
          )}
          <textarea
            id="logoSvg"
            name="logoSvg"
            defaultValue={current.logoSvg ?? ""}
            placeholder="<svg ...>...</svg> — 비워두면 기본 아이콘을 씁니다"
            rows={4}
            className="w-full rounded-lg border border-ink/[.09] bg-inset px-2.5 py-2 font-mono text-[12px] text-fg outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteName" className="text-[13px] font-bold text-fg-2">
              사이트 이름
            </label>
            <input
              id="siteName"
              name="siteName"
              defaultValue={current.siteName}
              maxLength={40}
              className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="siteTagline" className="text-[13px] font-bold text-fg-2">
              부제
            </label>
            <input
              id="siteTagline"
              name="siteTagline"
              defaultValue={current.siteTagline}
              maxLength={80}
              className="rounded-lg border border-ink/[.09] bg-inset px-2.5 py-1.5 text-[13.5px] text-fg outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-fg-2">홈 배너 · 데스크톱</label>
            {current.hasDesktopBanner ? (
              <img src="/api/branding/banner/desktop" alt="" className="h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12px] text-faint">
                기본 이미지 사용 중
              </div>
            )}
            <input
              type="file"
              name="homeBannerDesktop"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="text-[12px]"
            />
            {current.hasDesktopBanner && (
              <button
                type="submit"
                name="resetDesktop"
                value="1"
                disabled={isPending}
                className="self-start text-[12px] font-semibold text-danger-soft hover:underline disabled:opacity-40"
              >
                기본값으로
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-fg-2">홈 배너 · 모바일</label>
            {current.hasMobileBanner ? (
              <img src="/api/branding/banner/mobile" alt="" className="h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-ink/[.12] text-[12px] text-faint">
                데스크톱 배너를 그대로 씀
              </div>
            )}
            <input
              type="file"
              name="homeBannerMobile"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="text-[12px]"
            />
            {current.hasMobileBanner && (
              <button
                type="submit"
                name="resetMobile"
                value="1"
                disabled={isPending}
                className="self-start text-[12px] font-semibold text-danger-soft hover:underline disabled:opacity-40"
              >
                기본값으로
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            저장
          </button>
          {error && <span className="text-[12.5px] text-danger-soft">{error}</span>}
        </div>
      </form>
    </section>
  );
}
