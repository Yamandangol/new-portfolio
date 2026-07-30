"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState } from "react";
import { format } from "date-fns";
import { signOut } from "@/app/auth/actions";
import ScheduleGrid from "@/components/ScheduleGrid";
import TaskPanel from "@/components/TaskPanel";
import { localStartOfDay, shiftDateParam, toDateParam } from "@/lib/dates";
import { layOutDay } from "@/lib/layout";
import { reduceTasks } from "@/lib/tasks";
import type { CalendarEvent, Task, TaskList } from "@/lib/types";

type Props = {
  dayParam: string;
  events: CalendarEvent[];
  lists: TaskList[];
  tasks: Task[];
  userEmail: string;
  eventsError: string | null;
  tasksError: string | null;
};

/** Which pane is showing on a phone. Both are always visible on a laptop. */
type Pane = "schedule" | "tasks";

export default function DayView({
  dayParam,
  events,
  lists,
  tasks,
  userEmail,
  eventsError,
  tasksError,
}: Props) {
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("schedule");

  const dayStart = useMemo(() => localStartOfDay(dayParam), [dayParam]);
  const positioned = useMemo(
    () => layOutDay(events, dayStart),
    [events, dayStart],
  );

  // The optimistic list lives here rather than inside TaskPanel so the tab
  // badge below and the panel's rows can't disagree: ticking a task has to
  // move the count immediately, not after the server round-trip lands.
  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, reduceTasks);

  const isToday = toDateParam(new Date()) === dayParam;
  const openToday = optimisticTasks.filter(
    (t) => t.day === dayParam && !t.done,
  ).length;

  return (
    <div className="flex h-dvh flex-col">
      {/* ---- header --------------------------------------------------- */}
      <header className="shrink-0 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold sm:text-lg">
              <span className="sm:hidden">
                {format(dayStart, "EEE d MMM yyyy")}
              </span>
              <span className="hidden sm:inline">
                {format(dayStart, "EEEE, d MMMM yyyy")}
              </span>
            </h1>
            <p className="truncate text-xs text-muted">{userEmail}</p>
          </div>

          <nav className="flex shrink-0 items-center gap-1">
            <Link
              href={`/day/${shiftDateParam(dayParam, -1)}`}
              aria-label="Previous day"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas"
            >
              ‹
            </Link>
            <Link
              href={`/day/${toDateParam(new Date())}`}
              aria-current={isToday ? "page" : undefined}
              className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                isToday
                  ? "border-accent text-accent"
                  : "border-line hover:bg-canvas"
              }`}
            >
              Today
            </Link>
            <Link
              href={`/day/${shiftDateParam(dayParam, 1)}`}
              aria-label="Next day"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas"
            >
              ›
            </Link>
          </nav>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            value={dayParam}
            aria-label="Jump to date"
            onChange={(e) => {
              if (e.target.value) router.push(`/day/${e.target.value}`);
            }}
            className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs outline-none focus:border-accent"
          />

          <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
            <span
              aria-current="page"
              className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white"
            >
              Day
            </span>
            <Link
              href={`/week/${dayParam}`}
              className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
            >
              Week
            </Link>
          </div>

          {/* Phone: one pane at a time. Laptop: both, so this is hidden. */}
          <div
            role="tablist"
            aria-label="Pane"
            className="flex items-center gap-1 rounded-lg border border-line p-0.5 lg:hidden"
          >
            {(
              [
                ["schedule", "Schedule", positioned.length],
                ["tasks", "Tasks", openToday],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={pane === value}
                onClick={() => setPane(value)}
                className={`rounded-md px-2 py-1 text-xs ${
                  pane === value
                    ? "bg-accent font-semibold text-white"
                    : "text-muted"
                }`}
              >
                {label}
                {count > 0 && <span className="ml-1 tabular-nums">{count}</span>}
              </button>
            ))}
          </div>

          <span className="hidden text-xs text-muted lg:inline">
            {positioned.length === 0
              ? "Nothing scheduled"
              : `${positioned.length} block${positioned.length === 1 ? "" : "s"}`}
          </span>

          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {eventsError && (
        <p
          role="alert"
          className="shrink-0 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          Couldn&apos;t load the schedule: {eventsError}
        </p>
      )}

      {/* ---- body ----------------------------------------------------- */}
      <div className="flex min-h-0 flex-1">
        {/* Both panes stay mounted so switching tabs keeps scroll position. */}
        <div
          className={`min-h-0 flex-1 flex-col ${
            pane === "schedule" ? "flex" : "hidden"
          } lg:flex`}
        >
          <ScheduleGrid dayParam={dayParam} positioned={positioned} />
        </div>

        <aside
          aria-label="Tasks"
          className={`min-h-0 w-full flex-col ${
            pane === "tasks" ? "flex" : "hidden"
          } lg:flex lg:w-80 lg:shrink-0 lg:border-l lg:border-line xl:w-96`}
        >
          <TaskPanel
            dayParam={dayParam}
            lists={lists}
            tasks={optimisticTasks}
            applyOptimistic={applyOptimistic}
            loadError={tasksError}
          />
        </aside>
      </div>
    </div>
  );
}
