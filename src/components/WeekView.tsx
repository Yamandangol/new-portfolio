"use client";

import Link from "next/link";
import { useMemo } from "react";
import { signOut } from "@/app/auth/actions";
import WeekAgenda from "@/components/WeekAgenda";
import WeekGrid from "@/components/WeekGrid";
import {
  formatWeekHeading,
  localStartOfDay,
  shiftWeekParam,
  toDateParam,
} from "@/lib/dates";
import { layOutDay, type PositionedEvent } from "@/lib/layout";
import type { CalendarEvent, Task } from "@/lib/types";

type Props = {
  weekParam: string;
  days: string[];
  events: CalendarEvent[];
  tasks: Task[];
  userEmail: string;
  eventsError: string | null;
  tasksError: string | null;
};

export default function WeekView({
  weekParam,
  days,
  events,
  tasks,
  userEmail,
  eventsError,
  tasksError,
}: Props) {
  // One layout pass per day. Each is independent: an event is clamped to the
  // local day it falls in, so a block spanning midnight appears in both columns.
  const positionedByDay = useMemo(() => {
    const map = new Map<string, PositionedEvent[]>();
    for (const day of days) {
      map.set(day, layOutDay(events, localStartOfDay(day)));
    }
    return map;
  }, [days, events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>(days.map((d) => [d, []]));
    for (const task of tasks) {
      if (task.day && map.has(task.day)) map.get(task.day)!.push(task);
    }
    return map;
  }, [days, tasks]);

  const openTaskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [day, list] of tasksByDay) {
      map.set(day, list.filter((t) => !t.done).length);
    }
    return map;
  }, [tasksByDay]);

  const today = toDateParam(new Date());
  const containsToday = days.includes(today);
  // Jumping to the day view lands on today when it's in view, else Monday.
  const dayTarget = containsToday ? today : days[0];

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold sm:text-lg">
              {formatWeekHeading(weekParam)}
            </h1>
            <p className="truncate text-xs text-muted">{userEmail}</p>
          </div>

          <nav className="flex shrink-0 items-center gap-1">
            <Link
              href={`/week/${shiftWeekParam(weekParam, -1)}`}
              aria-label="Previous week"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas"
            >
              ‹
            </Link>
            <Link
              href={`/week/${today}`}
              aria-current={containsToday ? "page" : undefined}
              className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                containsToday
                  ? "border-accent text-accent"
                  : "border-line hover:bg-canvas"
              }`}
            >
              This week
            </Link>
            <Link
              href={`/week/${shiftWeekParam(weekParam, 1)}`}
              aria-label="Next week"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas"
            >
              ›
            </Link>
          </nav>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
            <Link
              href={`/day/${dayTarget}`}
              className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
            >
              Day
            </Link>
            <span
              aria-current="page"
              className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white"
            >
              Week
            </span>
          </div>

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

      {(eventsError || tasksError) && (
        <p
          role="alert"
          className="shrink-0 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          Couldn&apos;t load the week: {eventsError ?? tasksError}
        </p>
      )}

      {/* Time grid on a laptop, agenda on a phone. */}
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <WeekGrid
          days={days}
          positionedByDay={positionedByDay}
          openTaskCounts={openTaskCounts}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <WeekAgenda
          days={days}
          positionedByDay={positionedByDay}
          tasksByDay={tasksByDay}
        />
      </div>
    </div>
  );
}
