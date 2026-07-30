"use client";

import { useState } from "react";
import { habitProgress } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";

type Props = {
  habit: Habit;
  /** Today's log for this habit, if one has been written. */
  log: HabitLog | undefined;
  /** Consecutive completed days ending on the day being viewed. */
  streak: number;
  onToggle: (completed: boolean) => void;
  onIncrement: (delta: number) => void;
  onRename: (title: string) => void;
  onArchive: () => void;
};

export default function HabitRow({
  habit,
  log,
  streak,
  onToggle,
  onIncrement,
  onRename,
  onArchive,
}: Props) {
  // `draft` only exists while editing, seeded at the moment editing starts —
  // so there is nothing to keep in sync with incoming props (same as TaskRow).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEditing() {
    setDraft(habit.title);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    // Clearing the field is a cancel, not a delete.
    if (trimmed && trimmed !== habit.title) onRename(trimmed);
  }

  const { value, target, completed, fraction } = habitProgress(habit, log);
  const isCount = habit.kind === "count";

  const title = (
    <>
      {habit.icon && (
        <span aria-hidden className="mr-1">
          {habit.icon}
        </span>
      )}
      {habit.title}
    </>
  );

  return (
    <li className="group rounded-md px-1 py-1 hover:bg-canvas">
      <div className="flex items-center gap-2">
        {!isCount && (
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={
              completed ? `Untick ${habit.title}` : `Tick ${habit.title}`
            }
            className="size-4 shrink-0 accent-[var(--color-accent)]"
          />
        )}

        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={`min-w-0 flex-1 truncate text-left text-sm ${
              completed && !isCount ? "text-muted line-through" : ""
            }`}
          >
            {title}
          </button>
        )}

        {streak > 0 && (
          <span
            title={`${streak} day streak`}
            aria-label={`${streak} day streak`}
            className="shrink-0 text-[11px] tabular-nums text-muted"
          >
            🔥{streak}
          </span>
        )}

        {isCount ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onIncrement(-1)}
              disabled={value === 0}
              aria-label={`Decrease ${habit.title}`}
              // 32px rather than the 24px a dense list would suggest: these are
              // the most-tapped controls in the app (eight taps a day for a
              // glasses-of-water habit) and 24px is an awkward phone target.
              className="size-8 rounded border border-line text-muted hover:text-ink disabled:opacity-40"
            >
              −
            </button>
            <span
              className={`min-w-14 text-center text-xs tabular-nums ${
                completed ? "font-semibold text-accent" : "text-muted"
              }`}
            >
              {value}/{target}
              {habit.unit && <span className="ml-0.5">{habit.unit}</span>}
            </span>
            <button
              type="button"
              onClick={() => onIncrement(1)}
              disabled={value >= target}
              aria-label={`Increase ${habit.title}`}
              // 32px rather than the 24px a dense list would suggest: these are
              // the most-tapped controls in the app (eight taps a day for a
              // glasses-of-water habit) and 24px is an awkward phone target.
              className="size-8 rounded border border-line text-muted hover:text-ink disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onArchive}
          aria-label={`Archive ${habit.title}`}
          title="Archive"
          className="shrink-0 rounded px-1 text-muted hover:text-rose-600 dark:hover:text-rose-400"
        >
          ×
        </button>
      </div>

      {isCount && (
        <div
          // The number beside the buttons is the accessible value; the bar is
          // decoration on top of it.
          aria-hidden
          className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted/25"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
    </li>
  );
}
