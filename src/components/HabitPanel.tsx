"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import HabitRow from "@/components/HabitRow";
import {
  addHabit,
  archiveHabit,
  incrementHabit,
  renameHabit,
  setHabitLocked,
  toggleHabit,
  type HabitResult,
} from "@/app/day/[date]/habit-actions";
import {
  computeStreak,
  logDaysForHabit,
  logsForDay,
  orderHabits,
  type HabitOptimisticAction,
} from "@/lib/habits";
import type { Habit, HabitKind, HabitLog } from "@/lib/types";

type Props = {
  dayParam: string;
  /** Already carries any pending optimistic edits — DayView owns that state. */
  habits: Habit[];
  logs: HabitLog[];
  applyOptimistic: (action: HabitOptimisticAction) => void;
};

export default function HabitPanel({
  dayParam,
  habits,
  logs,
  applyOptimistic,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mutate(
    action: HabitOptimisticAction,
    run: () => Promise<HabitResult>,
  ) {
    startTransition(async () => {
      applyOptimistic(action);
      const result = await run();
      setError(result.ok ? null : result.error);
      // Pull fresh rows inside the same transition so the optimistic value
      // stays put until the real one is ready to replace it.
      router.refresh();
    });
  }

  const active = useMemo(
    () => orderHabits(habits.filter((h) => !h.archived)),
    [habits],
  );
  const archived = useMemo(
    () => orderHabits(habits.filter((h) => h.archived)),
    [habits],
  );

  const todaysLogs = useMemo(() => logsForDay(logs, dayParam), [logs, dayParam]);

  const doneCount = active.filter(
    (h) => todaysLogs.get(h.id)?.completed,
  ).length;

  return (
    <section className="border-b border-line px-3 py-3">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Habits
        {active.length > 0 && (
          <span className="ml-1.5 font-normal normal-case">
            {doneCount}/{active.length} done
          </span>
        )}
      </h2>

      {error && (
        <p
          role="alert"
          className="mb-1 text-[11px] text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      )}

      {active.length === 0 ? (
        <p className="px-1 py-1 text-sm text-muted">
          No habits yet — add one below.
        </p>
      ) : (
        <ul>
          {active.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              log={todaysLogs.get(habit.id)}
              streak={computeStreak(
                logDaysForHabit(logs, habit.id),
                dayParam,
              )}
              onToggle={(completed) =>
                mutate(
                  {
                    type: "toggle",
                    habitId: habit.id,
                    day: dayParam,
                    completed,
                  },
                  () => toggleHabit(habit.id, dayParam, completed),
                )
              }
              onIncrement={(delta) =>
                mutate(
                  {
                    type: "increment",
                    habitId: habit.id,
                    day: dayParam,
                    delta,
                    target: habit.target,
                  },
                  () => incrementHabit(habit.id, dayParam, delta),
                )
              }
              onRename={(title) =>
                mutate({ type: "rename", habitId: habit.id, title }, () =>
                  renameHabit(habit.id, title),
                )
              }
              onArchive={() =>
                mutate(
                  { type: "archive", habitId: habit.id, archived: true },
                  () => archiveHabit(habit.id, true),
                )
              }
              onToggleLock={() =>
                mutate(
                  { type: "lock", habitId: habit.id, locked: !habit.locked },
                  () => setHabitLocked(habit.id, !habit.locked),
                )
              }
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <ul className="mt-2 border-t border-line pt-2">
          {archived.map((habit) => (
            <li
              key={habit.id}
              className="flex items-center gap-2 rounded-md px-1 py-1"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                {habit.icon && (
                  <span aria-hidden className="mr-1">
                    {habit.icon}
                  </span>
                )}
                {habit.title}
              </span>
              <button
                type="button"
                onClick={() =>
                  mutate(
                    { type: "archive", habitId: habit.id, archived: false },
                    () => archiveHabit(habit.id, false),
                  )
                }
                className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-ink"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewHabit
        onCreate={(title, kind, target, unit) =>
          mutate(
            {
              type: "add",
              habit: {
                id: `optimistic-${crypto.randomUUID()}`,
                title,
                icon: null,
                color: "indigo",
                kind,
                target: kind === "boolean" ? 1 : target,
                unit: unit || null,
                // Sorts to the end next to the real row's appended position.
                position: Date.now(),
                archived: false,
                locked: false,
              },
            },
            () => addHabit(title, kind, target, unit),
          )
        }
      />
    </section>
  );
}

// ---------------------------------------------------------------------------

function NewHabit({
  onCreate,
}: {
  onCreate: (
    title: string,
    kind: HabitKind,
    target: number,
    unit: string,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<HabitKind>("boolean");
  const [target, setTarget] = useState(8);
  const [unit, setUnit] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 px-1 py-1 text-left text-sm text-muted hover:text-ink"
      >
        + New habit
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onCreate(trimmed, kind, Math.max(1, Math.floor(target) || 1), unit.trim());
        setTitle("");
        setUnit("");
        setOpen(false);
      }}
      className="mt-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Habit name"
        aria-label="Habit name"
        autoFocus
        className="w-full rounded-lg border border-line-strong bg-canvas px-2.5 py-2 text-sm outline-none focus:border-accent"
      />

      <div className="mt-2 flex items-center gap-2">
        {(
          [
            ["boolean", "Yes/no"],
            ["count", "Count"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`rounded-lg border px-2 py-1 text-xs ${
              kind === value
                ? "border-accent text-accent"
                : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "count" && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={999}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            aria-label="Daily target"
            className="w-16 rounded-lg border border-line-strong bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="unit (glasses, min)"
            aria-label="Unit"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
