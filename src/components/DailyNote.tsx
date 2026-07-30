"use client";

import { useEffect, useRef, useState } from "react";
import { saveDailyNote } from "@/app/day/[date]/actions";

type Props = {
  dayParam: string;
  initialBody: string;
};

/** Pause after typing before writing to the server. */
const AUTOSAVE_DELAY_MS = 800;

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Free-text note for one day, autosaved. Deliberately uncontrolled by the
 * server after mount: re-syncing from props mid-typing would fight the cursor,
 * and only one person is ever editing this.
 */
export default function DailyNote({ dayParam, initialBody }: Props) {
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Tracks what the server last accepted, so we don't save an unchanged value.
  const savedRef = useRef(initialBody);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resetting state when the day changes is handled by remounting — DayView
  // passes key={dayParam} — rather than syncing props into state in an effect.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (next === savedRef.current) return;

      setStatus("saving");
      const result = await saveDailyNote(dayParam, next);
      if (result.ok) {
        savedRef.current = next;
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="shrink-0 border-b border-line px-3 py-3">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Note
        </h2>
        <span className="text-[11px] text-muted" aria-live="polite">
          {status === "saving" && "Saving…"}
          {status === "saved" && "Saved"}
          {status === "error" && (
            <span className="text-rose-600 dark:text-rose-400">{error}</span>
          )}
        </span>
      </div>

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setStatus("idle");
          scheduleSave(e.target.value);
        }}
        onBlur={() => {
          // Don't wait out the debounce when focus leaves.
          if (timerRef.current) clearTimeout(timerRef.current);
          if (body !== savedRef.current) scheduleSave(body);
        }}
        placeholder="Anything worth remembering about this day…"
        rows={3}
        aria-label={`Note for ${dayParam}`}
        className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
    </section>
  );
}
