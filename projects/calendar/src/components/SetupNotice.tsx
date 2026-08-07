/**
 * Shown instead of a 500 when the Supabase environment variables are missing —
 * i.e. on a fresh clone before `.env.local` exists.
 */
export default function SetupNotice() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold">Finish setup</h1>
        <p className="mt-2 text-sm text-muted">
          Supabase isn&apos;t configured yet. Copy{" "}
          <code className="rounded bg-canvas px-1 py-0.5">.env.local.example</code>{" "}
          to{" "}
          <code className="rounded bg-canvas px-1 py-0.5">.env.local</code>, fill
          in your project URL and anon key, then restart{" "}
          <code className="rounded bg-canvas px-1 py-0.5">npm run dev</code>.
        </p>
        <p className="mt-3 text-sm text-muted">
          Full steps are in{" "}
          <code className="rounded bg-canvas px-1 py-0.5">PROJECT.md</code>.
        </p>
      </div>
    </main>
  );
}
