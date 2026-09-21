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
      className={`rounded-lg px-4 py-2 text-[13.5px] font-extrabold ${
        pending ? "cursor-not-allowed bg-hover text-ghost" : "cursor-pointer bg-accent text-white"
      }`}
    >
      {pending ? "확인 중..." : "로그인"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-[320px] flex-col gap-3 rounded-xl border border-ink/[.06] bg-surface p-5">
      <div className="text-[13.5px] font-bold">관리자 로그인</div>
      <input
        name="username"
        autoComplete="username"
        placeholder="아이디"
        className="rounded-lg border border-ink/[.08] bg-inset px-3 py-2 text-[13.5px] text-fg outline-none"
      />
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        className="rounded-lg border border-ink/[.08] bg-inset px-3 py-2 text-[13.5px] text-fg outline-none"
      />
      {state.error && (
        <div className="rounded-lg border border-danger/30 bg-danger/[.12] p-2.5 text-[12px] text-danger-soft">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
