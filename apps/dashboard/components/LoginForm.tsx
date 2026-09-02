"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginFormState } from "@/app/login/actions";

const initialState: LoginFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-[12.5px] font-extrabold ${
        pending ? "cursor-not-allowed bg-[#1E2534] text-[#5C6577]" : "cursor-pointer bg-[#4472C4] text-white"
      }`}
    >
      {pending ? "확인 중..." : "로그인"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="flex w-[320px] flex-col gap-3 rounded-xl border border-white/[.06] bg-[#151A24] p-5">
      <div className="text-[12.5px] font-bold">관리자 로그인</div>
      <input
        name="username"
        autoComplete="username"
        placeholder="아이디"
        className="rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        className="rounded-lg border border-white/[.08] bg-[#0F131B] px-3 py-2 text-[12.5px] text-[#E6EAF2] outline-none"
      />
      {state.error && (
        <div className="rounded-lg border border-[#E05A5A]/30 bg-[#E05A5A]/[.12] p-2.5 text-[11px] text-[#EE8B8B]">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
