"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toDateParam } from "@/lib/dates";

/**
 * "Today" only means something in a timezone, and the server doesn't know the
 * browser's — so the redirect happens client-side where the answer is correct.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/day/${toDateParam(new Date())}`);
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center">
      <p className="text-sm text-muted">Opening today…</p>
    </main>
  );
}
