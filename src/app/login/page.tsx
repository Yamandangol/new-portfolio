"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/auth/actions";

const initialState: SignInState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your planner.</p>

        <label className="mt-5 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Email
          </span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            required
            className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Password
          </span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="mt-3 text-sm text-rose-600 dark:text-rose-400"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-xs text-muted">
          This is a single-user app — accounts are created from the Supabase
          dashboard, not here.
        </p>
      </form>
    </main>
  );
}
